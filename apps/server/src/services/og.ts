import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ProfileDto, RecapDto } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { ProfileCardData, RecapCardData } from '../og/cards.js';
import { avatarVersion } from './avatars.js';
import { getProfile, getProfileRecap } from './profile.js';

/**
 * What the share cards show, reduced to exactly the fields they draw. Public data only (it comes from the
 * same functions as the public profile). The hash of it names the card: when anything shown changes, the
 * hash does, so a new `?v=` makes Discord and Twitter fetch a fresh image while the cache never goes stale.
 */

const MAX_COVERS = 3;

/** `host` is the site's host name, printed at the bottom of the profile card */
export function profileCardData(profile: ProfileDto, host: string): ProfileCardData {
    const covers = profile.slots.flatMap((s) => s.entry?.game.coverImageId ?? []);
    return {
        host,
        username: profile.username,
        avatarVersion: profile.avatarUpdatedAt,
        playing: profile.summary.byStatus.playing > 0,
        total: profile.summary.total,
        finished: profile.summary.byStatus.finished,
        backlog: profile.summary.byStatus.unplayed,
        covers: covers.slice(0, MAX_COVERS)
    };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** IGDB names like "Role-playing (RPG)" read better without the abbreviation. */
const tidyGenre = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '');

export function recapCardData(
    recap: RecapDto,
    user: { username: string; avatarVersion: number | null },
    host: string
): RecapCardData {
    const ids = [...recap.topRated, ...[...recap.games].reverse()].flatMap(
        (e) => e.game.coverImageId ?? []
    );
    // The headline is the finished count; a year with none leads with the next most telling number
    const finished = recap.finishedGames;
    const headline =
        finished > 0 || (recap.addedCount === 0 && recap.startedCount === 0)
            ? { value: finished, label: plural(finished, 'game finished', 'games finished') }
            : recap.startedCount >= recap.addedCount && recap.startedCount > 0
              ? {
                    value: recap.startedCount,
                    label: plural(recap.startedCount, 'game started', 'games started')
                }
              : {
                    value: recap.addedCount,
                    label: plural(recap.addedCount, 'game added', 'games added')
                };
    const showDelta = finished > 0 || recap.previousFinishedGames > 0;
    const minutes = recap.estimatedMinutes;
    return {
        host,
        username: user.username,
        avatarVersion: user.avatarVersion,
        year: recap.year,
        headline,
        delta: showDelta
            ? { diff: finished - recap.previousFinishedGames, previousYear: recap.year - 1 }
            : null,
        hours: minutes > 0 ? Math.max(1, Math.round(minutes / 60)) : null,
        topGenre: recap.topGenres[0] ? tidyGenre(recap.topGenres[0].name) : null,
        archetype: recap.archetype?.title ?? null,
        covers: [...new Set(ids)].slice(0, MAX_COVERS)
    };
}

/** Names the card's content; includes the kind via the fields themselves (`year` only exists on recaps). */
export const cardKey = (data: ProfileCardData | RecapCardData) =>
    createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 12);

export function getProfileCardData(db: Db, username: string, host: string): ProfileCardData {
    return profileCardData(getProfile(db, username), host);
}

export function getRecapCardData(
    db: Db,
    username: string,
    year: number | undefined,
    host: string
): RecapCardData {
    const user = db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.username, username))
        .get();
    if (!user) throw new HttpError(404, 'Not found');
    return recapCardData(
        getProfileRecap(db, username, year),
        { username: user.username, avatarVersion: avatarVersion(db, user.id) },
        host
    );
}
