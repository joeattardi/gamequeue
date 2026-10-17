import { useEffect, useRef } from 'react';

/**
 * Opens and closes a native <dialog> as a modal, and puts focus on the element marked
 * `data-autofocus` inside it (falling back to the browser's default: the first focusable element).
 *
 * React's own `autoFocus` can't do this job: it focuses when the element is created, which is
 * before the dialog has been opened, so the call is ignored and the close button wins instead.
 * (Keep `autoFocus` on the element too: it covers re-mounts inside a dialog that is already open.)
 */
export function useModalDialog(open: boolean) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) {
            dialog.showModal();
            dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
        }
        if (!open && dialog.open) dialog.close();
    }, [open]);
    return ref;
}
