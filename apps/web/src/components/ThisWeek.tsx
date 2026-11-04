import { Link } from 'react-router';
import { useTimeline } from '../api/timeline';

const DAY = 86_400_000;
const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * A quiet one-line summary of the last seven days (games started and finished, from the activity
 * timeline), linking to Stats. Hidden while loading, on error, and when there was nothing.
 */
export function ThisWeek() {
    const now = new Date();
    const from = iso(new Date(now.getTime() - 6 * DAY));
    const timeline = useTimeline('me', from, iso(now));
    if (!timeline.data) return null;
    const since = new Date(from + 'T00:00:00').getTime();
    const count = (type: string) =>
        timeline.data.events.filter((e) => e.type === type && e.at >= since).length;
    const parts = [
        [count('started'), 'started'],
        [count('finished'), 'finished']
    ]
        .filter(([n]) => (n as number) > 0)
        .map(([n, label]) => `${n} ${label}`);
    if (parts.length === 0) return null;
    return (
        <p className="this-week muted">
            This week: {parts.join(' · ')}. <Link to="/stats">See your stats</Link>
        </p>
    );
}
