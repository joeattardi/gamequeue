import { ShieldCheck } from 'lucide-react';
import { usePageTitle } from '../lib';

/** Admin area; only routed (and linked) for users with the admin role. */
export function AdminPage() {
    usePageTitle('Admin');
    return (
        <section>
            <div className="page-head">
                <div>
                    <h1>
                        <ShieldCheck aria-hidden="true" />
                        Admin
                    </h1>
                    <p className="muted">Tools for running this GameQueue instance.</p>
                </div>
            </div>
            <p className="muted">Nothing here yet.</p>
        </section>
    );
}
