import { ENTRY_STATUSES, type PublicEntryDto } from '@gamequeue/shared';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProfile } from '../api/profile';
import { Cover } from '../components/Cover';
import { Logo } from '../components/Logo';

function Games({ entries }: { entries: PublicEntryDto[] }) {
    if (entries.length === 0) return <p className="muted">Nothing here yet.</p>;
    return (
        <ul className="grid">
            {entries.map((e) => (
                <li key={e.id}>
                    <Cover imageId={e.game.coverImageId} name={e.game.name} />
                    <strong>{e.game.name}</strong>
                    <div>
                        <span className={`badge badge--${e.status}`}>{e.status}</span>
                        {e.rating !== null && <span className="muted"> {e.rating}/10</span>}
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** Public: rendered for logged-out visitors too, so it brings its own header instead of the Shell. */
export function ProfilePage() {
    const { username = '' } = useParams();
    const profile = useProfile(username);
    const notFound =
        profile.error instanceof ApiRequestError ? profile.error.status === 404 : false;

    return (
        <>
            <header className="topbar">
                <Link to="/">
                    <Logo />
                </Link>
            </header>
            <main className="page">
                {profile.isPending && <p role="status">Loading…</p>}
                {profile.isError && (
                    <p role="alert">
                        {notFound ? `There is no user called "${username}".` : "Couldn't load."}
                    </p>
                )}
                {profile.data && (
                    <>
                        <div className="page-head">
                            <div>
                                <h1>{profile.data.username}</h1>
                                <p className="muted">
                                    Joined{' '}
                                    {new Date(profile.data.joinedAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long'
                                    })}
                                </p>
                            </div>
                        </div>

                        <section aria-labelledby="p-collection">
                            <h2 id="p-collection">Collection</h2>
                            <p>
                                {profile.data.summary.total} games
                                {ENTRY_STATUSES.filter(
                                    (s) => profile.data.summary.byStatus[s] > 0
                                ).map((s) => (
                                    <span key={s}>
                                        {' · '}
                                        {profile.data.summary.byStatus[s]} {s}
                                    </span>
                                ))}
                            </p>
                        </section>

                        <section aria-labelledby="p-playing">
                            <h2 id="p-playing">Currently playing</h2>
                            <Games
                                entries={profile.data.slots.flatMap((s) =>
                                    s.entry ? [s.entry] : []
                                )}
                            />
                        </section>

                        {profile.data.lists.map((l) => (
                            <section key={l.id} aria-label={l.name}>
                                <h2>{l.name}</h2>
                                <Games entries={l.entries} />
                            </section>
                        ))}
                    </>
                )}
            </main>
        </>
    );
}
