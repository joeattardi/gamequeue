import {
    AI_MAX_MESSAGE_CHARS,
    AI_MAX_MESSAGES,
    type AiMessage,
    type EntryDto
} from '@gamequeue/shared';
import { Bot, NotebookPen, Send, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import Markdown from 'react-markdown';
import { useAiChat, useAiStatus, useAiSummarize } from '../api/ai';
import { ApiRequestError } from '../api/client';
import { useNoteMutations } from '../api/collection';
import { usePostMutations } from '../api/journal';

const errorText = (e: unknown) =>
    e instanceof ApiRequestError ? e.message : 'Something went wrong.';

type Destination = 'private' | 'public' | 'journal';

/**
 * The helper's answer, which usually comes back as Markdown. react-markdown builds React elements
 * and never renders raw HTML, so a reply can't inject markup; pictures are dropped and links open
 * in a new tab without a referrer.
 */
function Reply({ text }: { text: string }) {
    return (
        <div className="helper__md">
            <Markdown
                disallowedElements={['img']}
                unwrapDisallowed
                components={{
                    a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                        </a>
                    )
                }}
            >
                {text}
            </Markdown>
        </div>
    );
}

/**
 * A chat about this game. Only shown when the server has an AI key, an admin switched AI on for
 * this account and the month's budget isn't spent. The conversation lives in this component only:
 * the server keeps nothing but a usage record.
 */
export function GameHelper({ entry }: { entry: EntryDto }) {
    const status = useAiStatus();
    // No placeholder while this loads: most accounts never see the panel, so a skeleton would flash and vanish
    if (!status.data?.available) return null;
    return <HelperPanel entry={entry} />;
}

function HelperPanel({ entry }: { entry: EntryDto }) {
    const chat = useAiChat();
    const [messages, setMessages] = useState<AiMessage[]>([]);
    const [input, setInput] = useState('');
    const [includeNotes, setIncludeNotes] = useState(true);
    const [error, setError] = useState<string>();
    const full = messages.length >= AI_MAX_MESSAGES - 1;

    async function send(e: FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || chat.isPending) return;
        const next: AiMessage[] = [...messages, { role: 'user', content: text }];
        setMessages(next);
        setInput('');
        setError(undefined);
        try {
            const { reply } = await chat.mutateAsync({
                entryId: entry.id,
                includeNotes,
                messages: next
            });
            setMessages([...next, { role: 'assistant', content: reply }]);
        } catch (err) {
            // Put the question back so it isn't lost
            setMessages(messages);
            setInput(text);
            setError(errorText(err));
        }
    }

    return (
        <section aria-labelledby="helper-h" className="panel stack helper">
            <h2 id="helper-h">
                <Bot aria-hidden="true" /> Ask about this game
            </h2>
            <p className="muted helper__disclosure">
                Your questions are sent to Anthropic's Claude together with this game's details from
                IGDB, your latest journal posts for the playthrough in progress
                {includeNotes ? ', and your notes on this game' : ''}. Answers avoid spoilers past
                what you've written down. GameQueue doesn't keep the conversation: it is gone when
                you leave this page.
            </p>
            <label className="check">
                <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                />
                Include my notes on this game
            </label>
            {messages.length > 0 && (
                <ol className="helper__log" aria-live="polite">
                    {messages.map((m, i) => (
                        <li key={i} className={`helper__msg helper__msg--${m.role}`}>
                            <span className="sr-only">
                                {m.role === 'user' ? 'You' : 'Helper'}:{' '}
                            </span>
                            {m.role === 'assistant' ? <Reply text={m.content} /> : m.content}
                        </li>
                    ))}
                    {chat.isPending && (
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
            {full ? (
                <p className="muted">
                    This conversation is as long as it can get. Summarize it, or start a new one.
                </p>
            ) : (
                <form className="helper__form" onSubmit={send}>
                    <label className="sr-only" htmlFor="helper-input">
                        Your question
                    </label>
                    <textarea
                        id="helper-input"
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
                        placeholder="Stuck somewhere? Wondering if a side quest is worth it?"
                    />
                    <button
                        className="btn btn--primary"
                        type="submit"
                        disabled={chat.isPending || !input.trim()}
                    >
                        <Send aria-hidden="true" /> Ask
                    </button>
                </form>
            )}
            <p className="form-error" role="alert">
                {error}
            </p>
            {messages.length >= 2 && (
                <div className="row">
                    <Summarize entry={entry} messages={messages} includeNotes={includeNotes} />
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                            setMessages([]);
                            setError(undefined);
                        }}
                    >
                        <Trash2 aria-hidden="true" /> New conversation
                    </button>
                </div>
            )}
        </section>
    );
}

/** Asks for the main points, lets the user edit them, and saves only where they choose. */
function Summarize({
    entry,
    messages,
    includeNotes
}: {
    entry: EntryDto;
    messages: AiMessage[];
    includeNotes: boolean;
}) {
    const summarize = useAiSummarize();
    const notes = useNoteMutations(entry.id);
    const open = entry.openPlaythrough;
    const posts = usePostMutations(open?.id ?? 0);
    const [draft, setDraft] = useState<string | null>(null);
    const [destination, setDestination] = useState<Destination>('private');
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState<string>();

    async function start() {
        setError(undefined);
        setSaved(undefined);
        try {
            const res = await summarize.mutateAsync({ entryId: entry.id, includeNotes, messages });
            setDraft(res.draft);
        } catch (err) {
            setError(errorText(err));
        }
    }

    async function save(e: FormEvent) {
        e.preventDefault();
        if (!draft?.trim()) return setError('The note is empty.');
        setError(undefined);
        try {
            if (destination === 'journal' && open) {
                await posts.create.mutateAsync({ kind: 'note', body: draft.trim() });
                setSaved('Saved to your journal.');
            } else {
                await notes.add.mutateAsync({
                    body: draft.trim(),
                    public: destination === 'public'
                });
                setSaved(
                    destination === 'public'
                        ? 'Saved as a public note.'
                        : 'Saved as a private note.'
                );
            }
            setDraft(null);
        } catch (err) {
            setError(errorText(err));
        }
    }

    if (draft === null)
        return (
            <>
                <button
                    type="button"
                    className="btn"
                    onClick={start}
                    disabled={summarize.isPending}
                >
                    <Sparkles aria-hidden="true" />
                    {summarize.isPending ? 'Summarizing…' : 'Summarize to notes'}
                </button>
                {saved && (
                    <span className="muted" role="status">
                        {saved}
                    </span>
                )}
                {error && (
                    <span className="form-error" role="alert">
                        {error}
                    </span>
                )}
            </>
        );

    return (
        <form className="stack subpanel helper__draft" onSubmit={save}>
            <label className="field">
                <span>Draft (edit it before saving; nothing is saved until you choose)</span>
                <textarea
                    rows={5}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    data-autofocus
                    autoFocus
                />
            </label>
            <fieldset className="field">
                <legend>Save it as</legend>
                <label className="check">
                    <input
                        type="radio"
                        name="helper-dest"
                        checked={destination === 'private'}
                        onChange={() => setDestination('private')}
                    />
                    A private note
                </label>
                <label className="check">
                    <input
                        type="radio"
                        name="helper-dest"
                        checked={destination === 'public'}
                        onChange={() => setDestination('public')}
                    />
                    A public note (shown on your public game page)
                </label>
                {open && (
                    <label className="check">
                        <input
                            type="radio"
                            name="helper-dest"
                            checked={destination === 'journal'}
                            onChange={() => setDestination('journal')}
                        />
                        A post in this playthrough's journal
                    </label>
                )}
            </fieldset>
            <div className="row">
                <button
                    className="btn btn--primary"
                    type="submit"
                    disabled={notes.add.isPending || posts.create.isPending}
                >
                    <NotebookPen aria-hidden="true" /> Save
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
                    Discard
                </button>
            </div>
            <p className="form-error" role="alert">
                {error}
            </p>
        </form>
    );
}
