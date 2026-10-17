import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { resolveSession, SESSION_COOKIE, SESSION_TTL_MS } from "./sessions.js";

export type AuthVars = { user: { id: number; email: string } };

export function cookieOptions(config: Config, expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: config.secureCookies,
    path: "/",
    expires: new Date(expiresAt),
    maxAge: Math.min(SESSION_TTL_MS, Math.max(0, expiresAt - Date.now())) / 1000 | 0,
  };
}

export const setSessionCookie = (c: Context, config: Config, token: string, expiresAt: number) =>
  setCookie(c, SESSION_COOKIE, token, cookieOptions(config, expiresAt));

export const clearSessionCookie = (c: Context, config: Config) =>
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: config.secureCookies });

export function requireAuth(db: Db, config: Config): MiddlewareHandler<{ Variables: AuthVars }> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = token ? resolveSession(db, token) : undefined;
    if (!token || !session) {
      if (token) clearSessionCookie(c, config);
      return c.json({ error: "Not authenticated" }, 401);
    }
    if (session.renewed) setSessionCookie(c, config, token, session.expiresAt);
    c.set("user", session.user);
    await next();
  };
}
