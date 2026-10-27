import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { PreviewDetail } from './PreviewNotice';
import { useModalDialog } from './useModalDialog';

/** `npm run dev` (Vite's dev mode) shows "Dev" instead of "Preview". */
const DEV = import.meta.env.DEV;

/** The "Preview" pill by the logo; opens a dialog saying what that means. Keep it outside the logo's link. */
export function PreviewBadge() {
    const [open, setOpen] = useState(false);
    const ref = useModalDialog(open);
    return (
        <>
            <button
                type="button"
                className={`logo__badge${DEV ? ' logo__badge--dev' : ''}`}
                aria-haspopup="dialog"
                aria-label={
                    DEV ? 'Development version: more info' : 'Preview: what does that mean?'
                }
                onClick={() => setOpen(true)}
            >
                {DEV ? 'Dev' : 'Preview'}
            </button>
            <dialog
                ref={ref}
                className="dialog dialog--confirm"
                aria-labelledby="preview-title"
                onClose={() => setOpen(false)}
                onClick={(e) => e.target === ref.current && setOpen(false)}
            >
                <div className="dialog__body confirm">
                    <div className="confirm__icon" aria-hidden="true">
                        <FlaskConical />
                    </div>
                    <div className="confirm__text">
                        <h2 id="preview-title">
                            {DEV ? 'Development version' : 'GameQueue is in preview'}
                        </h2>
                        <p className="muted">
                            {DEV ? (
                                'This is the development version of GameQueue, started with npm run dev. It is not the live site.'
                            ) : (
                                <PreviewDetail />
                            )}
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
