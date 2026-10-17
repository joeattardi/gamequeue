import { loginSchema, registerSchema } from '@gamequeue/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useLogin, useRegister } from '../api/auth';
import { ApiRequestError } from '../api/client';
import { Logo } from '../components/Logo';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
    const isLogin = mode === 'login';
    const login = useLogin();
    const register = useRegister();
    const mutation = isLogin ? login : register;
    const [error, setError] = useState<string>();

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(undefined);
        const form = new FormData(e.currentTarget);
        const input = {
            username: String(form.get('username')),
            email: String(form.get('email')),
            password: String(form.get('password'))
        };
        const onError = (err: Error) =>
            setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
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

    return (
        <main className="auth">
            <form className="auth__card" onSubmit={onSubmit} noValidate>
                <Logo />
                <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
                <label className="field">
                    <span>Username</span>
                    <input
                        name="username"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        autoFocus
                    />
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
                        <input name="email" type="email" autoComplete="email" required />
                    </label>
                )}
                <label className="field">
                    <span>Password</span>
                    <input
                        name="password"
                        type="password"
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        required
                        minLength={isLogin ? undefined : 10}
                    />
                    {!isLogin && <small className="muted">At least 10 characters.</small>}
                </label>
                <p className="form-error" role="alert" aria-live="assertive">
                    {error}
                </p>
                <button className="btn btn--primary" type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'One moment…' : isLogin ? 'Sign in' : 'Create account'}
                </button>
                <p className="auth__switch">
                    {isLogin ? (
                        <>
                            New here? <Link to="/register">Create an account</Link>
                        </>
                    ) : (
                        <>
                            Already have an account? <Link to="/login">Sign in</Link>
                        </>
                    )}
                </p>
            </form>
        </main>
    );
}
