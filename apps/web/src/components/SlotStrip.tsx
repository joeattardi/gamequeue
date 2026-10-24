import { Link } from 'react-router';
import { useSlots } from '../api/slots';
import { Cover } from './Cover';

/** A glance at what's in the slots, under the sidebar's logo: one small cover per slot. */
export function SlotStrip() {
    const slots = useSlots();
    if (slots.isPending) {
        return (
            <div className="slot-strip" role="status" aria-label="Loading your current games">
                {[0, 1, 2].map((i) => (
                    <span key={i} className="skeleton slot-strip__item" aria-hidden="true" />
                ))}
            </div>
        );
    }
    // Nothing to show until a game is in a slot (the home page is where you fill them)
    if (!slots.data?.some((s) => s.entry)) return null;
    return (
        <ul className="slot-strip" aria-label="In your slots">
            {slots.data.map((slot) => {
                const entry = slot.entry;
                if (!entry) {
                    return (
                        <li key={slot.id}>
                            <Link
                                to="/"
                                className="slot-strip__item slot-strip__item--empty"
                                aria-label={`${slot.name}: empty`}
                                title={`${slot.name}: empty`}
                            />
                        </li>
                    );
                }
                const label = `${entry.game.name} (${entry.status})`;
                return (
                    <li key={slot.id}>
                        <Link
                            to={`/games/${entry.id}`}
                            className={`slot-strip__item${entry.status === 'paused' ? ' slot-strip__item--paused' : ''}`}
                            aria-label={label}
                            title={label}
                        >
                            {entry.game.coverImageId ? (
                                <Cover
                                    imageId={entry.game.coverImageId}
                                    name={entry.game.name}
                                    size="cover_small"
                                />
                            ) : (
                                <span aria-hidden="true">{entry.game.name.slice(0, 1)}</span>
                            )}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
