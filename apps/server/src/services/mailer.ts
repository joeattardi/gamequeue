import type { Config } from '../config.js';

export interface Mail {
    to: string;
    subject: string;
    text: string;
    html: string;
}

/** Sends one email to a user. Unlike `Notify` it reports failure: callers decide what a miss means. */
export type Mailer = (mail: Mail) => Promise<void>;

const RESEND_URL = 'https://api.resend.com/emails';

/** Sends through Resend's HTTP API; throws when Resend refuses or can't be reached. */
export function createMailer(
    config: Pick<Config, 'resendApiKey' | 'mailFrom'>,
    fetchImpl: typeof fetch = fetch
): Mailer | undefined {
    const { resendApiKey, mailFrom } = config;
    if (!resendApiKey || !mailFrom) return undefined;
    return async ({ to, subject, text, html }) => {
        const res = await fetchImpl(RESEND_URL, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${resendApiKey}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ from: mailFrom, to: [to], subject, text, html }),
            signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
    };
}
