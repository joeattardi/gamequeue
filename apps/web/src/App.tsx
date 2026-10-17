import { Navigate, Route, Routes } from 'react-router';
import { useMe } from './api/auth';
import { Shell } from './components/Shell';
import { AuthPage } from './routes/AuthPage';
import { CollectionPage } from './routes/CollectionPage';
import { DataPage } from './routes/DataPage';
import { EntryPage } from './routes/EntryPage';
import { Home } from './routes/Home';
import { ListPage, QueuePage } from './routes/ListPage';
import { ListsPage } from './routes/ListsPage';
import { PickPage } from './routes/PickPage';
import { ProfilePage } from './routes/ProfilePage';

export function App() {
    const me = useMe();
    if (me.isPending)
        return (
            <p className="boot" role="status">
                Loading…
            </p>
        );
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
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }
    return (
        <Routes>
            <Route path="/u/:username" element={<ProfilePage />} />
            <Route element={<Shell user={me.data} />}>
                <Route index element={<Home />} />
                <Route path="collection" element={<CollectionPage view="all" />} />
                <Route path="backlog" element={<CollectionPage view="backlog" />} />
                <Route path="games/:id" element={<EntryPage />} />
                <Route path="queue" element={<QueuePage />} />
                <Route path="lists" element={<ListsPage />} />
                <Route path="lists/:id" element={<ListPage />} />
                <Route path="pick" element={<PickPage />} />
                <Route path="data" element={<DataPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
