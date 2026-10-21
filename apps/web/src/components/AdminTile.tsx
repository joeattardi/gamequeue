import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { UserStatsSkeleton } from './PageSkeletons';

/** A dashboard tile: a few number/label pairs and a link to the detail page. */
export function AdminTile({
    id,
    icon,
    title,
    state,
    stats,
    to,
    linkLabel,
    children
}: {
    id: string;
    icon: ReactNode;
    title: string;
    state: 'pending' | 'error' | 'ready';
    stats: { label: string; value: string | number; title?: string }[];
    to: string;
    linkLabel: string;
    children?: ReactNode;
}) {
    return (
        <section className="panel admin-tile" aria-labelledby={id}>
            <h2 id={id}>
                {icon} {title}
            </h2>
            {state === 'pending' ? (
                <UserStatsSkeleton />
            ) : state === 'error' ? (
                <p className="form-error" role="alert">
                    Couldn't load this.
                </p>
            ) : (
                <>
                    <dl className="admin-stats">
                        {stats.map((s) => (
                            <div key={s.label}>
                                <dd title={s.title}>{s.value}</dd>
                                <dt>{s.label}</dt>
                            </div>
                        ))}
                    </dl>
                    {children}
                </>
            )}
            <Link className="admin-tile__link" to={to}>
                {linkLabel} <ArrowRight aria-hidden="true" />
            </Link>
        </section>
    );
}
