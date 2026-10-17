import { Navigate, Route, Routes } from 'react-router';
import { useMe } from './api/auth';
import { Shell } from './components/Shell';
import { AuthPage } from './routes/AuthPage';
import { CollectionPage } from './routes/CollectionPage';
import { EntryPage } from './routes/EntryPage';
import { Home } from './routes/Home';

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
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }
    return (
        <Routes>
            <Route element={<Shell user={me.data} />}>
                <Route index element={<Home />} />
                <Route path="collection" element={<CollectionPage view="all" />} />
                <Route path="backlog" element={<CollectionPage view="backlog" />} />
                <Route path="games/:id" element={<EntryPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
