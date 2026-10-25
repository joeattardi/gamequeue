import { describe, expect, it } from 'vitest';
import { errorEvents, mailDaily } from '../src/db/schema.js';
import { limitMailer, MailQuotaError, takeMailSlot } from '../src/services/mail-budget.js';
import type { Mail } from '../src/services/mailer.js';
import { json, makeApp, register } from './helpers.js';

const DAY = 24 * 3600_000;
const mail: Mail = { to: 'a@example.com', subject: 's', text: 't', html: 'h' };

describe('daily email limit', () => {
    it('counts sends per UTC day and refuses past the limit', () => {
        const { db } = makeApp();
        const t = Date.UTC(2026, 9, 25, 12);
        expect([1, 2, 3].map(() => takeMailSlot(db, 2, t))).toEqual([true, true, false]);
        expect(db.select().from(mailDaily).get()).toEqual({ day: '2026-10-25', sent: 2 });
        // A new day starts from zero
        expect(takeMailSlot(db, 2, t + DAY)).toBe(true);
    });

    it('records each refused email and alerts the owner once a day', async () => {
        const { db } = makeApp();
        const sent: Mail[] = [];
        const alerts: string[] = [];
        let now = Date.UTC(2026, 9, 25, 12);
        const mailer = limitMailer(
            db,
            1,
            async (m) => void sent.push(m),
            (subject) => alerts.push(subject),
            () => now
        );
        await mailer(mail);
        await expect(mailer(mail)).rejects.toBeInstanceOf(MailQuotaError);
        await expect(mailer(mail)).rejects.toBeInstanceOf(MailQuotaError);
        expect(sent).toHaveLength(1);
        expect(alerts).toHaveLength(1);
        expect(
            db
                .select()
                .from(errorEvents)
                .all()
                .map((e) => e.kind)
        ).toEqual(['email_quota', 'email_quota']);
        now += DAY;
        await mailer(mail);
        await expect(mailer(mail)).rejects.toBeInstanceOf(MailQuotaError);
        expect(alerts).toHaveLength(2);
    });

    it('applies to signups: past the limit the account is created but no email goes out', async () => {
        const sent: Mail[] = [];
        const { app, db } = makeApp(
            { emailVerification: true, mailDailyLimit: 2 },
            undefined,
            undefined,
            undefined,
            async (m) => void sent.push(m)
        );
        for (const n of [1, 2, 3])
            expect((await register(app, `u${n}@example.com`)).status).toBe(201);
        expect(sent.map((m) => m.to)).toEqual(['u1@example.com', 'u2@example.com']);
        const kinds = db
            .select()
            .from(errorEvents)
            .all()
            .map((e) => e.kind);
        // Recorded once, as the limit, not also as a failed delivery
        expect(kinds).toEqual(['email_quota']);
        // Forgot password stays silent about it
        const res = await app.request(
            '/api/auth/forgot-password',
            json({ email: 'u1@example.com' })
        );
        expect(res.status).toBe(200);
        expect(sent).toHaveLength(2);
    });
});
