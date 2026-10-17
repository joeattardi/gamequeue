import { loginSchema, registerSchema } from "@gamequeue/shared";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useLogin, useRegister } from "../api/auth";
import { ApiRequestError } from "../api/client";
import { Logo } from "../components/Logo";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const login = useLogin();
  const register = useRegister();
  const mutation = isLogin ? login : register;
  const [error, setError] = useState<string>();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const input = { email: String(form.get("email")), password: String(form.get("password")) };
    const parsed = (isLogin ? loginSchema : registerSchema).safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your details");
    mutation.mutate(parsed.data, {
      onError: (err) => setError(err instanceof ApiRequestError ? err.message : "Something went wrong"),
    });
  }

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={onSubmit} noValidate>
        <Logo />
        <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            minLength={isLogin ? undefined : 10}
          />
          {!isLogin && <small className="muted">At least 10 characters.</small>}
        </label>
        <p className="form-error" role="alert" aria-live="assertive">{error}</p>
        <button className="btn btn--primary" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "One moment…" : isLogin ? "Sign in" : "Create account"}
        </button>
        <p className="auth__switch">
          {isLogin ? (
            <>New here? <Link to="/register">Create an account</Link></>
          ) : (
            <>Already have an account? <Link to="/login">Sign in</Link></>
          )}
        </p>
      </form>
    </main>
  );
}
