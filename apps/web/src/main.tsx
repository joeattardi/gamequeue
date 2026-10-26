import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, ScrollRestoration } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ApiRequestError } from './api/client';
import { App } from './App';
import { ConfirmProvider } from './components/Confirm';
import { RouteErrorPage } from './components/ErrorPage';
import { withPageTransitions } from './pageTransitions';
import './styles/tokens.css';
import './styles/app.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            // Retrying a rate-limited request only makes the wait longer
            retry: (count, err) =>
                !(err instanceof ApiRequestError && err.status === 429) && count < 3
        }
    }
});

// A data router only for its view transitions and scroll restoration: one splat route, with the
// real routes declared by `App` as descendant <Routes>
const router = withPageTransitions(
    createBrowserRouter([
        {
            path: '*',
            errorElement: <RouteErrorPage />,
            element: (
                <ConfirmProvider>
                    <App />
                    <ScrollRestoration />
                </ConfirmProvider>
            )
        }
    ])
);

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    </StrictMode>
);
