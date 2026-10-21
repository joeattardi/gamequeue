import { ArrowLeft, WandSparkles } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfileList } from '../api/profile';
import { PublicGameList } from '../components/PublicGameList';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

/**
 * Public: one of someone's lists (`/u/:username/lists/:id`) or smart lists
 * (`/u/:username/smart-lists/:id`), reached from the tiles on their profile.
 */
export function ProfileListPage({ kind }: { kind: 'lists' | 'smart-lists' }) {
    const { username = '', id = '' } = useParams();
    const listId = Number(id);
    const valid = Number.isInteger(listId) && listId > 0;
    const list = useProfileList(username, kind, valid ? listId : 0);
    const name = list.head?.name;
    usePageTitle(name ? `${name} · ${username}` : `${username}'s list`);
    const notFound = !valid || (list.error instanceof ApiRequestError && list.error.status === 404);

    return (
        <>
            <PublicHeader />
            <main className="page">
                <Link to={`/u/${username}`} className="back">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {notFound && <p role="alert">There is nothing here.</p>}
                {!notFound && list.isError && <p role="alert">Couldn't load.</p>}
                {!notFound && !list.isError && (
                    <>
                        <h1>
                            {kind === 'smart-lists' && <WandSparkles aria-hidden="true" />}
                            {name ?? <span className="skeleton skeleton--title" />}
                        </h1>
                        {list.head?.description && (
                            <ul className="rule-summary" aria-label="Rules">
                                {list.head.description.map((d) => (
                                    <li key={d} className="badge">
                                        {d}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <PublicGameList
                            entries={list.isPending ? undefined : list.items}
                            numbered={kind === 'lists'}
                            empty="Nothing here yet."
                            paging={{
                                total: list.total,
                                hasMore: list.hasNextPage,
                                loading: list.isFetchingNextPage,
                                failed: list.isFetchNextPageError,
                                onMore: () => list.fetchNextPage()
                            }}
                        />
                    </>
                )}
            </main>
        </>
    );
}
