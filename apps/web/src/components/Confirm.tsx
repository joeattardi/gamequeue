import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useModalDialog } from './useModalDialog';

export interface ConfirmOptions {
    title: string;
    message?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` for deleting or anything else that is hard to undo */
    tone?: 'danger' | 'default';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

/** Asks the user to confirm, in a dialog. Resolves true on confirm, false on cancel/Esc/backdrop. */
export const useConfirm = () => useContext(ConfirmContext);

/** Renders the one shared confirmation dialog. Mount once, above everything that asks. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolver = useRef<((ok: boolean) => void) | null>(null);
    const ref = useModalDialog(options !== null);

    const finish = useCallback((ok: boolean) => {
        resolver.current?.(ok);
        resolver.current = null;
        setOptions(null);
    }, []);

    const confirm = useCallback<Confirm>(
        (next) =>
            new Promise<boolean>((resolve) => {
                resolver.current?.(false); // a new question replaces an unanswered one
                resolver.current = resolve;
                setOptions(next);
            }),
        []
    );

    const tone = options?.tone ?? 'default';
    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <dialog
                ref={ref}
                className="dialog dialog--confirm"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-message"
                // Fires on Esc, and after we close it ourselves (then the promise is already settled)
                onClose={() => finish(false)}
                onClick={(e) => e.target === ref.current && finish(false)}
            >
                {options && (
                    <div className="dialog__body confirm">
                        <div className={`confirm__icon confirm__icon--${tone}`} aria-hidden="true">
                            {tone === 'danger' ? '!' : '?'}
                        </div>
                        <div className="confirm__text">
                            <h2 id="confirm-title">{options.title}</h2>
                            {options.message && (
                                <p id="confirm-message" className="muted">
                                    {options.message}
                                </p>
                            )}
                        </div>
                        <div className="confirm__actions">
                            {/* Cancel gets focus so Enter never confirms something destructive by accident */}
                            <button
                                className="btn"
                                onClick={() => finish(false)}
                                autoFocus
                                data-autofocus
                            >
                                {options.cancelLabel ?? 'Cancel'}
                            </button>
                            <button
                                className={`btn ${tone === 'danger' ? 'btn--danger-solid' : 'btn--primary'}`}
                                onClick={() => finish(true)}
                            >
                                {options.confirmLabel ?? 'Confirm'}
                            </button>
                        </div>
                    </div>
                )}
            </dialog>
        </ConfirmContext.Provider>
    );
}
