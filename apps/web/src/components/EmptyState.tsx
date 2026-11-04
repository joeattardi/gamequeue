import type { ReactNode } from 'react';

/** An empty page or tab: an icon, what is missing, one line on what to do, and the actions to do it. */
export function EmptyState({
    icon,
    title,
    children,
    actions
}: {
    icon: ReactNode;
    title: string;
    children?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="empty-state">
            <span className="empty-state__icon" aria-hidden="true">
                {icon}
            </span>
            <strong>{title}</strong>
            {children && <p className="muted">{children}</p>}
            {actions && <div className="empty-state__actions">{actions}</div>}
        </div>
    );
}
