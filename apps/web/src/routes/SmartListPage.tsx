import { Link, useNavigate, useParams } from 'react-router';
import { useDeleteSmartList, useSmartList } from '../api/smartLists';
import { useConfirm } from '../components/Confirm';
import { GameCard } from '../components/GameCard';
import { GameRow } from '../components/GameRow';
import { GridSkeletons } from '../components/GridSkeletons';
import { LayoutToggle, useLayout } from '../components/LayoutToggle';
import { LoadMore } from '../components/LoadMore';
import { ListLoading } from '../components/ListLoading';
import { usePageTitle } from '../lib';
import { ArrowLeft, FileSpreadsheet, Pencil, Trash2, WandSparkles } from 'lucide-react';

const LAYOUT_KEY = 'gq_smart_list_layout';

export function SmartListPage() {
    const id = Number(useParams().id);
    const list = useSmartList(id);
    usePageTitle(list.head?.name);
    if (list.isPending)
        return (
            <ListLoading
                icon={<WandSparkles aria-hidden="true" />}
                layoutKey={LAYOUT_KEY}
                readOnly
            />
        );
    if (list.isError || !list.head)
        return (
            <div className="empty">
                <p>
                    <strong>That smart list doesn't exist.</strong>
                </p>
                <Link to="/lists">Back to lists</Link>
            </div>
        );
    return <SmartListView paged={list} />;
}

function SmartListView({ paged }: { paged: ReturnType<typeof useSmartList> }) {
    const list = paged.head!;
    const isFetching = paged.isFetching;
    const navigate = useNavigate();
    const del = useDeleteSmartList(list.id);
    const confirm = useConfirm();
    const [layout, setLayout] = useLayout(LAYOUT_KEY);
    const entries = paged.items;
    const total = paged.total ?? entries.length;

    return (
        <section>
            <Link to="/lists" className="back">
                <ArrowLeft /> Lists
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <WandSparkles aria-hidden="true" />
                        {list.name}
                    </h1>
                    <p className="muted" aria-live="polite">
                        {total} {total === 1 ? 'game' : 'games'} · always up to date
                    </p>
                </div>
                <div className="row">
                    <Link className="btn btn--primary" to={`/pick/criteria?smart=${list.id}`}>
                        Random pick
                    </Link>
                    <Link className="btn" to={`/smart-lists/${list.id}/edit`}>
                        <Pencil />
                        Edit
                    </Link>
                    <a className="btn" href={`/api/smart-lists/${list.id}/export.csv`} download>
                        <FileSpreadsheet />
                        Export CSV
                    </a>
                    <button
                        className="btn btn--danger"
                        disabled={del.isPending}
                        onClick={async () =>
                            (await confirm({
                                title: `Delete “${list.name}”?`,
                                message:
                                    'The smart list will be removed. Your games are not affected.',
                                confirmLabel: 'Delete smart list',
                                tone: 'danger'
                            })) && del.mutate(undefined, { onSuccess: () => navigate('/lists') })
                        }
                    >
                        <Trash2 />
                        Delete
                    </button>
                </div>
            </div>

            {list.description && <p className="list-description">{list.description}</p>}
            <ul className="rule-summary" aria-label="Rules">
                {list.ruleText.map((d) => (
                    <li key={d} className="badge">
                        {d}
                    </li>
                ))}
            </ul>

            {total === 0 ? (
                <div className="empty">
                    <p>
                        <strong>No games match right now.</strong>
                    </p>
                    <p className="muted">
                        Games show up here by themselves when they fit the rules.
                    </p>
                </div>
            ) : (
                <>
                    <LayoutToggle layout={layout} onChange={setLayout} />
                    {layout === 'list' ? (
                        <ul className="game-rows" aria-busy={isFetching}>
                            {entries.map((e) => (
                                <GameRow key={e.id} entry={e} />
                            ))}
                        </ul>
                    ) : (
                        <ul className="grid" aria-busy={isFetching}>
                            {entries.map((e) => (
                                <GameCard key={e.id} entry={e} />
                            ))}
                        </ul>
                    )}
                    <LoadMore
                        shown={entries.length}
                        total={total}
                        hasMore={paged.hasNextPage}
                        loading={paged.isFetchingNextPage}
                        failed={paged.isFetchNextPageError}
                        onMore={() => paged.fetchNextPage()}
                        skeleton={<GridSkeletons layout={layout} count={4} />}
                    />
                </>
            )}
        </section>
    );
}
