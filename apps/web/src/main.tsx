import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ConfirmProvider } from './components/Confirm';
import './styles/tokens.css';
import './styles/app.css';

const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } }
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ConfirmProvider>
                    <App />
                </ConfirmProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>
);
