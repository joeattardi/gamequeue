import { createHash } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
    TIER_COLORS,
    type AvatarIconChoice,
    type ProfileDto,
    type PublicGridDto,
    type PublicTierListDto,
    type RecapDto
} from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { ProfileCardData, RecapCardData } from '../og/cards.js';
import {
    TIER_CARD_COVERS,
    TIER_CARD_ROWS,
    type GridCardData,
    type TierCardData
} from '../og/social-cards.js';
import { drawable } from '../og/text.js';
import { avatarIconOf, avatarVersion } from './avatars.js';
import { getPublicGrid } from './grids.js';
import { getProfile, getProfileRecap } from './profile.js';
import { getPublicTierList } from './tier-lists.js';

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
        avatarIcon: profile.avatarIcon,
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
    user: { username: string; avatarVersion: number | null; avatarIcon: AvatarIconChoice | null },
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
    const minutes = recap.playMinutes;
    return {
        host,
        username: user.username,
        avatarVersion: user.avatarVersion,
        avatarIcon: user.avatarIcon,
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
export const cardKey = (data: ProfileCardData | RecapCardData | GridCardData | TierCardData) =>
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
        .select({
            id: users.id,
            username: users.username,
            avatarIcon: users.avatarIcon,
            avatarColor: users.avatarColor
        })
        .from(users)
        .where(and(eq(users.username, username), isNotNull(users.emailVerifiedAt)))
        .get();
    if (!user) throw new HttpError(404, 'Not found');
    return recapCardData(
        getProfileRecap(db, username, year),
        {
            username: user.username,
            avatarVersion: avatarVersion(db, user.id),
            avatarIcon: avatarIconOf(user)
        },
        host
    );
}

interface CardAvatar {
    version: number | null;
    icon: AvatarIconChoice | null;
}

const avatarOfUsername = (db: Db, username: string): CardAvatar => {
    const user = db.select().from(users).where(eq(users.username, username)).get();
    return user
        ? { version: avatarVersion(db, user.id), icon: avatarIconOf(user) }
        : { version: null, icon: null };
};

export function gridCardData(grid: PublicGridDto, avatar: CardAvatar, host: string): GridCardData {
    const cells = grid.cells.map((c) => (c.game ? { cover: c.game.coverImageId } : null));
    return {
        kind: 'grid',
        host,
        username: grid.username,
        avatarVersion: avatar.version,
        avatarIcon: avatar.icon,
        title: drawable(grid.title),
        cols: grid.cols,
        rows: grid.rows,
        cells,
        filled: cells.filter(Boolean).length,
        covers: [...new Set(cells.flatMap((c) => c?.cover ?? []))],
        path: `/u/${grid.username}/grids/${grid.id}`
    };
}

export function tierCardData(
    list: PublicTierListDto,
    avatar: CardAvatar,
    host: string
): TierCardData {
    const filled = list.tiers.filter((t) => t.items.length > 0);
    const tiers = filled.slice(0, TIER_CARD_ROWS).map((t) => ({
        // Names are short and usually a letter; a long or exotic one is just left off
        name: t.name.length <= 6 ? drawable(t.name) : null,
        color: TIER_COLORS[t.color],
        total: t.items.length,
        covers: t.items.slice(0, TIER_CARD_COVERS).map((i) => i.game.coverImageId)
    }));
    return {
        kind: 'tier',
        host,
        username: list.username,
        avatarVersion: avatar.version,
        avatarIcon: avatar.icon,
        title: drawable(list.title),
        tiers,
        ranked: filled.reduce((n, t) => n + t.items.length, 0),
        covers: [...new Set(tiers.flatMap((t) => t.covers.flatMap((c) => c ?? [])))],
        path: `/u/${list.username}/tiers/${list.id}`
    };
}

export function getGridCardData(db: Db, username: string, id: number, host: string): GridCardData {
    return gridCardData(getPublicGrid(db, username, id), avatarOfUsername(db, username), host);
}

export function getTierCardData(db: Db, username: string, id: number, host: string): TierCardData {
    return tierCardData(getPublicTierList(db, username, id), avatarOfUsername(db, username), host);
}
