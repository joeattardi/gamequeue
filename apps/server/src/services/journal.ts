import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
    MAX_IMAGES_PER_POST,
    type CreatePostInput,
    type JournalDto,
    type JournalPostDto,
    type PatchPostInput,
    type PostDto,
    type PostImageDto,
    type ProfileJournalDto,
    type Visibility
} from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import {
    entries,
    games,
    platforms,
    playthroughPosts,
    playthroughs,
    postImages,
    users
} from '../db/schema.js';
import { HttpError } from '../errors.js';
import { storeImage } from './screenshots.js';

/** Total minutes logged by the hours posts of each playthrough (absent = nothing logged). */
export function loggedMinutesFor(db: Db, playthroughIds: number[]): Map<number, number> {
    const out = new Map<number, number>();
    if (playthroughIds.length === 0) return out;
    for (const r of db
        .select({
            id: playthroughPosts.playthroughId,
            minutes: sql<number>`coalesce(sum(${playthroughPosts.minutes}), 0)`
        })
        .from(playthroughPosts)
        .where(
            and(
                inArray(playthroughPosts.playthroughId, playthroughIds),
                eq(playthroughPosts.kind, 'hours')
            )
        )
        .groupBy(playthroughPosts.playthroughId)
        .all())
        out.set(r.id, r.minutes);
    return out;
}

function requireOwnPlaythrough(db: Db, userId: number, id: number) {
    const row = db
        .select()
        .from(playthroughs)
        .where(and(eq(playthroughs.id, id), eq(playthroughs.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Playthrough not found');
    return row;
}

/** Another user's post is a 404, the same as one that does not exist. */
function requireOwnPost(db: Db, userId: number, id: number) {
    const row = db
        .select()
        .from(playthroughPosts)
        .where(and(eq(playthroughPosts.id, id), eq(playthroughPosts.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Post not found');
    return row;
}

function imagesOf(db: Db, postIds: number[]): Map<number, PostImageDto[]> {
    const out = new Map<number, PostImageDto[]>();
    if (postIds.length === 0) return out;
    for (const r of db
        .select()
        .from(postImages)
        .where(inArray(postImages.postId, postIds))
        .orderBy(asc(postImages.id))
        .all())
        (out.get(r.postId) ?? out.set(r.postId, []).get(r.postId)!).push({
            id: r.id,
            width: r.width,
            height: r.height,
            bytes: r.bytes
        });
    return out;
}

function toPostDtos(db: Db, rows: (typeof playthroughPosts.$inferSelect)[]): PostDto[] {
    const images = imagesOf(
        db,
        rows.map((r) => r.id)
    );
    return rows.map((p) => ({
        id: p.id,
        playthroughId: p.playthroughId,
        kind: p.kind,
        body: p.body,
        minutes: p.minutes,
        spoiler: p.spoiler,
        createdAt: p.createdAt,
        images: images.get(p.id) ?? []
    }));
}

const postsQuery = (db: Db, playthroughId: number) =>
    db
        .select()
        .from(playthroughPosts)
        .where(eq(playthroughPosts.playthroughId, playthroughId))
        .orderBy(asc(playthroughPosts.createdAt), asc(playthroughPosts.id));

/** The owner's view of a journal: all posts, oldest first. */
export function listPosts(db: Db, userId: number, playthroughId: number): PostDto[] {
    requireOwnPlaythrough(db, userId, playthroughId);
    return toPostDtos(db, postsQuery(db, playthroughId).all());
}

export function createPost(
    db: Db,
    userId: number,
    playthroughId: number,
    input: CreatePostInput
): PostDto {
    requireOwnPlaythrough(db, userId, playthroughId);
    const row = db
        .insert(playthroughPosts)
        .values({
            playthroughId,
            userId,
            kind: input.kind,
            body: input.body ?? '',
            minutes: input.kind === 'hours' ? input.minutes : null,
            spoiler: input.spoiler ?? false
        })
        .returning()
        .get();
    return toPostDtos(db, [row])[0]!;
}

export function patchPost(db: Db, userId: number, id: number, patch: PatchPostInput): PostDto {
    const post = requireOwnPost(db, userId, id);
    if (patch.minutes !== undefined && post.kind !== 'hours')
        throw new HttpError(400, 'Only an hours post has minutes');
    if (patch.body !== undefined && post.kind === 'note' && patch.body === '')
        throw new HttpError(400, 'Write something first');
    const row = db
        .update(playthroughPosts)
        .set(patch)
        .where(eq(playthroughPosts.id, id))
        .returning()
        .get();
    return toPostDtos(db, [row])[0]!;
}

/** Deletes a post; its image rows go with it (the caller removes the files, see `imageFilesOf`). */
export function deletePost(db: Db, userId: number, id: number) {
    requireOwnPost(db, userId, id);
    db.delete(playthroughPosts).where(eq(playthroughPosts.id, id)).run();
}

export async function addImage(
    db: Db,
    config: Config,
    userId: number,
    postId: number,
    upload: Buffer
): Promise<PostDto> {
    const post = requireOwnPost(db, userId, postId);
    if (post.kind !== 'screenshot') throw new HttpError(400, 'Only a screenshot post holds images');
    const count = db
        .select({ n: sql<number>`count(*)` })
        .from(postImages)
        .where(eq(postImages.postId, postId))
        .get()!.n;
    if (count >= MAX_IMAGES_PER_POST)
        throw new HttpError(400, `A post holds at most ${MAX_IMAGES_PER_POST} images`);
    const stored = await storeImage(db, config, upload);
    db.insert(postImages)
        .values({ postId, ...stored })
        .run();
    return toPostDtos(db, [requireOwnPost(db, userId, postId)])[0]!;
}

/** Removes one image row (the caller removes the file). */
export function deleteImage(db: Db, userId: number, imageId: number) {
    const row = db
        .select({ id: postImages.id })
        .from(postImages)
        .innerJoin(playthroughPosts, eq(playthroughPosts.id, postImages.postId))
        .where(and(eq(postImages.id, imageId), eq(playthroughPosts.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Image not found');
    db.delete(postImages).where(eq(postImages.id, imageId)).run();
}

/** The stored file of one of the user's own images, whatever the journal's visibility. */
export function ownImageFile(db: Db, userId: number, imageId: number): string {
    const row = db
        .select({ f: postImages.fileName })
        .from(postImages)
        .innerJoin(playthroughPosts, eq(playthroughPosts.id, postImages.postId))
        .where(and(eq(postImages.id, imageId), eq(playthroughPosts.userId, userId)))
        .get();
    if (!row) throw new HttpError(404, 'Image not found');
    return row.f;
}

/** A fresh link token: 128 random bits, URL-safe. */
export const newSlug = () => randomBytes(16).toString('base64url');

/**
 * Sets who can read the journal. Going from private to shared mints the link; going back to private
 * deletes it, so the page and its image URLs stop working at once and an old link stays dead.
 */
export function setVisibility(
    db: Db,
    userId: number,
    playthroughId: number,
    visibility: Visibility
): { visibility: Visibility; shareSlug: string | null } {
    const p = requireOwnPlaythrough(db, userId, playthroughId);
    const shareSlug = visibility === 'private' ? null : (p.shareSlug ?? newSlug());
    db.update(playthroughs)
        .set({ visibility, shareSlug })
        .where(eq(playthroughs.id, playthroughId))
        .run();
    return { visibility, shareSlug };
}

/** The playthrough behind a link token, if its journal is shared and the owner's account is confirmed. */
function sharedPlaythrough(db: Db, slug: string) {
    const row = db
        .select({ p: playthroughs, u: users, g: games, platform: platforms })
        .from(playthroughs)
        .innerJoin(users, eq(users.id, playthroughs.userId))
        .innerJoin(entries, eq(entries.id, playthroughs.entryId))
        .innerJoin(games, eq(games.id, entries.gameId))
        .leftJoin(platforms, eq(platforms.id, playthroughs.platformId))
        .where(and(eq(playthroughs.shareSlug, slug), ne(playthroughs.visibility, 'private')))
        .get();
    if (!row || row.u.emailVerifiedAt === null) throw new HttpError(404, 'Not found');
    return row;
}

/** True when the slug names a shared journal (for the page's indexing rules and link preview). */
export function journalExists(db: Db, slug: string): boolean {
    try {
        sharedPlaythrough(db, slug);
        return true;
    } catch {
        return false;
    }
}

/** What anyone with the link may read. Private entry notes are not part of a journal. */
export function getJournal(db: Db, slug: string): JournalDto {
    const { p, u, g, platform } = sharedPlaythrough(db, slug);
    const posts: JournalPostDto[] = toPostDtos(db, postsQuery(db, p.id).all()).map((x) => ({
        id: x.id,
        kind: x.kind,
        body: x.body,
        minutes: x.minutes,
        spoiler: x.spoiler,
        createdAt: x.createdAt,
        images: x.images
    }));
    return {
        slug,
        game: { id: g.id, name: g.name, coverImageId: g.coverImageId },
        owner: { username: u.username },
        platform: platform ? { name: platform.name, abbreviation: platform.abbreviation } : null,
        startedOn: p.startedOn,
        endedOn: p.endedOn,
        outcome: p.outcome,
        rating: p.rating,
        playtimeMinutes: p.playtimeMinutes,
        finalThoughts: p.finalThoughts,
        posts
    };
}

/** The stored file of an image in a shared journal; a private journal's images are a 404. */
export function sharedImageFile(db: Db, slug: string, imageId: number): string {
    const { p } = sharedPlaythrough(db, slug);
    const row = db
        .select({ f: postImages.fileName })
        .from(postImages)
        .innerJoin(playthroughPosts, eq(playthroughPosts.id, postImages.postId))
        .where(and(eq(postImages.id, imageId), eq(playthroughPosts.playthroughId, p.id)))
        .get();
    if (!row) throw new HttpError(404, 'Not found');
    return row.f;
}

/** The owner's public journals (not unlisted ones), newest activity first. */
export function profileJournals(db: Db, username: string): ProfileJournalDto[] {
    const user = db
        .select({ id: users.id, verified: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.username, username))
        .get();
    if (!user || user.verified === null) throw new HttpError(404, 'Not found');
    const rows = db
        .select({ p: playthroughs, g: games })
        .from(playthroughs)
        .innerJoin(entries, eq(entries.id, playthroughs.entryId))
        .innerJoin(games, eq(games.id, entries.gameId))
        .where(and(eq(playthroughs.userId, user.id), eq(playthroughs.visibility, 'public')))
        .orderBy(desc(playthroughs.endedOn), desc(playthroughs.startedOn), desc(playthroughs.id))
        .all();
    const counts = new Map(
        db
            .select({ id: playthroughPosts.playthroughId, n: sql<number>`count(*)` })
            .from(playthroughPosts)
            .where(
                inArray(
                    playthroughPosts.playthroughId,
                    rows.map((r) => r.p.id)
                )
            )
            .groupBy(playthroughPosts.playthroughId)
            .all()
            .map((r) => [r.id, r.n])
    );
    return rows.flatMap(({ p, g }) =>
        p.shareSlug
            ? [
                  {
                      slug: p.shareSlug,
                      game: { id: g.id, name: g.name, coverImageId: g.coverImageId },
                      outcome: p.outcome,
                      startedOn: p.startedOn,
                      endedOn: p.endedOn,
                      rating: p.rating,
                      posts: counts.get(p.id) ?? 0
                  }
              ]
            : []
    );
}
