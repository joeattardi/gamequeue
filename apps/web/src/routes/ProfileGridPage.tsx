import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { usePublicGrid } from '../api/grids';
import { Footer } from '../components/Footer';
import { GridBoard, GridBoardSkeleton } from '../components/GridBoard';
import { PublicHeader } from '../components/PublicHeader';
import { usePageTitle } from '../lib';

/** Public: someone's grid (`/u/:username/grids/:id`). Needs no login. */
export function ProfileGridPage() {
    const { username = '', id = '' } = useParams();
    const grid = usePublicGrid(username, Number(id));
    usePageTitle(grid.data ? `${grid.data.title} by ${username}` : 'Grid');
    const notFound = grid.error instanceof ApiRequestError && grid.error.status === 404;

    return (
        <>
            <PublicHeader />
            <main className="page grid-page">
                <Link to={`/u/${username}`} className="back-link">
                    <ArrowLeft aria-hidden="true" /> {username}
                </Link>
                {grid.isError && (
                    <p role="alert">{notFound ? 'There is nothing here.' : "Couldn't load."}</p>
                )}
                {grid.isPending && <GridBoardSkeleton />}
                {grid.data && (
                    <>
                        <h1>{grid.data.title}</h1>
                        <p className="muted">
                            by <Link to={`/u/${username}`}>{username}</Link>
                        </p>
                        {grid.data.description && <p>{grid.data.description}</p>}
                        <GridBoard grid={grid.data} />
                    </>
                )}
            </main>
            <Footer />
        </>
    );
}
