import { TIMELINE_GROUP_LABELS, TIMELINE_GROUPS, type TimelineDto } from '@gamequeue/shared';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent
} from 'react';
import { Link } from 'react-router';
import { useTimeline } from '../api/timeline';
import {
    buildCalendar,
    calendarRange,
    levelOf,
    type Calendar,
    type CalendarDay
} from '../calendar';
import { todayLocal } from '../lib';
import { ActivityList } from './ActivityFeed';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Cell fill per intensity step (share of the hue over the empty cell) */
const LEVEL_PCT = [0, 40, 60, 80, 100];

const longDate = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

/** One hue per group at the day's intensity; a day with several groups is cut into diagonal stripes. */
function cellStyle(day: CalendarDay): CSSProperties | undefined {
    if (day.groups.length === 0) return undefined;
    const pct = LEVEL_PCT[levelOf(day.events.length)];
    const tones = day.groups.map(
        (g) => `color-mix(in srgb, var(--cal-${g}) ${pct}%, var(--cal-empty))`
    );
    if (tones.length === 1) return { background: tones[0] };
    const step = 100 / tones.length;
    const stops = tones.map((t, i) => `${t} ${i * step}% ${(i + 1) * step}%`).join(', ');
    return { background: `linear-gradient(135deg, ${stops})` };
}

function cellLabel(day: CalendarDay) {
    const parts = TIMELINE_GROUPS.filter((g) => day.counts[g] > 0).map(
        (g) => `${day.counts[g]} ${TIMELINE_GROUP_LABELS[g].toLowerCase()}`
    );
    const playing =
        day.playing.length > 0 ? `playing ${day.playing.map((p) => p.name).join(', ')}` : '';
    const detail = [...parts, playing].filter(Boolean).join('; ');
    return `${longDate(day.key)}: ${detail || 'nothing'}`;
}

function DayPanel({ username, day }: { username: string; day: CalendarDay | undefined }) {
    if (!day) return <p className="muted cal__hint">Select a day to see what happened.</p>;
    // The feed shows newest first; a day's events come oldest first
    const events = [...day.events].reverse();
    return (
        <div className="cal__panel">
            <h3 className="cal__date">{longDate(day.key)}</h3>
            {day.playing.length > 0 && (
                <p className="cal__playing">
                    <span className="muted">Playing: </span>
                    {day.playing.map((g, i) => (
                        <span key={g.id}>
                            {i > 0 && ', '}
                            <Link to={`/u/${username}/games/${g.id}`}>{g.name}</Link>
                        </span>
                    ))}
                </p>
            )}
            {events.length > 0 ? (
                <ActivityList username={username} events={events} />
            ) : (
                day.playing.length === 0 && <p className="muted">Nothing happened this day.</p>
            )}
        </div>
    );
}

function Legend() {
    return (
        <div className="cal__legend">
            <ul aria-label="Colours">
                {TIMELINE_GROUPS.map((g) => (
                    <li key={g}>
                        <span className={`cal__key cal__key--${g}`} aria-hidden="true" />
                        {TIMELINE_GROUP_LABELS[g]}
                    </li>
                ))}
                <li>
                    <span className="cal__key cal__key--playing" aria-hidden="true" />
                    Playing
                </li>
            </ul>
            <p className="muted">
                Brighter means more actions that day. A day with different kinds of actions is split
                into stripes.
            </p>
        </div>
    );
}

function Grid({
    calendar,
    pinned,
    onPin,
    onHover
}: {
    calendar: Calendar;
    pinned: string | null;
    onPin: (key: string) => void;
    onHover: (key: string | null) => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    const [focusKey, setFocusKey] = useState(calendar.to);

    // Newest weeks matter most; start scrolled to the right on narrow screens
    useEffect(() => {
        const el = root.current?.parentElement;
        if (el) el.scrollLeft = el.scrollWidth;
    }, [calendar]);

    const labels = useMemo(() => {
        const out: { col: number; text: string }[] = [];
        let prevMonth = -1;
        let lastCol = -10;
        calendar.weeks.forEach((w, i) => {
            const month = Number(w[0]!.key.slice(5, 7)) - 1;
            if (month !== prevMonth && i - lastCol >= 3) {
                out.push({ col: i + 1, text: MONTHS[month]! });
                lastCol = i;
            }
            prevMonth = month;
        });
        return out;
    }, [calendar]);

    const onKey = (e: KeyboardEvent) => {
        const delta = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        const d = new Date(`${focusKey}T12:00:00`);
        d.setDate(d.getDate() + delta);
        const next = d.toLocaleDateString('sv'); // YYYY-MM-DD in local time
        if (next < calendar.from || next > calendar.to) return;
        setFocusKey(next);
        requestAnimationFrame(() =>
            root.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus()
        );
    };

    return (
        <div className="cal__scroll">
            <div className="cal__months" aria-hidden="true">
                {labels.map((l) => (
                    <span key={l.col} style={{ gridColumn: l.col }}>
                        {l.text}
                    </span>
                ))}
            </div>
            <div
                ref={root}
                className="cal__grid"
                role="group"
                aria-label="Days, one square each. Arrow keys move between days."
                onKeyDown={onKey}
                onMouseLeave={() => onHover(null)}
            >
                {calendar.weeks.flat().map((day) => (
                    <button
                        key={day.key}
                        type="button"
                        className="cal__cell"
                        data-day={day.key}
                        data-playing={day.playing.length > 0 || undefined}
                        style={cellStyle(day)}
                        aria-label={cellLabel(day)}
                        aria-pressed={pinned === day.key}
                        tabIndex={focusKey === day.key ? 0 : -1}
                        onClick={() => {
                            setFocusKey(day.key);
                            onPin(day.key);
                        }}
                        onMouseEnter={() => onHover(day.key)}
                        onFocus={() => setFocusKey(day.key)}
                    />
                ))}
            </div>
        </div>
    );
}

/** The calendar once its data is in. Split out so the state resets with each new window. */
function CalendarBody({
    username,
    timeline,
    today
}: {
    username: string;
    timeline: TimelineDto;
    today: string;
}) {
    const calendar = useMemo(() => buildCalendar(timeline, today), [timeline, today]);
    const days = useMemo(() => new Map(calendar.weeks.flat().map((d) => [d.key, d])), [calendar]);
    const [pinned, setPinned] = useState<string | null>(null);
    const [hover, setHover] = useState<string | null>(null);
    const shown = days.get(hover ?? pinned ?? '');
    return (
        <>
            <Grid
                calendar={calendar}
                pinned={pinned}
                onPin={(key) => setPinned((p) => (p === key ? null : key))}
                onHover={setHover}
            />
            <Legend />
            <div aria-live="polite">
                <DayPanel username={username} day={shown} />
            </div>
        </>
    );
}

export function ActivityCalendarSkeleton() {
    return (
        <div className="cal__skeleton" role="status" aria-label="Loading calendar">
            <span className="skeleton cal__skeleton-grid" aria-hidden="true" />
        </div>
    );
}

/**
 * A year of days as squares, like a contribution graph: brighter for more actions, striped when a
 * day mixed kinds of actions, a bar under the days a game was being played. Click or tap a day to
 * pin its list below, or hover (or arrow-key) to preview it. `me` reads your own, `username` a
 * public profile (which is empty, so the section hides, when its owner hides their activity).
 */
export function ActivityCalendar({
    username,
    scope
}: {
    username: string;
    scope: 'me' | { username: string };
}) {
    const today = todayLocal();
    const { from, to } = calendarRange(today);
    const timeline = useTimeline(scope, from, to);
    const empty =
        timeline.data && timeline.data.events.length === 0 && timeline.data.playing.length === 0;
    if ((timeline.isError && !timeline.data) || (scope !== 'me' && empty)) return null;
    return (
        <section aria-labelledby="cal-h" className="cal">
            <h2 id="cal-h">Activity calendar</h2>
            {timeline.isPending ? (
                <ActivityCalendarSkeleton />
            ) : (
                <CalendarBody username={username} timeline={timeline.data} today={today} />
            )}
        </section>
    );
}
