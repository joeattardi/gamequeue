import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, statfsSync, unlinkSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import {
    DEFAULT_SCREENSHOT_CAP_BYTES,
    IMAGE_MAX_SIDE,
    MAX_UPLOAD_BYTES,
    type ScreenshotStorageDto
} from '@gamequeue/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { playthroughPosts, playthroughs, postImages } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { read, write } from './settings.js';

const CAP_KEY = 'screenshot_cap_bytes';
/** Refuse pictures with more pixels than this before decoding them (a decompression bomb) */
const MAX_INPUT_PIXELS = 64_000_000;
/** Stored names are `<sha256 hex>.webp`; anything else in the folder is not ours to touch */
const STORED_NAME = /^[0-9a-f]{64}\.webp$/;

const screenshotCap = (db: Db): number => {
    const saved = Number(read(db, CAP_KEY) ?? NaN);
    return Number.isFinite(saved) && saved >= 0 ? saved : DEFAULT_SCREENSHOT_CAP_BYTES;
};
export const setScreenshotCap = (db: Db, bytes: number) => write(db, CAP_KEY, String(bytes));

/** Bytes of every stored file; a picture two posts share is counted once. */
function usedBytes(db: Db) {
    const row = db
        .select({
            used: sql<number>`coalesce(sum(bytes), 0)`,
            files: sql<number>`count(*)`
        })
        .from(sql`(select distinct file_name, bytes from post_images)`)
        .get();
    return { used: row?.used ?? 0, files: row?.files ?? 0 };
}

export function screenshotStorage(db: Db, config: Config): ScreenshotStorageDto {
    const { used, files } = usedBytes(db);
    let freeDiskBytes: number | null = null;
    try {
        mkdirSync(config.screenshotsPath, { recursive: true });
        const s = statfsSync(config.screenshotsPath);
        freeDiskBytes = Number(s.bavail) * Number(s.bsize);
    } catch {
        // free space is informational
    }
    return { usedBytes: used, capBytes: screenshotCap(db), files, freeDiskBytes };
}

interface StoredImage {
    fileName: string;
    width: number;
    height: number;
    bytes: number;
}

const fileOf = (config: Config, fileName: string) => join(config.screenshotsPath, fileName);

/**
 * Checks and re-encodes an uploaded picture and writes it to the screenshots folder. Only JPEG, PNG
 * and WebP are accepted (judged by the bytes, not the Content-Type), originals over 8 MB are
 * refused, and the stored file is a WebP of at most 1920 px on its longest side with all metadata
 * (EXIF, GPS, colour profile) removed: sharp drops it unless asked to keep it.
 */
export async function storeImage(db: Db, config: Config, upload: Buffer): Promise<StoredImage> {
    if (upload.length === 0) throw new HttpError(400, 'No image was sent');
    if (upload.length > MAX_UPLOAD_BYTES)
        throw new HttpError(413, 'That image is larger than 8 MB');
    let encoded: { data: Buffer; info: sharp.OutputInfo };
    try {
        const source = sharp(upload, { limitInputPixels: MAX_INPUT_PIXELS });
        const meta = await source.metadata();
        if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format))
            throw new HttpError(415, 'Only JPEG, PNG and WebP images can be uploaded');
        encoded = await source
            .rotate() // apply the EXIF orientation before the tag is dropped
            .resize({
                width: IMAGE_MAX_SIDE,
                height: IMAGE_MAX_SIDE,
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 82 })
            .toBuffer({ resolveWithObject: true });
    } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(415, "That file isn't a readable JPEG, PNG or WebP image");
    }

    const fileName = `${createHash('sha256').update(encoded.data).digest('hex')}.webp`;
    const { used } = usedBytes(db);
    const alreadyStored = !!db
        .select({ id: postImages.id })
        .from(postImages)
        .where(eq(postImages.fileName, fileName))
        .get();
    const cap = screenshotCap(db);
    // A full store (or a limit of 0) refuses everything, even a picture it already holds
    if (used >= cap || (!alreadyStored && used + encoded.data.length > cap))
        throw new HttpError(
            507,
            'Screenshot storage is full. Delete some screenshots, or ask the admin to raise the limit.'
        );

    mkdirSync(config.screenshotsPath, { recursive: true });
    const target = fileOf(config, fileName);
    if (!existsSync(target)) {
        const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temp, encoded.data);
        await rename(temp, target);
    }
    return {
        fileName,
        width: encoded.info.width,
        height: encoded.info.height,
        bytes: encoded.data.length
    };
}

export const imagePath = (config: Config, fileName: string) => fileOf(config, fileName);

/** The files that belong to these rows, to hand to `removeUnreferencedFiles` once the rows are gone. */
export function imageFilesOf(
    db: Db,
    scope:
        | { postId: number }
        | { imageId: number }
        | { playthroughId: number }
        | { entryId: number }
        | { userId: number }
): string[] {
    const q = db.select({ f: postImages.fileName }).from(postImages);
    let rows: { f: string }[];
    if ('imageId' in scope) rows = q.where(eq(postImages.id, scope.imageId)).all();
    else if ('postId' in scope) rows = q.where(eq(postImages.postId, scope.postId)).all();
    else {
        const posts = q.innerJoin(playthroughPosts, eq(playthroughPosts.id, postImages.postId));
        if ('playthroughId' in scope)
            rows = posts.where(eq(playthroughPosts.playthroughId, scope.playthroughId)).all();
        else if ('userId' in scope)
            rows = posts.where(eq(playthroughPosts.userId, scope.userId)).all();
        else
            rows = posts
                .innerJoin(playthroughs, eq(playthroughs.id, playthroughPosts.playthroughId))
                .where(eq(playthroughs.entryId, scope.entryId))
                .all();
    }
    return [...new Set(rows.map((r) => r.f))];
}

/** Deletes each of these files unless some image row still points at it. Never throws. */
export function removeUnreferencedFiles(db: Db, config: Config, fileNames: string[]) {
    if (fileNames.length === 0) return;
    const still = new Set(
        db
            .select({ f: postImages.fileName })
            .from(postImages)
            .where(inArray(postImages.fileName, fileNames))
            .all()
            .map((r) => r.f)
    );
    for (const name of fileNames) {
        if (still.has(name) || !STORED_NAME.test(name)) continue;
        try {
            unlinkSync(fileOf(config, name));
        } catch {
            // already gone
        }
    }
}

/** Files younger than this may belong to an upload that has not been recorded yet */
const ORPHAN_GRACE_MS = 3600_000;
/** A screenshot post that never got a picture (the upload failed) is cleared after this */
const EMPTY_POST_MS = 24 * 3600_000;

interface CleanupResult {
    files: number;
    imageRows: number;
    emptyPosts: number;
}

/**
 * The daily clean-up: files nobody points at, image rows whose file is gone, and screenshot posts
 * left without a picture. Files and posts younger than their grace period are left alone.
 */
export function cleanupScreenshots(db: Db, config: Config, now = Date.now()): CleanupResult {
    const result: CleanupResult = { files: 0, imageRows: 0, emptyPosts: 0 };

    const referenced = new Set(
        db
            .selectDistinct({ f: postImages.fileName })
            .from(postImages)
            .all()
            .map((r) => r.f)
    );
    let onDisk: string[] = [];
    try {
        onDisk = readdirSync(config.screenshotsPath);
    } catch {
        // no folder yet: nothing was ever uploaded
    }
    for (const name of onDisk) {
        if (!STORED_NAME.test(name) && !name.endsWith('.tmp')) continue;
        const path = fileOf(config, name);
        try {
            if (now - statSync(path).mtimeMs < ORPHAN_GRACE_MS) continue;
            if (name.endsWith('.tmp') || !referenced.has(name)) {
                unlinkSync(path);
                result.files++;
            }
        } catch {
            // vanished while we looked
        }
    }

    const present = new Set(onDisk);
    const missing = [...referenced].filter((f) => !present.has(f));
    if (missing.length > 0) {
        result.imageRows = db
            .delete(postImages)
            .where(inArray(postImages.fileName, missing))
            .run().changes;
    }

    result.emptyPosts = db
        .delete(playthroughPosts)
        .where(
            sql`${playthroughPosts.kind} = 'screenshot' and ${playthroughPosts.body} = ''
                and ${playthroughPosts.createdAt} < ${now - EMPTY_POST_MS}
                and not exists (select 1 from post_images where post_id = ${playthroughPosts.id})`
        )
        .run().changes;
    return result;
}
