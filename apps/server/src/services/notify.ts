import type { Config } from '../config.js';

/** Fire-and-forget owner alerts. Never throws and never blocks the request that triggered it. */
export type Notify = (subject: string, text: string) => void;

const RESEND_URL = 'https://api.resend.com/emails';

/** Emails the owner through Resend's HTTP API; a no-op unless the key and recipient are set. */
export function createNotifier(
    config: Pick<Config, 'resendApiKey' | 'notifyEmail' | 'notifyFrom'>,
    fetchImpl: typeof fetch = fetch
): Notify {
    const { resendApiKey, notifyEmail, notifyFrom } = config;
    if (!resendApiKey || !notifyEmail) return () => {};
    return (subject, text) => {
        void (async () => {
            try {
                const res = await fetchImpl(RESEND_URL, {
                    method: 'POST',
                    headers: {
                        authorization: `Bearer ${resendApiKey}`,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ from: notifyFrom, to: [notifyEmail], subject, text }),
                    signal: AbortSignal.timeout(10_000)
                });
                if (!res.ok)
                    console.warn(`Notification email failed: ${res.status} ${await res.text()}`);
            } catch (e) {
                console.warn('Notification email failed:', e instanceof Error ? e.message : e);
            }
        })();
    };
}
