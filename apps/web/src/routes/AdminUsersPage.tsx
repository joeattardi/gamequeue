import { ArrowLeft, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useAdminUsers } from '../api/admin';
import { useMe } from '../api/auth';
import { Avatar } from '../components/Avatar';
import { UserRowSkeletons } from '../components/PageSkeletons';
import { usePageTitle } from '../lib';

/** `/admin/users`: everyone on this instance, linking to each user's edit page. */
export function AdminUsersPage() {
    usePageTitle('Users | Admin');
    const users = useAdminUsers();
    const me = useMe();
    return (
        <section>
            <Link to="/admin" className="back-link">
                <ArrowLeft aria-hidden="true" /> Admin
            </Link>
            <div className="page-head">
                <div>
                    <h1>
                        <Users aria-hidden="true" />
                        Users
                    </h1>
                    <p className="muted">Create, edit and remove accounts.</p>
                </div>
                <Link className="btn btn--primary" to="/admin/users/new">
                    <UserPlus aria-hidden="true" /> New user
                </Link>
            </div>
            <div className="panel">
                {users.isPending ? (
                    <UserRowSkeletons />
                ) : users.isError ? (
                    <p className="form-error" role="alert">
                        Couldn't load the users.
                    </p>
                ) : (
                    <ul className="admin-users">
                        {users.data.map((u) => (
                            <li key={u.id} className="admin-user">
                                <Avatar
                                    username={u.username}
                                    size={36}
                                    avatarUpdatedAt={u.avatarUpdatedAt}
                                    avatarIcon={u.avatarIcon}
                                />
                                <div className="admin-user__main">
                                    <div>
                                        <Link to={`/admin/users/${u.id}`}>
                                            <strong>{u.username}</strong>
                                        </Link>
                                        {u.id === me.data?.id && (
                                            <span className="muted"> (you)</span>
                                        )}
                                    </div>
                                    <div className="muted admin-user__email">{u.email}</div>
                                </div>
                                <span
                                    className={`badge ${u.role === 'admin' ? '' : 'badge--quiet'}`}
                                >
                                    {u.role}
                                </span>
                                <span className="muted admin-user__games">
                                    {u.gameCount} {u.gameCount === 1 ? 'game' : 'games'}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
