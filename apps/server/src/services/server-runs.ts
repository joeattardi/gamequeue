import { desc, eq, isNull, lt } from 'drizzle-orm';
import type { ServerRunDto, ServerRunEnd } from '@gamequeue/shared';
import type { Db } from '../db/client.js';
import { serverRuns } from '../db/schema.js';
import { reportError } from './error-log.js';

const KEEP_DAYS = 90;
export const HEARTBEAT_MS = 60_000;

/**
 * Records that the server started. Any earlier run that never recorded an end died without
 * shutting down (OOM kill, power loss, `kill -9`): it is closed as `unclean` at its last heartbeat
 * and reported as an error, which covers what the process-level crash handlers can't see.
 * Returns the id of the new run.
 */
export function startRun(db: Db, version: string, now = Date.now()): number {
    for (const run of db.select().from(serverRuns).where(isNull(serverRuns.ended)).all()) {
        db.update(serverRuns)
            .set({ ended: 'unclean', endedAt: run.lastSeenAt })
            .where(eqId(run.id))
            .run();
        reportError(
            db,
            'unclean_shutdown',
            new Error(
                `The server (version ${run.version}) stopped without shutting down. Last seen ${new Date(run.lastSeenAt).toISOString()}.`
            ),
            { context: { runId: run.id, version: run.version, lastSeenAt: run.lastSeenAt } },
            now
        );
    }
    return db
        .insert(serverRuns)
        .values({ startedAt: now, version, lastSeenAt: now })
        .returning({ id: serverRuns.id })
        .get().id;
}

const eqId = (id: number) => eq(serverRuns.id, id);

export function heartbeat(db: Db, id: number, now = Date.now()) {
    db.update(serverRuns).set({ lastSeenAt: now }).where(eqId(id)).run();
}

export function endRun(
    db: Db,
    id: number,
    how: Exclude<ServerRunEnd, 'unclean'>,
    now = Date.now()
) {
    db.update(serverRuns).set({ ended: how, endedAt: now, lastSeenAt: now }).where(eqId(id)).run();
}

export function listRuns(db: Db, limit = 10): ServerRunDto[] {
    return db
        .select()
        .from(serverRuns)
        .orderBy(desc(serverRuns.id))
        .limit(limit)
        .all()
        .map((r) => ({
            id: r.id,
            startedAt: r.startedAt,
            lastSeenAt: r.lastSeenAt,
            endedAt: r.endedAt,
            ended: r.ended,
            version: r.version
        }));
}

export function pruneRuns(db: Db, now = Date.now()) {
    return db
        .delete(serverRuns)
        .where(lt(serverRuns.startedAt, now - KEEP_DAYS * 24 * 3600_000))
        .run().changes;
}
