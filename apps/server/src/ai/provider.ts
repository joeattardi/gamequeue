import Anthropic from '@anthropic-ai/sdk';
import type { AiMessage } from '@gamequeue/shared';

export interface GenerateRequest {
    system: string;
    messages: AiMessage[];
    maxTokens: number;
}

export interface GenerateResult {
    text: string;
    /** The model that answered (a fallback model when the configured one declined) */
    model: string;
    inputTokens: number;
    outputTokens: number;
    /** The model declined to answer; `text` is then a short notice for the user */
    refused: boolean;
}

/** The one thing the AI features need from a provider. Anthropic is the only real one; tests use a fake. */
export interface AiProvider {
    readonly model: string;
    generate(req: GenerateRequest): Promise<GenerateResult>;
}

/** Thrown for any provider failure, with a message safe to log (no key, no prompt, no conversation). */
export class AiProviderError extends Error {}

// Models that accept server-side fallbacks in the "default" routing form
const FALLBACK_MODELS = new Set([
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-fable-5-1'
]);

export function createAnthropicProvider(apiKey: string, model: string): AiProvider {
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    return {
        model,
        async generate({ system, messages, maxTokens }) {
            const fallback = FALLBACK_MODELS.has(model);
            let res;
            try {
                res = await client.beta.messages.create({
                    model,
                    max_tokens: maxTokens,
                    system,
                    messages,
                    // A chat answer about a game needs little deliberation; this keeps cost and latency down
                    output_config: { effort: 'low' },
                    // When the model declines on a safety classifier, the API retries on a suitable model
                    ...(fallback
                        ? {
                              betas: ['server-side-fallback-2026-07-01'],
                              fallbacks: 'default' as const
                          }
                        : {})
                });
            } catch (err) {
                // The SDK's messages carry the HTTP status and error type, never the key or the request body
                const status = err instanceof Anthropic.APIError ? err.status : undefined;
                throw new AiProviderError(
                    status ? `Anthropic API error ${status}` : 'Could not reach the Anthropic API'
                );
            }
            const refused = res.stop_reason === 'refusal';
            const text = res.content
                .flatMap((b) => (b.type === 'text' ? [b.text] : []))
                .join('\n')
                .trim();
            return {
                text: refused || !text ? "Sorry, I can't help with that one." : text,
                model: res.model,
                inputTokens:
                    res.usage.input_tokens +
                    (res.usage.cache_creation_input_tokens ?? 0) +
                    (res.usage.cache_read_input_tokens ?? 0),
                outputTokens: res.usage.output_tokens,
                refused
            };
        }
    };
}
