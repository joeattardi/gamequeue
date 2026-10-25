import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

// Survives the page re-mounting after the URL was cleaned (e.g. leaving the email wall)
const captured = new Map<string, string>();

/**
 * The `token` of an emailed link. New links carry it in the fragment (`#token=…`), which browsers
 * never send to the server; older ones in the query. Either way it is removed from the address bar
 * once read, so it doesn't stay in the history or on screen.
 */
export function useLinkToken(): string | null {
    const location = useLocation();
    const navigate = useNavigate();
    const [token] = useState(() => {
        const fromUrl =
            new URLSearchParams(location.hash.slice(1)).get('token') ??
            new URLSearchParams(location.search).get('token');
        if (fromUrl) captured.set(location.pathname, fromUrl);
        return fromUrl ?? captured.get(location.pathname) ?? null;
    });
    const dirty = Boolean(location.hash || location.search);
    useEffect(() => {
        if (dirty) void navigate(location.pathname, { replace: true });
    }, [dirty, location.pathname, navigate]);
    return token;
}
