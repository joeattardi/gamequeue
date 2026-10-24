import type { ActivityEventDto } from '@gamequeue/shared';

/** One row of the feed: a single event, or a run of the same action on several games. */
export type ActivityItem =
    | { kind: 'single'; at: number; event: ActivityEventDto }
    | { kind: 'burst'; at: number; type: ActivityEventDto['type']; events: ActivityEventDto[] };

export interface ActivityDay {
    /** Local calendar day, `YYYY-MM-DD` */
    key: string;
    /** "Today", "Yesterday", or the date */
    label: string;
    items: ActivityItem[];
}

/** A run this long (or longer) of the same action collapses into one row. */
export const MIN_BURST = 3;

const dayKey = (at: number) => {
    const d = new Date(at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function dayLabel(at: number, now: number): string {
    if (dayKey(at) === dayKey(now)) return 'Today';
    if (dayKey(at) === dayKey(now - 86_400_000)) return 'Yesterday';
    const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
    return new Date(at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: sameYear ? undefined : 'numeric'
    });
}

/** Only things done to a game can be folded together; creating a grid or moving a slot stays single. */
const foldable = (e: ActivityEventDto) => e.game !== null && e.type !== 'slotted';

/**
 * Newest-first events into days, with each day's consecutive runs of the same action on games
 * (at least `MIN_BURST` long) folded into one item. Days are the viewer's local days.
 */
export function groupActivity(
    events: ActivityEventDto[],
    now = Date.now(),
    minBurst = MIN_BURST
): ActivityDay[] {
    const days: ActivityDay[] = [];
    for (const event of events) {
        const key = dayKey(event.at);
        let day = days[days.length - 1];
        if (!day || day.key !== key) {
            day = { key, label: dayLabel(event.at, now), items: [] };
            days.push(day);
        }
        day.items.push({ kind: 'single', at: event.at, event });
    }
    for (const day of days) {
        const items: ActivityItem[] = [];
        let run: ActivityEventDto[] = [];
        const flush = () => {
            if (run.length >= minBurst)
                items.push({ kind: 'burst', at: run[0]!.at, type: run[0]!.type, events: run });
            else
                items.push(
                    ...run.map((event) => ({ kind: 'single' as const, at: event.at, event }))
                );
            run = [];
        };
        for (const item of day.items) {
            const e = (item as { event: ActivityEventDto }).event;
            if (foldable(e) && run.length > 0 && run[0]!.type === e.type) run.push(e);
            else {
                flush();
                if (foldable(e)) run = [e];
                else items.push(item);
            }
        }
        flush();
        day.items = items;
    }
    return days;
}

/** The first `max` rows across the days, and how many raw events they stand for. */
export function limitDays(
    days: ActivityDay[],
    max: number
): { days: ActivityDay[]; events: number } {
    const out: ActivityDay[] = [];
    let left = max;
    let events = 0;
    for (const day of days) {
        if (left <= 0) break;
        const items = day.items.slice(0, left);
        left -= items.length;
        events += items.reduce((n, i) => n + (i.kind === 'burst' ? i.events.length : 1), 0);
        out.push({ ...day, items });
    }
    return { days: out, events };
}
