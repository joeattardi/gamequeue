import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

describe('security headers', () => {
    it('forbid framing and sniffing and set the referrer policy on every response', async () => {
        const { app } = makeApp();
        for (const path of ['/api/auth/config', '/api/nope', '/api/entries']) {
            const res = await app.request(path);
            expect(res.headers.get('x-frame-options')).toBe('DENY');
            expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
        }
    });
});
