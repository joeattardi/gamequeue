import type { AiMessage, AiRecentChatDto, AiSuggestionDto } from '@gamequeue/shared';
import { AI_MAX_MESSAGE_CHARS, AI_MAX_MESSAGES } from '@gamequeue/shared';
import { Bot, Dices, MessagesSquare, Send, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAiStatus, usePickChat, useRecentAiChats } from '../api/ai';
import { ApiRequestError } from '../api/client';
import { useEntries } from '../api/collection';
import { Cover } from '../components/Cover';
import { QueueButton } from '../components/PickResult';
import { StartPlayingButton } from '../components/StartPlayingButton';
import { timeAgo, useDebounced, usePageTitle } from '../lib';

const REASONS = {
    not_configured: 'The AI features are not set up on this server.',
    not_enabled: 'The AI features are not switched on for your account. An admin can turn them on.',
    budget_spent:
        "This month's AI budget is used up. It resets on the 1st, or an admin can raise it."
} as const;

/** `/chat`: the AI hub. Help choosing the next game, and the games you have saved chats about. */
export function AskAiPage() {
    usePageTitle('Ask AI');
    const status = useAiStatus();
    // Saved chats can be read even when new AI calls are refused (budget spent)
    const chats = useRecentAiChats(status.data?.reason !== 'not_configured');
    if (status.isPending) return <AskAiSkeleton />;
    const available = status.data?.available ?? false;
    return (
        <section className="stack ask-ai">
            <div className="page-head">
                <div>
                    <h1>
                        <Bot aria-hidden="true" /> Ask AI
                    </h1>
                    <p className="muted">
                        A helper that knows your collection. Questions and the game data they need
                        go to Anthropic's Claude.
                    </p>
                </div>
            </div>
            {!available && (
                <p className="panel" role="status">
                    {status.data?.reason
                        ? REASONS[status.data.reason]
                        : "The AI helper isn't available."}
                </p>
            )}
            {available && <PickChat />}
            {status.data?.reason !== 'not_configured' && status.data?.reason !== 'not_enabled' && (
                <GameChats chats={chats.data} pending={chats.isPending} canStart={available} />
            )}
        </section>
    );
}

function AskAiSkeleton() {
    return (
        <section className="stack ask-ai" role="status" aria-label="Loading Ask AI">
            <span
                className="skeleton skeleton--line"
                style={{ width: 160, height: 32 }}
                aria-hidden="true"
            />
            <div className="panel" aria-hidden="true">
                <span className="skeleton skeleton--line" style={{ width: '50%' }} />
                <span className="skeleton skeleton--line" style={{ width: '100%', height: 64 }} />
            </div>
            <div className="panel" aria-hidden="true">
                <span className="skeleton skeleton--line" style={{ width: '40%' }} />
                <span className="skeleton skeleton--line" style={{ width: '80%' }} />
            </div>
        </section>
    );
}

interface Turn {
    message: AiMessage;
    suggestions?: AiSuggestionDto[];
}

/**
 * Pick-my-next-game: a short chat that ends in suggestions from your own queue and backlog, each
 * with Start playing and Add to queue. The chat never changes anything itself, and isn't saved.
 */
function PickChat() {
    const ask = usePickChat();
    const [turns, setTurns] = useState<Turn[]>([]);
    const [input, setInput] = useState('');
    const [error, setError] = useState<string>();
    const full = turns.length >= AI_MAX_MESSAGES - 1;

    async function send(e: FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || ask.isPending) return;
        const next: Turn[] = [...turns, { message: { role: 'user', content: text } }];
        setTurns(next);
        setInput('');
        setError(undefined);
        try {
            const res = await ask.mutateAsync({ messages: next.map((t) => t.message) });
            setTurns([
                ...next,
                {
                    message: { role: 'assistant', content: res.message },
                    suggestions: res.suggestions
                }
            ]);
        } catch (err) {
            setTurns(turns);
            setInput(text);
            setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
        }
    }

    return (
        <section className="panel stack" aria-labelledby="pick-chat-h">
            <h2 id="pick-chat-h">
                <Dices aria-hidden="true" /> Help me pick my next game
            </h2>
            <p className="muted">
                Say what you're in the mood for and how much time you have. Suggestions come from
                your queue and backlog; your recent finishes and ratings are sent so it knows your
                taste. This chat isn't saved.
            </p>
            {turns.length > 0 && (
                <ol className="helper__log" aria-live="polite" aria-busy={ask.isPending}>
                    {turns.map((t, i) => (
                        <li key={i} className={`helper__msg helper__msg--${t.message.role}`}>
                            <span className="sr-only">
                                {t.message.role === 'user' ? 'You' : 'Helper'}:{' '}
                            </span>
                            {t.message.content}
                            {t.suggestions && t.suggestions.length > 0 && (
                                <ul className="suggestions">
                                    {t.suggestions.map((s) => (
                                        <Suggestion key={s.entry.id} suggestion={s} />
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                    {ask.isPending && (
                        <li className="helper__msg helper__msg--assistant" role="status">
                            <span
                                className="skeleton skeleton--line"
                                style={{ width: '60%' }}
                                aria-hidden="true"
                            />
                            <span className="sr-only">Thinking…</span>
                        </li>
                    )}
                </ol>
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
            {full ? (
                <p className="muted">
                    This conversation is as long as it can get. Start a new one.
                </p>
            ) : (
                <form className="helper__form" onSubmit={send}>
                    <label className="sr-only" htmlFor="pick-input">
                        What are you in the mood for?
                    </label>
                    <textarea
                        id="pick-input"
                        rows={2}
                        maxLength={AI_MAX_MESSAGE_CHARS}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.currentTarget.form?.requestSubmit();
                            }
                        }}
                        placeholder="Something short and relaxing for tonight?"
                    />
                    <button
                        className="btn btn--primary"
                        type="submit"
                        disabled={ask.isPending || !input.trim()}
                    >
                        <Send aria-hidden="true" /> Ask
                    </button>
                </form>
            )}
            {turns.length > 0 && !ask.isPending && (
                <div>
                    <button className="btn btn--ghost" type="button" onClick={() => setTurns([])}>
                        <Trash2 aria-hidden="true" /> New conversation
                    </button>
                </div>
            )}
        </section>
    );
}

/** A suggested game as a card; its buttons do the same as everywhere else in the app. */
function Suggestion({ suggestion: { entry, reason } }: { suggestion: AiSuggestionDto }) {
    const [started, setStarted] = useState(false);
    return (
        <li className="suggestion">
            <Link
                className="suggestion__cover"
                to={`/games/${entry.id}`}
                tabIndex={-1}
                aria-hidden="true"
            >
                <Cover imageId={entry.game.coverImageId} name={entry.game.name} />
            </Link>
            <div className="stack">
                <Link className="suggestion__title" to={`/games/${entry.id}`}>
                    {entry.game.name}
                </Link>
                {reason && <span className="muted">{reason}</span>}
                {started ? (
                    <span role="status">
                        <strong>Now playing.</strong>
                    </span>
                ) : (
                    <div className="row">
                        <StartPlayingButton entry={entry} onStarted={() => setStarted(true)} />
                        <QueueButton entry={entry} />
                    </div>
                )}
            </div>
        </li>
    );
}

/** The games you have saved chats about, most recently used first, and a way to start a new one. */
function GameChats({
    chats,
    pending,
    canStart
}: {
    chats: AiRecentChatDto[] | undefined;
    pending: boolean;
    canStart: boolean;
}) {
    // One row per game: its most recently used chat
    const games = useMemo(() => {
        const seen = new Set<number>();
        return (chats ?? []).filter((c) => !seen.has(c.entryId) && seen.add(c.entryId));
    }, [chats]);
    return (
        <section className="panel stack" aria-labelledby="game-chats-h">
            <h2 id="game-chats-h">
                <MessagesSquare aria-hidden="true" /> Your game chats
            </h2>
            {canStart && <StartChat />}
            {pending ? (
                <ul className="chat-list" role="status" aria-label="Loading your chats">
                    {[0, 1].map((i) => (
                        <li key={i} className="chat-list__item" aria-hidden="true">
                            <span className="skeleton chat-list__cover" />
                            <span className="skeleton skeleton--line" style={{ width: '60%' }} />
                        </li>
                    ))}
                </ul>
            ) : games.length === 0 ? (
                <p className="muted">
                    No saved chats yet. Ask about a game from its page, or start one here.
                </p>
            ) : (
                <ul className="chat-list">
                    {games.map((c) => (
                        <li key={c.entryId}>
                            <Link className="chat-list__item" to={`/games/${c.entryId}/chat`}>
                                <span className="chat-list__cover">
                                    <Cover
                                        imageId={c.game.coverImageId}
                                        name={c.game.name}
                                        size="cover_small"
                                    />
                                </span>
                                <span className="chat-list__text">
                                    <strong>{c.game.name}</strong>
                                    <span className="muted chat-list__title">{c.title}</span>
                                </span>
                                <span className="muted chat-list__when">{timeAgo(c.usedAt)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** Find a game in the collection and open its chat. */
function StartChat() {
    const [q, setQ] = useState('');
    const query = useDebounced(q.trim(), 250);
    const results = useEntries(new URLSearchParams({ view: 'all', q: query }), 6);
    return (
        <div className="stack">
            <label className="field">
                <span>Start a chat about a game</span>
                <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search your collection"
                />
            </label>
            {query &&
                (results.isPending ? (
                    <span
                        className="skeleton skeleton--line"
                        role="status"
                        aria-label="Searching"
                    />
                ) : results.data?.entries.length ? (
                    <ul className="chat-start">
                        {results.data.entries.map((e) => (
                            <li key={e.id}>
                                <Link to={`/games/${e.id}/chat`}>{e.game.name}</Link>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="muted">No games in your collection match.</p>
                ))}
        </div>
    );
}
