import {
    SMART_NUMBER_FIELDS,
    SMART_NUMBER_FIELD_INFO,
    SMART_SORTS,
    SMART_SORT_LABELS,
    ENTRY_STATUSES,
    defaultSmartDir,
    evaluateSmartList,
    smartRulesSchema,
    type EntryDto,
    type SmartListDetailDto,
    type SmartNumberField,
    type SmartRule,
    type SmartSort,
    type SortDir
} from '@gamequeue/shared';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useEntries, useFacets } from '../api/collection';
import { useCreateSmartList, useSmartList, useUpdateSmartList } from '../api/smartLists';
import { GameCard } from '../components/GameCard';
import { CheckSkeletons, EditorSkeleton } from '../components/PageSkeletons';
import { usePageTitle } from '../lib';
import { ArrowLeft, Save, Trash2, WandSparkles } from 'lucide-react';

type RuleKind = 'status' | 'platform' | 'genre' | 'tag' | 'finishedYear' | SmartNumberField;
const RULE_KINDS: RuleKind[] = [
    'status',
    'platform',
    'genre',
    'tag',
    'finishedYear',
    ...SMART_NUMBER_FIELDS
];
const SET_LABELS = {
    status: 'Status',
    platform: 'Platform',
    genre: 'Genre',
    tag: 'Tag',
    finishedYear: 'Year finished'
} as const;
const kindLabel = (k: RuleKind) =>
    k in SET_LABELS
        ? SET_LABELS[k as keyof typeof SET_LABELS]
        : SMART_NUMBER_FIELD_INFO[k as SmartNumberField].label;

const DEFAULT_VALUE: Record<SmartNumberField, number> = {
    ttb: 300,
    igdbScore: 75,
    rating: 4,
    addedDays: 30,
    changedDays: 30,
    finishedDays: 365,
    releaseYear: 2000
};

function defaultRule(kind: RuleKind): SmartRule {
    switch (kind) {
        case 'status':
            return { field: 'status', anyOf: ['unplayed'] };
        case 'platform':
            return { field: 'platform', anyOf: [] };
        case 'genre':
            return { field: 'genre', anyOf: [] };
        case 'tag':
            return { field: 'tag', anyOf: [] };
        case 'finishedYear':
            return { field: 'finishedYear', anyOf: [new Date().getFullYear()] };
        default:
            return { field: kind, op: 'gte', value: DEFAULT_VALUE[kind] };
    }
}

interface Row {
    key: number;
    rule: SmartRule;
}

/** Creates a smart list (`/smart-lists/new`) or edits one (`/smart-lists/:id/edit`). */
export function SmartListEditPage() {
    const id = Number(useParams().id);
    const editing = Number.isInteger(id) && id > 0;
    const list = useSmartList(editing ? id : 0);
    usePageTitle(editing ? 'Edit smart list' : 'New smart list');
    if (!editing) return <Editor />;
    if (list.isPending) return <EditorSkeleton />;
    if (list.isError || !list.data)
        return (
            <div className="empty">
                <p>
                    <strong>That smart list doesn't exist.</strong>
                </p>
                <Link to="/lists">Back to lists</Link>
            </div>
        );
    return <Editor existing={list.data} />;
}

function Editor({ existing }: { existing?: SmartListDetailDto }) {
    const navigate = useNavigate();
    const create = useCreateSmartList();
    const update = useUpdateSmartList(existing?.id ?? 0);
    const facets = useFacets();
    const everything = useEntries(new URLSearchParams());

    const keys = useRef(0);
    const makeRow = (rule: SmartRule): Row => ({ key: keys.current++, rule });
    const [name, setName] = useState(existing?.name ?? '');
    const [rows, setRows] = useState<Row[]>(() => (existing?.rules ?? []).map(makeRow));
    const [sort, setSort] = useState<SmartSort>(existing?.sort ?? 'title');
    const [dir, setDir] = useState<SortDir>(existing?.dir ?? 'asc');
    const [error, setError] = useState<string>();

    // Years the user has finished something in, plus this one, newest first
    const years = useMemo(
        () =>
            [
                ...new Set([
                    new Date().getFullYear(),
                    ...(everything.data ?? []).flatMap((e) => e.finishedYears)
                ])
            ].sort((a, b) => b - a),
        [everything.data]
    );
    const rules = rows.map((r) => r.rule);
    const valid = smartRulesSchema.safeParse(rules).success;
    const matches = useMemo(
        () =>
            valid && everything.data
                ? evaluateSmartList(everything.data, rules, sort, dir)
                : undefined,
        // `rules` is derived from `rows`
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [valid, everything.data, rows, sort, dir]
    );

    const setRule = (key: number, rule: SmartRule) =>
        setRows((rs) => rs.map((r) => (r.key === key ? { ...r, rule } : r)));

    function submit(e: FormEvent) {
        e.preventDefault();
        setError(undefined);
        const input = { name: name.trim(), rules, sort, dir };
        const opts = {
            onSuccess: (saved: SmartListDetailDto) => navigate(`/smart-lists/${saved.id}`),
            onError: (err: unknown) =>
                setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.')
        };
        if (existing) update.mutate(input, opts);
        else create.mutate(input, opts);
    }

    const saving = create.isPending || update.isPending;
    return (
        <section>
            <Link to={existing ? `/smart-lists/${existing.id}` : '/lists'} className="back">
                <ArrowLeft /> {existing ? existing.name : 'Lists'}
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <WandSparkles aria-hidden="true" />
                        {existing ? 'Edit smart list' : 'New smart list'}
                    </h1>
                    <p className="muted">
                        A smart list collects every game that matches all of its rules, and keeps up
                        as your collection changes.
                    </p>
                </div>
            </div>

            <form className="stack" onSubmit={submit}>
                <label className="field">
                    <span>Name</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={60}
                        placeholder="e.g. Quick wins"
                        autoFocus={!existing}
                    />
                </label>

                <div className="stack" role="group" aria-label="Rules">
                    <h2 className="rules__title">Rules</h2>
                    {rows.length === 0 && (
                        <p className="muted">
                            No rules yet. Add one below; a game has to match every rule to be in the
                            list.
                        </p>
                    )}
                    {rows.map((row, i) => (
                        <RuleEditor
                            key={row.key}
                            index={i}
                            rule={row.rule}
                            facets={facets.data}
                            facetsPending={facets.isPending}
                            years={years}
                            onChange={(rule) => setRule(row.key, rule)}
                            onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                        />
                    ))}
                    <label className="field rules__add">
                        <span>Add a rule</span>
                        <select
                            value=""
                            onChange={(e) => {
                                const kind = e.target.value as RuleKind;
                                if (kind) setRows((rs) => [...rs, makeRow(defaultRule(kind))]);
                            }}
                        >
                            <option value="">Choose what to match on…</option>
                            {RULE_KINDS.map((k) => (
                                <option key={k} value={k}>
                                    {kindLabel(k)}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="inline-form">
                    <label className="field">
                        <span>Sort by</span>
                        <select
                            value={sort}
                            onChange={(e) => {
                                const next = e.target.value as SmartSort;
                                setSort(next);
                                setDir(defaultSmartDir(next));
                            }}
                        >
                            {SMART_SORTS.map((s) => (
                                <option key={s} value={s}>
                                    {SMART_SORT_LABELS[s]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="field">
                        <span>Order</span>
                        <select value={dir} onChange={(e) => setDir(e.target.value as SortDir)}>
                            <option value="asc">Ascending</option>
                            <option value="desc">Descending</option>
                        </select>
                    </label>
                </div>

                <Preview matches={matches} pending={everything.isPending} valid={valid} />

                <p className="form-error" role="alert">
                    {error}
                </p>
                <div className="row">
                    <button
                        className="btn btn--primary"
                        type="submit"
                        disabled={saving || !valid || !name.trim()}
                    >
                        <Save />
                        {saving ? 'Saving…' : 'Save smart list'}
                    </button>
                    <Link
                        className="btn btn--ghost"
                        to={existing ? `/smart-lists/${existing.id}` : '/lists'}
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </section>
    );
}

const PREVIEW_LIMIT = 12;

function Preview({
    matches,
    pending,
    valid
}: {
    matches: EntryDto[] | undefined;
    pending: boolean;
    valid: boolean;
}) {
    return (
        <section className="panel" aria-labelledby="preview-h" aria-live="polite">
            <h2 id="preview-h">Preview</h2>
            {pending ? (
                <p className="muted" role="status">
                    <span className="skeleton skeleton--line skeleton--subtitle" />
                </p>
            ) : !valid || !matches ? (
                <p className="muted">
                    Add at least one rule, and fill in every choice, to see what matches.
                </p>
            ) : matches.length === 0 ? (
                <p className="muted">No games match right now.</p>
            ) : (
                <>
                    <p className="muted">
                        {matches.length} {matches.length === 1 ? 'game matches' : 'games match'}
                        {matches.length > PREVIEW_LIMIT && ` · showing the first ${PREVIEW_LIMIT}`}
                    </p>
                    <ul className="grid">
                        {matches.slice(0, PREVIEW_LIMIT).map((e) => (
                            <GameCard key={e.id} entry={e} />
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

type Facets = NonNullable<ReturnType<typeof useFacets>['data']>;

function RuleEditor({
    index,
    rule,
    facets,
    facetsPending,
    years,
    onChange,
    onRemove
}: {
    index: number;
    rule: SmartRule;
    facets: Facets | undefined;
    facetsPending: boolean;
    years: number[];
    onChange: (rule: SmartRule) => void;
    onRemove: () => void;
}) {
    const kind = rule.field as RuleKind;
    const n = index + 1;
    return (
        <fieldset className="rule">
            <legend className="sr-only">Rule {n}</legend>
            <div className="rule__head">
                <label className="field">
                    <span className="sr-only">Rule {n}: what to match on</span>
                    <select
                        value={kind}
                        onChange={(e) => onChange(defaultRule(e.target.value as RuleKind))}
                    >
                        {RULE_KINDS.map((k) => (
                            <option key={k} value={k}>
                                {kindLabel(k)}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="btn btn--ghost btn--danger"
                    onClick={onRemove}
                    aria-label={`Remove rule ${n}`}
                >
                    <Trash2 />
                </button>
            </div>
            <RuleBody
                rule={rule}
                facets={facets}
                facetsPending={facetsPending}
                years={years}
                onChange={onChange}
                label={`Rule ${n}`}
            />
        </fieldset>
    );
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

function RuleBody({
    rule,
    facets,
    facetsPending,
    years,
    onChange,
    label
}: {
    rule: SmartRule;
    facets: Facets | undefined;
    facetsPending: boolean;
    years: number[];
    onChange: (rule: SmartRule) => void;
    label: string;
}) {
    if (rule.field === 'status') {
        return (
            <CheckSet
                label={`${label}: status is any of`}
                options={ENTRY_STATUSES.map((s) => ({ key: s, label: cap(s) }))}
                selected={rule.anyOf}
                onToggle={(s) => onChange({ ...rule, anyOf: toggle(rule.anyOf, s) })}
            />
        );
    }
    if (rule.field === 'finishedYear') {
        // Keep years saved on the rule visible even if nothing is finished in them now
        const options = [...new Set([...years, ...rule.anyOf])]
            .sort((a, b) => b - a)
            .map((y) => ({ key: y, label: String(y) }));
        return (
            <CheckSet
                label={`${label}: finished in any of`}
                options={options}
                selected={rule.anyOf}
                onToggle={(y) => onChange({ ...rule, anyOf: toggle(rule.anyOf, y) })}
            />
        );
    }
    if (rule.field === 'platform' || rule.field === 'genre' || rule.field === 'tag') {
        if (facetsPending) return <CheckSkeletons label="Loading your options" />;
        const known: { key: string | number; label: string }[] =
            rule.field === 'platform'
                ? (facets?.platforms ?? []).map((p) => ({ key: p.id, label: p.name }))
                : rule.field === 'genre'
                  ? (facets?.genres ?? []).map((g) => ({ key: g.name, label: g.name }))
                  : (facets?.tags ?? []).map((t) => ({ key: t, label: t }));
        // Keep choices that are saved on the rule but no longer in the collection visible
        const extra = (rule.anyOf as (string | number)[])
            .filter((v) => !known.some((k) => k.key === v))
            .map((v) => ({ key: v, label: String(v) }));
        const options = [...known, ...extra];
        const noun = SET_LABELS[rule.field].toLowerCase();
        if (options.length === 0)
            return <p className="muted">You have no {noun}s yet, so this rule can't match.</p>;
        return (
            <CheckSet
                label={`${label}: ${noun} is any of`}
                options={options}
                selected={rule.anyOf as (string | number)[]}
                onToggle={(v) =>
                    onChange({
                        ...rule,
                        anyOf: toggle(rule.anyOf as (string | number)[], v)
                    } as SmartRule)
                }
            />
        );
    }
    return <NumberRuleBody rule={rule} onChange={onChange} label={label} />;
}

function CheckSet<T extends string | number>({
    label,
    options,
    selected,
    onToggle
}: {
    label: string;
    options: { key: T; label: string }[];
    selected: T[];
    onToggle: (key: T) => void;
}) {
    return (
        <fieldset className="checks">
            <legend className="sr-only">{label}</legend>
            {options.map((o) => (
                <label key={o.key} className="check">
                    <input
                        type="checkbox"
                        checked={selected.includes(o.key)}
                        onChange={() => onToggle(o.key)}
                    />
                    {o.label}
                </label>
            ))}
            {selected.length === 0 && <p className="muted rule__hint">Pick at least one.</p>}
        </fieldset>
    );
}

const OP_LABELS = {
    releaseYear: { gte: 'in or after', lte: 'in or before' },
    default: { gte: 'at least', lte: 'at most' }
};

function NumberRuleBody({
    rule,
    onChange,
    label
}: {
    rule: Extract<SmartRule, { field: SmartNumberField }>;
    onChange: (rule: SmartRule) => void;
    label: string;
}) {
    const info = SMART_NUMBER_FIELD_INFO[rule.field];
    const hours = rule.field === 'ttb';
    const [text, setText] = useState(
        rule.op === 'unknown' ? '' : String(hours ? rule.value / 60 : rule.value)
    );
    // NaN marks an unfinished number, which the schema rejects (so Save stays disabled)
    const parse = (t: string) => {
        const v = t.trim() === '' ? NaN : Number(t);
        return Number.isFinite(v) && v >= 0 ? Math.round(hours ? v * 60 : v) : NaN;
    };
    const ops = rule.field === 'releaseYear' ? OP_LABELS.releaseYear : OP_LABELS.default;
    return (
        <div className="inline-form">
            <label className="field">
                <span className="sr-only">{label}: comparison</span>
                <select
                    value={rule.op}
                    onChange={(e) => {
                        const op = e.target.value as 'gte' | 'lte' | 'unknown';
                        onChange(
                            op === 'unknown'
                                ? { field: rule.field, op }
                                : { field: rule.field, op, value: parse(text) }
                        );
                    }}
                >
                    <option value="gte">{ops.gte}</option>
                    <option value="lte">{ops.lte}</option>
                    <option value="unknown">is unknown</option>
                </select>
            </label>
            {rule.op !== 'unknown' && (
                <label className="field">
                    <span className="sr-only">
                        {label}: {hours ? 'hours' : info.unit}
                    </span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={hours ? 0.5 : 1}
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            onChange({ ...rule, value: parse(e.target.value) });
                        }}
                        aria-invalid={Number.isNaN(rule.value)}
                    />
                </label>
            )}
            {rule.op !== 'unknown' && (
                <span className="muted rule__unit">{hours ? 'hours' : info.unit}</span>
            )}
            <span className="muted rule__hint">{info.hint}</span>
        </div>
    );
}
