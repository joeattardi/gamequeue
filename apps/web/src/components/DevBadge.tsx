import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useModalDialog } from './useModalDialog';

/**
 * A "Dev" stamp by the logo, only under `npm run dev` (Vite's dev mode); the production build drops it.
 * It opens a dialog saying this is the development version. Keep it outside the logo's link.
 */
export function DevBadge() {
    const [open, setOpen] = useState(false);
    const ref = useModalDialog(open);
    if (!import.meta.env.DEV) return null;
    return (
        <>
            <button
                type="button"
                className="logo__badge"
                aria-haspopup="dialog"
                aria-label="Development version: more info"
                onClick={() => setOpen(true)}
            >
                Dev
            </button>
            <dialog
                ref={ref}
                className="dialog dialog--confirm"
                aria-labelledby="dev-title"
                onClose={() => setOpen(false)}
                onClick={(e) => e.target === ref.current && setOpen(false)}
            >
                <div className="dialog__body confirm">
                    <div className="confirm__icon" aria-hidden="true">
                        <FlaskConical />
                    </div>
                    <div className="confirm__text">
                        <h2 id="dev-title">Development version</h2>
                        <p className="muted">
                            This is the development version of GameQueue, started with npm run dev.
                            It is not the live site.
                        </p>
                    </div>
                    <div className="confirm__actions">
                        <button className="btn" onClick={() => setOpen(false)} data-autofocus>
                            Got it
                        </button>
                    </div>
                </div>
            </dialog>
        </>
    );
}
