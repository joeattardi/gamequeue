import { loginSchema, registerSchema } from '@gamequeue/shared';
import { useState, type FormEvent } from 'react';
import { Lock, Mail, User } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { useAuthConfig, useLogin, useRegister } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { AuthShowcase } from '../components/AuthShowcase';
import { LogoMark } from '../components/Logo';
import { PreviewNotice } from '../components/PreviewNotice';
import { usePageTitle } from '../lib';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
    const isLogin = mode === 'login';
    const login = useLogin();
    const register = useRegister();
    const mutation = isLogin ? login : register;
    const config = useAuthConfig();
    const [error, setError] = useState<string>();
    // Someone may have signed up with this address: the reset link is how its owner gets it back
    const [emailTaken, setEmailTaken] = useState(false);
    usePageTitle(isLogin ? 'Sign in' : 'Create account');

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(undefined);
        setEmailTaken(false);
        const form = new FormData(e.currentTarget);
        const input = {
            username: String(form.get('username')),
            email: String(form.get('email')),
            password: String(form.get('password'))
        };
        const onError = (err: Error) => {
            setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
            setEmailTaken(
                err instanceof ApiRequestError &&
                    err.status === 409 &&
                    Array.isArray(err.details) &&
                    err.details.some((d: { path?: string }) => d.path === 'email')
            );
        };
        if (isLogin) {
            const parsed = loginSchema.safeParse(input);
            if (!parsed.success) return setError(parsed.error.issues[0]?.message);
            login.mutate(parsed.data, { onError });
        } else {
            const parsed = registerSchema.safeParse(input);
            if (!parsed.success) return setError(parsed.error.issues[0]?.message);
            register.mutate(parsed.data, { onError });
        }
    }

    // Signups off: the register page has nothing to offer.
    if (!isLogin && config.data?.signupsEnabled === false) return <Navigate to="/login" replace />;

    return (
        <main className="auth">
            <AuthShowcase />
            <div className="auth__panel">
                <form className="auth__card" onSubmit={onSubmit} noValidate>
                    <Link className="auth__brand" to="/" aria-label="GameQueue home">
                        <span className="landing__mark auth__mark">
                            <LogoMark />
                        </span>
                        <span className="auth__brand-name" aria-hidden="true">
                            GameQueue
                        </span>
                    </Link>
                    <PreviewNotice compact />
                    <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
                    <p className="muted auth__sub">
                        {isLogin
                            ? 'Sign in to pick up where you left off.'
                            : 'Free, and ready in a minute. Add your first game right away.'}
                    </p>
                    <label className="field">
                        <span>Username</span>
                        <span className="field__icon-input">
                            <User aria-hidden="true" />
                            <input
                                name="username"
                                autoComplete="username"
                                autoCapitalize="none"
                                spellCheck={false}
                                required
                                autoFocus
                            />
                        </span>
                        {!isLogin && (
                            <small className="muted">
                                3-30 characters: letters, numbers, _ and -. Shown on your public
                                profile.
                            </small>
                        )}
                    </label>
                    {!isLogin && (
                        <label className="field">
                            <span>Email</span>
                            <span className="field__icon-input">
                                <Mail aria-hidden="true" />
                                <input name="email" type="email" autoComplete="email" required />
                            </span>
                        </label>
                    )}
                    <label className="field">
                        <span>Password</span>
                        <span className="field__icon-input">
                            <Lock aria-hidden="true" />
                            <input
                                name="password"
                                type="password"
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                required
                                minLength={isLogin ? undefined : 10}
                            />
                        </span>
                        {!isLogin && <small className="muted">At least 10 characters.</small>}
                        {isLogin && config.data?.passwordReset !== false && (
                            <small>
                                <Link to="/forgot-password">Forgot your password?</Link>
                            </small>
                        )}
                    </label>
                    <p className="form-error" role="alert" aria-live="assertive">
                        {error}
                        {emailTaken && config.data?.passwordReset !== false && (
                            <>
                                {' '}
                                <Link to="/forgot-password">Forgot your password?</Link>
                            </>
                        )}
                    </p>
                    <button
                        className="btn btn--primary"
                        type="submit"
                        disabled={mutation.isPending}
                    >
                        {mutation.isPending
                            ? 'One moment…'
                            : isLogin
                              ? 'Sign in'
                              : 'Create account'}
                    </button>
                    <p className="auth__switch">
                        {isLogin ? (
                            config.isPending ? (
                                <span
                                    className="skeleton skeleton--subtitle"
                                    role="status"
                                    aria-label="Loading"
                                />
                            ) : (
                                config.data?.signupsEnabled !== false && (
                                    <>
                                        New here? <Link to="/register">Create an account</Link>
                                    </>
                                )
                            )
                        ) : (
                            <>
                                Already have an account? <Link to="/login">Sign in</Link>
                            </>
                        )}
                    </p>
                </form>
                <Link className="auth__back" to="/">
                    ← Back to the home page
                </Link>
            </div>
        </main>
    );
}
