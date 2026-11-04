import { X } from 'lucide-react';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode
} from 'react';

interface ToastInput {
    message: string;
    /** One optional button, e.g. Undo */
    action?: { label: string; onClick: () => void };
}

type Show = (toast: ToastInput) => void;

const ToastContext = createContext<Show>(() => {});

/** Shows a short message with an optional action (Undo). One at a time; a new one replaces the old. */
export const useToast = () => useContext(ToastContext);

const VISIBLE_MS = 7000;

/** Renders the toast above the phone tab bar, as a polite live region; it pauses while hovered or focused. */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
    const [paused, setPaused] = useState(false);
    const next = useRef(0);
    const show = useCallback<Show>((t) => setToast({ ...t, id: ++next.current }), []);
    useEffect(() => {
        if (!toast || paused) return;
        const timer = setTimeout(() => setToast(null), VISIBLE_MS);
        return () => clearTimeout(timer);
    }, [toast, paused]);
    const value = useMemo(() => show, [show]);
    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-region" role="status" aria-live="polite">
                {toast && (
                    <div
                        key={toast.id}
                        className="toast"
                        onMouseEnter={() => setPaused(true)}
                        onMouseLeave={() => setPaused(false)}
                        onFocus={() => setPaused(true)}
                        onBlur={() => setPaused(false)}
                    >
                        <span className="toast__text">{toast.message}</span>
                        {toast.action && (
                            <button
                                type="button"
                                className="toast__action"
                                onClick={() => {
                                    toast.action!.onClick();
                                    setToast(null);
                                }}
                            >
                                {toast.action.label}
                            </button>
                        )}
                        <button
                            type="button"
                            className="toast__close"
                            aria-label="Dismiss"
                            onClick={() => setToast(null)}
                        >
                            <X aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
        </ToastContext.Provider>
    );
}
