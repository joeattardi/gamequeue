import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useAiStatus } from '../api/ai';
import { useEntry } from '../api/collection';
import { Cover } from '../components/Cover';
import { GameChat } from '../components/GameChat';
import { usePageTitle } from '../lib';

const REASONS = {
    not_configured: 'The AI features are not set up on this server.',
    not_enabled: 'The AI features are not switched on for your account. An admin can turn them on.',
    budget_spent: "This month's AI budget is used up. It resets on the 1st."
} as const;

/** `/games/:id/chat`: a full page for the game helper, so a long answer has room and nothing jumps. */
export function GameChatPage() {
    const id = Number(useParams().id);
    const entry = useEntry(id);
    const status = useAiStatus();
    usePageTitle(entry.data ? `Ask about ${entry.data.game.name}` : undefined);

    if (entry.isPending || status.isPending) return <ChatSkeleton />;
    if (entry.isError || !entry.data)
        return (
            <div className="empty">
                <p>
                    <strong>That game isn't in your collection.</strong>
                </p>
                <Link to="/collection">Back to collection</Link>
            </div>
        );
    const game = entry.data.game;
    return (
        <section className="chat-page">
            <Link to={`/games/${id}`} className="back">
                <ArrowLeft aria-hidden="true" /> {game.name}
            </Link>
            <header className="chat-page__head">
                <span className="chat-page__cover">
                    <Cover imageId={game.coverImageId} name={game.name} size="cover_small" />
                </span>
                <div>
                    <h1>Ask about {game.name}</h1>
                    <p className="muted">A spoiler-aware helper that knows how far you've got.</p>
                </div>
            </header>
            {status.data?.available ? (
                <GameChat entry={entry.data} />
            ) : (
                <p className="panel" role="status">
                    {status.data?.reason
                        ? REASONS[status.data.reason]
                        : "The AI helper isn't available."}
                </p>
            )}
        </section>
    );
}

function ChatSkeleton() {
    return (
        <section className="chat-page" role="status" aria-label="Loading the helper">
            <span className="skeleton skeleton--line" style={{ width: 120 }} aria-hidden="true" />
            <div className="chat-page__head" aria-hidden="true">
                <span className="skeleton chat-page__cover" />
                <span className="skeleton skeleton--line" style={{ width: '60%', height: 28 }} />
            </div>
            <span
                className="skeleton skeleton--line"
                style={{ width: '100%', height: 88 }}
                aria-hidden="true"
            />
        </section>
    );
}
