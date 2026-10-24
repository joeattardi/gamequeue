import { Navigate, Route, Routes } from 'react-router';
import { useMe } from './api/auth';
import { Splash } from './components/Splash';
import { Shell } from './components/Shell';
import { AdminPage } from './routes/AdminPage';
import { AdminErrorsPage } from './routes/AdminErrorsPage';
import { AdminIgdbPage } from './routes/AdminIgdbPage';
import { AdminServerPage } from './routes/AdminServerPage';
import { AdminDatabasePage } from './routes/AdminDatabasePage';
import { AdminTrafficPage } from './routes/AdminTrafficPage';
import { AdminUsersPage } from './routes/AdminUsersPage';
import { AdminUserPage } from './routes/AdminUserPage';
import { AuthPage } from './routes/AuthPage';
import { AccountPage } from './routes/AccountPage';
import { CollectionPage } from './routes/CollectionPage';
import { DataPage } from './routes/DataPage';
import { EntryPage } from './routes/EntryPage';
import { TierListPage } from './routes/TierListPage';
import { TierListsPage } from './routes/TierListsPage';
import { ProfileTierListPage } from './routes/ProfileTierListPage';
import { GridPage } from './routes/GridPage';
import { GridsPage } from './routes/GridsPage';
import { ProfileGridPage } from './routes/ProfileGridPage';
import { GameDetailPage } from './routes/GameDetailPage';
import { SeriesPage } from './routes/SeriesPage';
import { SearchPage } from './routes/SearchPage';
import { Home } from './routes/Home';
import { LandingPage } from './routes/LandingPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ListPage, QueuePage } from './routes/ListPage';
import { ListsPage } from './routes/ListsPage';
import { PickChoosePage } from './routes/PickChoosePage';
import { PickCriteriaPage } from './routes/PickCriteriaPage';
import { PickPage } from './routes/PickPage';
import { SmartListEditPage } from './routes/SmartListEditPage';
import { SmartListPage } from './routes/SmartListPage';
import { ProfileListPage } from './routes/ProfileListPage';
import { ProfilePage } from './routes/ProfilePage';
import { ProfileGamesPage } from './routes/ProfileGamesPage';
import { ProfileWishlistPage } from './routes/ProfileWishlistPage';
import { ProfileRecapPage, RecapPage } from './routes/RecapPage';
import { ProfileStatsPage, StatsPage } from './routes/StatsPage';
import { DiscoverPage } from './routes/DiscoverPage';
import { WishlistPage } from './routes/WishlistPage';

export function App() {
    const me = useMe();
    if (me.isPending) return <Splash />;
    if (me.isError)
        return (
            <p className="boot" role="alert">
                Can't reach the server. Is it running?
            </p>
        );

    if (!me.data) {
        return (
            <Routes>
                <Route index element={<LandingPage />} />
                <Route path="/login" element={<AuthPage mode="login" />} />
                <Route path="/register" element={<AuthPage mode="register" />} />
                <Route path="/u/:username" element={<ProfilePage />} />
                <Route path="/u/:username/wishlist" element={<ProfileWishlistPage />} />
                <Route path="/u/:username/lists/:id" element={<ProfileListPage kind="lists" />} />
                <Route
                    path="/u/:username/smart-lists/:id"
                    element={<ProfileListPage kind="smart-lists" />}
                />
                <Route path="/u/:username/grids/:id" element={<ProfileGridPage />} />
                <Route path="/u/:username/tiers/:id" element={<ProfileTierListPage />} />
                <Route path="/u/:username/stats" element={<ProfileStatsPage />} />
                <Route path="/u/:username/recap" element={<ProfileRecapPage />} />
                <Route path="/u/:username/recap/:year" element={<ProfileRecapPage />} />
                <Route path="/u/:username/:view" element={<ProfileGamesPage />} />
                <Route path="/u/:username/:view/:year" element={<ProfileGamesPage />} />
                <Route path="*" element={<NotFoundPage standalone />} />
            </Routes>
        );
    }
    return (
        <Routes>
            {/* Logging in or registering flips `me` while the URL is still the auth page. */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/u/:username" element={<ProfilePage />} />
            <Route path="/u/:username/wishlist" element={<ProfileWishlistPage />} />
            <Route path="/u/:username/lists/:id" element={<ProfileListPage kind="lists" />} />
            <Route
                path="/u/:username/smart-lists/:id"
                element={<ProfileListPage kind="smart-lists" />}
            />
            <Route path="/u/:username/grids/:id" element={<ProfileGridPage />} />
            <Route path="/u/:username/tiers/:id" element={<ProfileTierListPage />} />
            <Route path="/u/:username/stats" element={<ProfileStatsPage />} />
            <Route path="/u/:username/recap" element={<ProfileRecapPage />} />
            <Route path="/u/:username/recap/:year" element={<ProfileRecapPage />} />
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
                <Route path="discover" element={<DiscoverPage />} />
                <Route path="grids" element={<GridsPage />} />
                <Route path="grids/:id" element={<GridPage />} />
                <Route path="tiers" element={<TierListsPage />} />
                <Route path="tiers/:id" element={<TierListPage />} />
                <Route path="series/:id" element={<SeriesPage />} />
                <Route path="lists" element={<ListsPage />} />
                <Route path="lists/:id" element={<ListPage />} />
                <Route path="smart-lists/new" element={<SmartListEditPage />} />
                <Route path="smart-lists/:id" element={<SmartListPage />} />
                <Route path="smart-lists/:id/edit" element={<SmartListEditPage />} />
                <Route path="pick" element={<PickPage />} />
                <Route path="pick/criteria" element={<PickCriteriaPage />} />
                <Route path="pick/choose" element={<PickChoosePage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="recap" element={<RecapPage />} />
                <Route path="recap/:year" element={<RecapPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="data" element={<DataPage />} />
                {me.data.role === 'admin' && (
                    <>
                        <Route path="admin" element={<AdminPage />} />
                        <Route path="admin/database" element={<AdminDatabasePage />} />
                        <Route path="admin/errors" element={<AdminErrorsPage />} />
                        <Route path="admin/igdb" element={<AdminIgdbPage />} />
                        <Route path="admin/server" element={<AdminServerPage />} />
                        <Route path="admin/traffic" element={<AdminTrafficPage />} />
                        <Route path="admin/users" element={<AdminUsersPage />} />
                        <Route path="admin/users/new" element={<AdminUserPage />} />
                        <Route path="admin/users/:id" element={<AdminUserPage />} />
                    </>
                )}
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
