import { Navigate, Route, Routes } from 'react-router';
import { useMe } from './api/auth';
import { BootSkeleton } from './components/PageSkeletons';
import { Shell } from './components/Shell';
import { AuthPage } from './routes/AuthPage';
import { CollectionPage } from './routes/CollectionPage';
import { DataPage } from './routes/DataPage';
import { EntryPage } from './routes/EntryPage';
import { GameDetailPage } from './routes/GameDetailPage';
import { SearchPage } from './routes/SearchPage';
import { Home } from './routes/Home';
import { ListPage, QueuePage } from './routes/ListPage';
import { ListsPage } from './routes/ListsPage';
import { PickChoosePage } from './routes/PickChoosePage';
import { PickCriteriaPage } from './routes/PickCriteriaPage';
import { PickPage } from './routes/PickPage';
import { ProfilePage } from './routes/ProfilePage';
import { ProfileGamesPage } from './routes/ProfileGamesPage';
import { ProfileWishlistPage } from './routes/ProfileWishlistPage';
import { WishlistPage } from './routes/WishlistPage';

export function App() {
    const me = useMe();
    if (me.isPending) return <BootSkeleton />;
    if (me.isError)
        return (
            <p className="boot" role="alert">
                Can't reach the server. Is it running?
            </p>
        );

    if (!me.data) {
        return (
            <Routes>
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/register" element={<AuthPage mode="register" />} />
                <Route path="/u/:username" element={<ProfilePage />} />
                <Route path="/u/:username/wishlist" element={<ProfileWishlistPage />} />
                <Route path="/u/:username/:view" element={<ProfileGamesPage />} />
                <Route path="/u/:username/:view/:year" element={<ProfileGamesPage />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }
    return (
        <Routes>
            <Route path="/u/:username" element={<ProfilePage />} />
            <Route path="/u/:username/wishlist" element={<ProfileWishlistPage />} />
            <Route path="/u/:username/:view" element={<ProfileGamesPage />} />
            <Route path="/u/:username/:view/:year" element={<ProfileGamesPage />} />
            <Route element={<Shell user={me.data} />}>
                <Route index element={<Home />} />
                <Route path="collection" element={<CollectionPage view="all" />} />
                <Route path="backlog" element={<CollectionPage view="backlog" />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="games/:id" element={<EntryPage />} />
                <Route path="games/igdb/:igdbId" element={<GameDetailPage />} />
                <Route path="queue" element={<QueuePage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="lists" element={<ListsPage />} />
                <Route path="lists/:id" element={<ListPage />} />
                <Route path="pick" element={<PickPage />} />
                <Route path="pick/criteria" element={<PickCriteriaPage />} />
                <Route path="pick/choose" element={<PickChoosePage />} />
                <Route path="data" element={<DataPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
