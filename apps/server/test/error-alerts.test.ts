import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ALERT_COOLDOWN_MS,
    ALERT_THRESHOLD,
    ALERT_WINDOW_MS,
    createErrorAlerter
} from '../src/services/error-alerts.js';
import { reportError, setErrorAlerter } from '../src/services/error-log.js';
import { makeApp } from './helpers.js';

afterEach(() => setErrorAlerter(undefined));

function setup() {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = makeApp();
    const sent: { subject: string; text: string }[] = [];
    let t = 1_000_000;
    setErrorAlerter(
        createErrorAlerter(
            db,
            (subject, text) => sent.push({ subject, text }),
            () => t
        )
    );
    const report = (kind: Parameters<typeof reportError>[1], msg = 'boom') =>
        reportError(db, kind, new Error(msg), {}, t);
    return { report, sent, advance: (ms: number) => (t += ms) };
}

describe('error alert email', () => {
    it('waits for the threshold, then sends once with the latest message', () => {
        const { report, sent } = setup();
        for (let i = 1; i < ALERT_THRESHOLD; i++) report('igdb_429');
        expect(sent).toHaveLength(0);
        report('igdb_429', 'rate limited');
        expect(sent).toHaveLength(1);
        expect(sent[0]!.subject).toContain('IGDB rate limit');
        expect(sent[0]!.text).toContain('rate limited');
    });

    it('stays quiet during the cooldown and alerts again after it', () => {
        const { report, sent, advance } = setup();
        for (let i = 0; i < ALERT_THRESHOLD; i++) report('igdb_429');
        for (let i = 0; i < 10; i++) report('igdb_429');
        expect(sent).toHaveLength(1);
        advance(ALERT_COOLDOWN_MS + 1);
        for (let i = 0; i < ALERT_THRESHOLD; i++) report('igdb_429');
        expect(sent).toHaveLength(2);
    });

    it('does not count events outside the window, or mix kinds', () => {
        const { report, sent, advance } = setup();
        for (let i = 0; i < ALERT_THRESHOLD - 1; i++) report('igdb_429');
        advance(ALERT_WINDOW_MS + 1);
        report('igdb_429');
        for (let i = 0; i < ALERT_THRESHOLD - 1; i++) report('server_500');
        expect(sent).toHaveLength(0);
    });

    it('never alerts for crashes or failed emails', () => {
        const { report, sent } = setup();
        for (let i = 0; i < ALERT_THRESHOLD * 2; i++) {
            report('process_crash');
            report('email_failed');
        }
        expect(sent).toHaveLength(0);
    });
});
