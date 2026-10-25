import { CheckCircle2, Lock, Mail, MailCheck, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { forgotPasswordSchema, resetPasswordSchema } from '@gamequeue/shared';
import { useAuthConfig, useForgotPassword, useResetPassword } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { AuthFrame } from '../components/AuthFrame';
import { useLinkToken } from '../linkToken';
import { usePageTitle } from '../lib';

const messageOf = (err: unknown) =>
    err instanceof ApiRequestError ? err.message : 'Something went wrong';

/** `/forgot-password`: asks for the account's email and sends a reset link. */
export function ForgotPasswordPage() {
    usePageTitle('Forgot your password?');
    const forgot = useForgotPassword();
    const config = useAuthConfig();
    const [error, setError] = useState<string>();

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(undefined);
        const parsed = forgotPasswordSchema.safeParse({
            email: String(new FormData(e.currentTarget).get('email'))
        });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message);
        forgot.mutate(parsed.data.email, { onError: (err) => setError(messageOf(err)) });
    }

    // No email provider on this server: nothing could reach the inbox
    if (config.data?.passwordReset === false)
        return (
            <AuthFrame>
                <h1>
                    <TriangleAlert aria-hidden="true" /> Not available here
                </h1>
                <p className="auth__sub">
                    Password reset by email isn't set up on this server. Ask its admin to reset your
                    password.
                </p>
                <Link className="btn btn--primary" to="/login">
                    Back to sign in
                </Link>
            </AuthFrame>
        );

    if (forgot.isSuccess)
        return (
            <AuthFrame>
                <h1>
                    <MailCheck aria-hidden="true" /> Check your inbox
                </h1>
                <p className="auth__sub" role="status">
                    If an account uses that email address, we sent a link to reset its password. It
                    works once and expires in 1 hour. Check your spam folder if it doesn't show up.
                </p>
                <Link className="btn btn--primary" to="/login">
                    Back to sign in
                </Link>
            </AuthFrame>
        );

    return (
        <AuthFrame>
            <form className="stack" onSubmit={onSubmit} noValidate>
                <h1>Forgot your password?</h1>
                <p className="muted auth__sub">
                    Enter the email address of your account and we'll send you a link to choose a
                    new password.
                </p>
                <label className="field">
                    <span>Email</span>
                    <span className="field__icon-input">
                        <Mail aria-hidden="true" />
                        <input name="email" type="email" autoComplete="email" required autoFocus />
                    </span>
                </label>
                <p className="form-error" role="alert" aria-live="assertive">
                    {error}
                </p>
                <button className="btn btn--primary" type="submit" disabled={forgot.isPending}>
                    {forgot.isPending ? 'Sending…' : 'Send reset link'}
                </button>
                <p className="auth__switch">
                    <Link to="/login">Back to sign in</Link>
                </p>
            </form>
        </AuthFrame>
    );
}

/** `/reset-password#token=…`: the page the emailed link opens; works signed in or out. */
export function ResetPasswordPage() {
    usePageTitle('Choose a new password');
    const token = useLinkToken();
    const reset = useResetPassword();
    const [error, setError] = useState<string>();

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(undefined);
        const form = new FormData(e.currentTarget);
        if (form.get('password') !== form.get('confirm'))
            return setError("The two passwords don't match");
        const parsed = resetPasswordSchema.safeParse({
            token,
            password: String(form.get('password'))
        });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message);
        reset.mutate(parsed.data, { onError: (err) => setError(messageOf(err)) });
    }

    if (
        !token ||
        (reset.isError &&
            reset.error instanceof ApiRequestError &&
            reset.error.status === 400 &&
            !reset.error.details)
    )
        return (
            <AuthFrame>
                <h1>
                    <TriangleAlert aria-hidden="true" /> Link not valid
                </h1>
                <p className="auth__sub" role="alert">
                    {token ? 'This link is invalid or has expired.' : 'This link is incomplete.'}{' '}
                    Reset links work once and expire after 1 hour.
                </p>
                <Link className="btn btn--primary" to="/forgot-password">
                    Get a new link
                </Link>
            </AuthFrame>
        );

    if (reset.isSuccess)
        return (
            <AuthFrame>
                <h1>
                    <CheckCircle2 aria-hidden="true" /> Password changed
                </h1>
                <p className="auth__sub" role="status">
                    You've been signed out everywhere. Sign in with your new password.
                </p>
                <Link className="btn btn--primary" to="/login">
                    Sign in
                </Link>
            </AuthFrame>
        );

    return (
        <AuthFrame>
            <form className="stack" onSubmit={onSubmit} noValidate>
                <h1>Choose a new password</h1>
                <label className="field">
                    <span>New password</span>
                    <span className="field__icon-input">
                        <Lock aria-hidden="true" />
                        <input
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={10}
                            autoFocus
                        />
                    </span>
                    <small className="muted">At least 10 characters.</small>
                </label>
                <label className="field">
                    <span>Confirm new password</span>
                    <span className="field__icon-input">
                        <Lock aria-hidden="true" />
                        <input
                            name="confirm"
                            type="password"
                            autoComplete="new-password"
                            required
                        />
                    </span>
                </label>
                <p className="form-error" role="alert" aria-live="assertive">
                    {error}
                </p>
                <button className="btn btn--primary" type="submit" disabled={reset.isPending}>
                    {reset.isPending ? 'Saving…' : 'Change password'}
                </button>
            </form>
        </AuthFrame>
    );
}
