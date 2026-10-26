import { AVATAR_MAX_BYTES, EXPORT_FORMAT } from '@gamequeue/shared';
import { describe, expect, it } from 'vitest';
import { MAX_JSON_BODY_BYTES } from '../src/app.js';
import { cookieFrom, makeApp, register } from './helpers.js';

const origin = 'http://localhost';
/** A JSON body of about `bytes` bytes */
const padded = (bytes: number, fields: Record<string, unknown> = {}) =>
    JSON.stringify({ ...fields, pad: 'a'.repeat(bytes) });

/** Sends the body as a stream, so there is no Content-Length to check up front */
const streamed = (body: string) =>
    new ReadableStream<Uint8Array>({
        start(controller) {
            const bytes = new TextEncoder().encode(body);
            for (let i = 0; i < bytes.length; i += 64 * 1024)
                controller.enqueue(bytes.subarray(i, i + 64 * 1024));
            controller.close();
        }
    });

describe('request body limit', () => {
    const login = (body: BodyInit, headers: Record<string, string> = {}) =>
        makeApp().app.request('/api/auth/login', {
            method: 'POST',
            body,
            headers: { 'content-type': 'application/json', origin, ...headers },
            ...(body instanceof ReadableStream ? { duplex: 'half' } : {})
        } as RequestInit);
    const creds = { username: 'nobody', password: 'not the password' };

    it('refuses an oversized body on a public route by its Content-Length, before reading it', async () => {
        const body = padded(MAX_JSON_BODY_BYTES + 1, creds);
        const res = await login(body, { 'content-length': String(body.length) });
        expect(res.status).toBe(413);
        expect(await res.json()).toEqual({ error: 'Request body too large' });
    });

    it('refuses an oversized body sent without a Content-Length, while it streams in', async () => {
        const res = await login(streamed(padded(5 * 1024 * 1024, creds)));
        expect(res.status).toBe(413);
    });

    it('lets a body under the limit through', async () => {
        const res = await login(padded(MAX_JSON_BODY_BYTES - 1024, creds));
        expect(res.status).toBe(401); // read and parsed: just the wrong password
    });

    it('leaves the import its own 50 MB limit, and still fits the largest avatar', async () => {
        const { app } = makeApp();
        const cookie = cookieFrom(await register(app));
        const headers = { 'content-type': 'application/json', origin, cookie };

        const big = padded(2 * 1024 * 1024, { format: EXPORT_FORMAT, version: 1 });
        const imp = await app.request('/api/data/import', { method: 'POST', body: big, headers });
        expect(imp.status).toBe(400); // past the global cap, refused only for its content

        const png = Buffer.alloc(AVATAR_MAX_BYTES);
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
        const avatar = await app.request('/api/avatar', {
            method: 'PUT',
            body: JSON.stringify({ contentType: 'image/png', data: png.toString('base64') }),
            headers
        });
        expect(avatar.status).toBe(200);
    });
});
