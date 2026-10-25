import { CheckCircle2, MailCheck, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
    useChangeEmail,
    useLogout,
    useMe,
    useRecheckOnFocus,
    useResendVerification,
    useVerifyEmailLink
} from '../api/auth';
import { ApiRequestError } from '../api/client';
import { LogoMark } from '../components/Logo';
import { usePageTitle } from '../lib';

function AuthFrame({ children }: { children: React.ReactNode }) {
    return (
        <main className="auth">
            <div className="auth__panel">
                <div className="auth__card panel stack">
                    <Link className="auth__brand" to="/" aria-label="GameQueue home">
                        <span className="landing__mark auth__mark">
                            <LogoMark />
                        </span>
                        <span className="auth__brand-name" aria-hidden="true">
                            GameQueue
                        </span>
                    </Link>
                    {children}
                </div>
            </div>
        </main>
    );
}

const messageOf = (err: unknown) =>
    err instanceof ApiRequestError ? err.message : 'Something went wrong';

/** `/verify-email?token=…`: the page the emailed link opens; works signed in or out. */
export function VerifyEmailPage() {
    usePageTitle('Confirm your email');
    const token = useSearchParams()[0].get('token');
    const me = useMe();
    const verify = useVerifyEmailLink(token);

    const failed = !token || verify.isError;
    return (
        <AuthFrame>
            {failed ? (
                <>
                    <h1>
                        <TriangleAlert aria-hidden="true" /> Link not valid
                    </h1>
                    <p className="auth__sub" role="alert">
                        {token ? messageOf(verify.error) : 'This link is incomplete.'} Links work
                        once and expire after 24 hours.
                    </p>
                    <Link className="btn btn--primary" to={me.data ? '/' : '/login'}>
                        {me.data ? 'Get a new link' : 'Sign in to get a new link'}
                    </Link>
                </>
            ) : verify.isSuccess ? (
                <>
                    <h1>
                        <CheckCircle2 aria-hidden="true" /> Email confirmed
                    </h1>
                    <p className="auth__sub" role="status">
                        Thanks! Your account is ready.
                    </p>
                    <Link className="btn btn--primary" to={me.data ? '/' : '/login'}>
                        {me.data ? 'Continue to GameQueue' : 'Sign in'}
                    </Link>
                </>
            ) : (
                <>
                    <h1>Confirming…</h1>
                    <p className="auth__sub" role="status" aria-label="Confirming your email">
                        <span className="skeleton skeleton--subtitle" aria-hidden="true" />
                    </p>
                </>
            )}
        </AuthFrame>
    );
}

/** What a signed-in user with an unconfirmed email sees instead of the app. */
export function VerifyEmailGate({ email }: { email: string }) {
    usePageTitle('Check your inbox');
    useRecheckOnFocus();
    const resend = useResendVerification();
    const change = useChangeEmail();
    const logout = useLogout();
    const [editing, setEditing] = useState(false);
    const [address, setAddress] = useState(email);
    const [sentTo, setSentTo] = useState<string>();

    function onChange(e: FormEvent) {
        e.preventDefault();
        change.mutate(address, {
            onSuccess: ({ user }) => {
                setEditing(false);
                setSentTo(user.email);
            }
        });
    }

    return (
        <AuthFrame>
            <h1>
                <MailCheck aria-hidden="true" /> Check your inbox
            </h1>
            <p className="auth__sub">
                We sent a confirmation link to <strong>{email}</strong>. Open it to start using
                GameQueue. If you don't see it, check your spam folder.
            </p>
            <p role="status" className="muted">
                {resend.isSuccess || sentTo ? 'A new email is on its way.' : ''}
            </p>
            {resend.isError && (
                <p className="form-error" role="alert">
                    {messageOf(resend.error)}
                </p>
            )}
            <button
                className="btn btn--primary"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
            >
                {resend.isPending ? 'Sending…' : 'Resend the email'}
            </button>
            {editing ? (
                <form onSubmit={onChange} className="stack">
                    <label className="field">
                        <span>Correct email address</span>
                        <input
                            type="email"
                            autoComplete="email"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            required
                            autoFocus
                        />
                    </label>
                    {change.isError && (
                        <p className="form-error" role="alert">
                            {messageOf(change.error)}
                        </p>
                    )}
                    <div className="admin-actions">
                        <button className="btn" disabled={change.isPending}>
                            {change.isPending ? 'Sending…' : 'Update and resend'}
                        </button>
                        <button
                            type="button"
                            className="btn btn--quiet"
                            onClick={() => setEditing(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <button className="btn btn--quiet" onClick={() => setEditing(true)}>
                    Wrong address?
                </button>
            )}
            <button className="btn btn--quiet" onClick={() => logout.mutate()}>
                Sign out
            </button>
            <p className="muted">Accounts that stay unconfirmed are deleted after 7 days.</p>
        </AuthFrame>
    );
}
