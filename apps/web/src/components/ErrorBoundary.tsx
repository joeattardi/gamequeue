import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Catches errors thrown while rendering its children and shows `fallback` instead. Pass a
 * `resetKey` (the current path) and the boundary clears itself when it changes, so leaving a
 * broken page by a link brings the app back.
 */
export class ErrorBoundary extends Component<
    { children: ReactNode; fallback: (error: unknown) => ReactNode; resetKey?: string },
    { failed: boolean; error: unknown }
> {
    state = { failed: false, error: null as unknown };

    static getDerivedStateFromError(error: unknown) {
        return { failed: true, error };
    }

    componentDidCatch(error: unknown, info: ErrorInfo) {
        console.error(error, info.componentStack);
    }

    componentDidUpdate(prev: { resetKey?: string }) {
        if (this.state.failed && prev.resetKey !== this.props.resetKey)
            this.setState({ failed: false, error: null });
    }

    render() {
        return this.state.failed ? this.props.fallback(this.state.error) : this.props.children;
    }
}
