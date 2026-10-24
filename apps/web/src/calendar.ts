import {
    TIMELINE_GROUPS,
    timelineGroupOf,
    type ActivityEventDto,
    type TimelineDto,
    type TimelineGroup
} from '@gamequeue/shared';

export interface CalendarDay {
    /** Local calendar day, `YYYY-MM-DD` */
    key: string;
    /** 0 = Sunday */
    weekday: number;
    /** Newest last, like the day's story */
    events: ActivityEventDto[];
    /** Events per colour group */
    counts: Record<TimelineGroup, number>;
    /** Groups the day has, in `TIMELINE_GROUPS` order: the hues of its cell */
    groups: TimelineGroup[];
    /** Games with a playthrough covering this day */
    playing: { id: number; name: string }[];
}

export interface Calendar {
    /** First day shown (a Sunday) and last (today) */
    from: string;
    to: string;
    /** Whole weeks, Sunday first; the last one may stop at today */
    weeks: CalendarDay[][];
    /** Events in the window */
    total: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKeyOf = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Midday, so adding days never lands on the wrong date across a DST change */
const parse = (key: string) => new Date(`${key}T12:00:00`);
const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
};

/** The days the calendar covers: 52 full weeks back from this week's Sunday, up to `today`. */
export function calendarRange(today: string): { from: string; to: string } {
    const t = parse(today);
    return { from: dayKeyOf(addDays(t, -t.getDay() - 52 * 7)), to: today };
}

/** Intensity step 1-4 from a day's event count; there are few events a day, so no proportional scale. */
export const levelOf = (total: number) => Math.min(4, total);

/** Buckets the server's events and playthroughs into the viewer's local days. */
export function buildCalendar(timeline: TimelineDto, today: string): Calendar {
    const { from, to } = calendarRange(today);
    const days = new Map<string, CalendarDay>();
    const weeks: CalendarDay[][] = [];
    for (let d = parse(from); dayKeyOf(d) <= to; d = addDays(d, 1)) {
        const day: CalendarDay = {
            key: dayKeyOf(d),
            weekday: d.getDay(),
            events: [],
            counts: { finished: 0, played: 0, collected: 0 },
            groups: [],
            playing: []
        };
        days.set(day.key, day);
        if (day.weekday === 0) weeks.push([]);
        weeks[weeks.length - 1]!.push(day);
    }
    let total = 0;
    for (const event of timeline.events) {
        const day = days.get(dayKeyOf(new Date(event.at)));
        if (!day) continue;
        day.events.push(event);
        day.counts[timelineGroupOf(event.type)]++;
        total++;
    }
    for (const day of days.values()) day.groups = TIMELINE_GROUPS.filter((g) => day.counts[g] > 0);
    for (const p of timeline.playing) {
        const end = p.end < to ? p.end : to;
        for (let d = parse(p.start < from ? from : p.start); dayKeyOf(d) <= end; d = addDays(d, 1))
            days.get(dayKeyOf(d))?.playing.push(p.game);
    }
    return { from, to, weeks, total };
}
