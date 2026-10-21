import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
    SOCIAL_LABELS,
    SOCIAL_SERVICES,
    type SocialService,
    USER_ROLES,
    type AdminUpdateUserInput,
    type AdminUserDto
} from '@gamequeue/shared';
import { ArrowLeft, KeyRound, Trash2, UserPlus, UserRound } from 'lucide-react';
import {
    useAdminUser,
    useCreateAdminUser,
    useDeleteAdminUser,
    useResetUserPassword,
    useUpdateAdminUser
} from '../api/admin';
import { useMe } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { Avatar } from '../components/Avatar';
import { useConfirm } from '../components/Confirm';
import { UserFormSkeleton } from '../components/PageSkeletons';
import { usePageTitle } from '../lib';

type DetailsState = Omit<AdminUpdateUserInput, 'firstName' | 'lastName' | 'role' | SocialService> &
    Record<SocialService | 'firstName' | 'lastName' | 'role', string>;

type Problems = Record<string, string>;

/** Per-field messages from a 400/409 `details` list, or one general message. */
function problemsOf(err: unknown): { fields: Problems; general?: string } {
    if (err instanceof ApiRequestError && Array.isArray(err.details)) {
        return {
            fields: Object.fromEntries(
                (err.details as { path: string; message: string }[]).map((d) => [d.path, d.message])
            )
        };
    }
    return {
        fields: {},
        general: err instanceof ApiRequestError ? err.message : 'Could not save.'
    };
}

function TextField({
    label,
    value,
    onChange,
    problem,
    hint,
    ...rest
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    problem?: string;
    hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
    return (
        <label className="field">
            {label}
            <input
                {...rest}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={problem ? true : undefined}
            />
            {(problem || hint) && (
                <small className={problem ? 'field__error' : undefined}>{problem ?? hint}</small>
            )}
        </label>
    );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <label className="field">
            Role
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                        {r === 'admin' ? 'Admin (can manage users)' : 'Gamer (standard user)'}
                    </option>
                ))}
            </select>
        </label>
    );
}

function CreateForm() {
    const create = useCreateAdminUser();
    const navigate = useNavigate();
    const [v, setV] = useState({ username: '', email: '', password: '', role: 'gamer' });
    const [problems, setProblems] = useState<Problems>({});
    const [error, setError] = useState<string>();
    const set = (k: keyof typeof v) => (value: string) => setV((o) => ({ ...o, [k]: value }));

    function submit(e: FormEvent) {
        e.preventDefault();
        setProblems({});
        setError(undefined);
        create.mutate(v as Parameters<typeof create.mutate>[0], {
            onSuccess: ({ user }) => navigate(`/admin/users/${user.id}`, { replace: true }),
            onError: (err) => {
                const p = problemsOf(err);
                setProblems(p.fields);
                setError(p.general);
            }
        });
    }

    return (
        <form onSubmit={submit} className="panel name-form">
            <h2>
                <UserPlus aria-hidden="true" /> New user
            </h2>
            <p className="muted">
                Works even when public signups are off. Tell them the password yourself; they can
                change it on their Account page.
            </p>
            <div className="name-form__fields">
                <TextField
                    label="Username"
                    value={v.username}
                    onChange={set('username')}
                    problem={problems.username}
                    hint="3-30 letters, numbers, underscores or hyphens"
                    autoComplete="off"
                    required
                    data-autofocus
                />
                <TextField
                    label="Email"
                    type="email"
                    value={v.email}
                    onChange={set('email')}
                    problem={problems.email}
                    autoComplete="off"
                    required
                />
                <TextField
                    label="Password"
                    type="password"
                    value={v.password}
                    onChange={set('password')}
                    problem={problems.password}
                    hint="At least 10 characters"
                    autoComplete="new-password"
                    required
                />
                <RoleSelect value={v.role} onChange={set('role')} />
            </div>
            <div className="admin-actions">
                <button className="btn btn--primary" disabled={create.isPending}>
                    {create.isPending ? 'Creating…' : 'Create user'}
                </button>
                <Link className="btn btn--ghost" to="/admin/users">
                    Cancel
                </Link>
            </div>
            {error && <p role="alert">{error}</p>}
        </form>
    );
}

function DetailsForm({ user }: { user: AdminUserDto }) {
    const update = useUpdateAdminUser(user.id);
    const toState = (u: AdminUserDto): DetailsState => ({
        username: u.username,
        email: u.email,
        role: u.role as string,
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        showRealName: u.showRealName,
        steam: u.socialLinks.steam ?? '',
        xbox: u.socialLinks.xbox ?? '',
        playstation: u.socialLinks.playstation ?? '',
        discord: u.socialLinks.discord ?? ''
    });
    const [v, setV] = useState(() => toState(user));
    const [problems, setProblems] = useState<Problems>({});
    const [error, setError] = useState<string>();
    const [saved, setSaved] = useState(false);
    const set = (k: string) => (value: string) => {
        setSaved(false);
        setV((o) => ({ ...o, [k]: value }));
    };

    function submit(e: FormEvent) {
        e.preventDefault();
        setProblems({});
        setError(undefined);
        setSaved(false);
        update.mutate(v as unknown as AdminUpdateUserInput, {
            onSuccess: ({ user: u }) => {
                setV(toState(u)); // show the stored (trimmed, lowercased) values
                setSaved(true);
            },
            onError: (err) => {
                const p = problemsOf(err);
                setProblems(p.fields);
                setError(p.general);
            }
        });
    }

    return (
        <form onSubmit={submit} className="panel name-form">
            <h2>
                <UserRound aria-hidden="true" /> Details
            </h2>
            <div className="name-form__fields">
                <TextField
                    label="Username"
                    value={v.username}
                    onChange={set('username')}
                    problem={problems.username}
                    hint="Changing it changes their profile address"
                    autoComplete="off"
                    required
                />
                <TextField
                    label="Email"
                    type="email"
                    value={v.email}
                    onChange={set('email')}
                    problem={problems.email}
                    autoComplete="off"
                    required
                />
                <RoleSelect value={v.role} onChange={set('role')} />
                <TextField
                    label="First name"
                    value={v.firstName}
                    onChange={set('firstName')}
                    problem={problems.firstName}
                    maxLength={50}
                />
                <TextField
                    label="Last name"
                    value={v.lastName}
                    onChange={set('lastName')}
                    problem={problems.lastName}
                    maxLength={50}
                />
            </div>
            <label className="check">
                <input
                    type="checkbox"
                    checked={v.showRealName}
                    onChange={(e) => {
                        setSaved(false);
                        setV((o) => ({ ...o, showRealName: e.target.checked }));
                    }}
                />
                Show their name on their public profile
            </label>
            <h3 className="admin-subhead">Gaming accounts</h3>
            <div className="name-form__fields">
                {SOCIAL_SERVICES.map((s) => (
                    <TextField
                        key={s}
                        label={SOCIAL_LABELS[s].field}
                        value={v[s]}
                        onChange={set(s)}
                        problem={problems[s]}
                    />
                ))}
            </div>
            <div className="admin-actions">
                <button className="btn btn--primary" disabled={update.isPending}>
                    {update.isPending ? 'Saving…' : 'Save changes'}
                </button>
            </div>
            <p role="status" className="muted">
                {saved ? 'Saved.' : ''}
            </p>
            {error && <p role="alert">{error}</p>}
        </form>
    );
}

function PasswordPanel({ user, isSelf }: { user: AdminUserDto; isSelf: boolean }) {
    const reset = useResetUserPassword(user.id);
    const confirm = useConfirm();
    const [password, setPassword] = useState('');
    const [problem, setProblem] = useState<string>();
    const [error, setError] = useState<string>();
    const [done, setDone] = useState(false);

    async function submit(e: FormEvent) {
        e.preventDefault();
        setProblem(undefined);
        setError(undefined);
        setDone(false);
        if (
            !(await confirm({
                title: `Reset ${user.username}'s password?`,
                message: isSelf
                    ? 'Your other sessions will be signed out. This one stays signed in.'
                    : 'They will be signed out everywhere and must use the new password.',
                confirmLabel: 'Reset password'
            }))
        )
            return;
        reset.mutate(
            { password },
            {
                onSuccess: () => {
                    setPassword('');
                    setDone(true);
                },
                onError: (err) => {
                    const p = problemsOf(err);
                    setProblem(p.fields.password);
                    setError(p.general);
                }
            }
        );
    }

    return (
        <form onSubmit={submit} className="panel name-form">
            <h2>
                <KeyRound aria-hidden="true" /> Reset password
            </h2>
            <p className="muted">
                Sets a new password and signs them out everywhere. You can't see their current
                password; give them the new one yourself.
            </p>
            <div className="name-form__fields name-form__fields--stack">
                <TextField
                    label="New password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    problem={problem}
                    hint="At least 10 characters"
                    autoComplete="new-password"
                    required
                />
            </div>
            <div className="admin-actions">
                <button className="btn" disabled={reset.isPending || password === ''}>
                    {reset.isPending ? 'Resetting…' : 'Reset password'}
                </button>
            </div>
            <p role="status" className="muted">
                {done ? 'Password reset.' : ''}
            </p>
            {error && <p role="alert">{error}</p>}
        </form>
    );
}

function DeletePanel({ user }: { user: AdminUserDto }) {
    const del = useDeleteAdminUser();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [error, setError] = useState<string>();

    async function remove() {
        setError(undefined);
        if (
            !(await confirm({
                title: `Delete ${user.username}?`,
                message: `This permanently deletes ${user.username} and everything in the account: ${user.gameCount} collection ${user.gameCount === 1 ? 'game' : 'games'}, playthroughs, lists, queue, wishlist, smart lists and profile. It can't be undone.`,
                confirmLabel: 'Delete user',
                tone: 'danger'
            }))
        )
            return;
        del.mutate(user.id, {
            onSuccess: () => navigate('/admin/users', { replace: true }),
            onError: (err) => setError(problemsOf(err).general)
        });
    }

    return (
        <section className="panel panel--danger" aria-labelledby="del-h">
            <h2 id="del-h">
                <Trash2 aria-hidden="true" /> Delete user
            </h2>
            <p>Permanently deletes the account and all of its data. This can't be undone.</p>
            <div className="admin-actions">
                <button className="btn btn--danger" onClick={remove} disabled={del.isPending}>
                    {del.isPending ? 'Deleting…' : 'Delete user'}
                </button>
            </div>
            {error && <p role="alert">{error}</p>}
        </section>
    );
}

function EditUser({ id }: { id: number }) {
    const me = useMe();
    const query = useAdminUser(id);
    usePageTitle(query.data ? `${query.data.username} | Admin` : 'Edit user');
    if (query.isPending) return <UserFormSkeleton />;
    if (query.isError)
        return (
            <p className="form-error" role="alert">
                {query.error instanceof ApiRequestError && query.error.status === 404
                    ? 'That user does not exist.'
                    : "Couldn't load this user."}
            </p>
        );
    const user = query.data;
    const isSelf = me.data?.id === user.id;
    return (
        <div className="stack">
            <div className="admin-user-head">
                <Avatar username={user.username} size={48} avatarUpdatedAt={user.avatarUpdatedAt} />
                <div>
                    <h1>{user.username}</h1>
                    <p className="muted">
                        {user.gameCount} {user.gameCount === 1 ? 'game' : 'games'} · joined{' '}
                        {new Date(user.createdAt).toLocaleDateString()}
                        {isSelf && ' · this is you'}
                    </p>
                </div>
            </div>
            <DetailsForm key={user.id} user={user} />
            <PasswordPanel user={user} isSelf={isSelf} />
            {isSelf ? (
                <p className="muted">
                    You can't delete your own account here; use the{' '}
                    <Link to="/account">Account page</Link>.
                </p>
            ) : (
                <DeletePanel user={user} />
            )}
        </div>
    );
}

/** `/admin/users/new` and `/admin/users/:id` (admins only; routed from `App`). */
export function AdminUserPage() {
    const { id } = useParams();
    const isNew = id === undefined;
    usePageTitle(isNew ? 'New user | Admin' : undefined);
    const numeric = Number(id);
    if (!isNew && !Number.isInteger(numeric)) return <Navigate to="/admin/users" replace />;
    return (
        <section>
            <Link to="/admin/users" className="back-link">
                <ArrowLeft aria-hidden="true" /> Users
            </Link>
            {isNew ? <CreateForm /> : <EditUser id={numeric} />}
        </section>
    );
}
