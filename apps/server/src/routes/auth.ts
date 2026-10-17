import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { DEFAULT_SLOT_NAMES, loginSchema, registerSchema } from "@gamequeue/shared";
import type { AppDeps } from "../app.js";
import { clearSessionCookie, requireAuth, setSessionCookie, type AuthVars } from "../auth/middleware.js";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password.js";
import type { FailureLimiter } from "../auth/rate-limit.js";
import { createSession, destroySession, SESSION_COOKIE } from "../auth/sessions.js";
import { slots, users } from "../db/schema.js";

type Deps = Required<AppDeps>;

function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // app.request() in tests has no socket
  }
}

async function parseBody<T>(c: Context, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }) {
  const raw = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data };
  return {
    response: c.json(
      { error: "Invalid input", details: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      400,
    ),
  };
}

export function authRoutes({ db, config, limiters }: Deps) {
  const r = new Hono<{ Variables: AuthVars }>();

  r.post("/register", async (c) => {
    if (!config.signupsEnabled) return c.json({ error: "Signups are disabled" }, 403);
    const body = await parseBody(c, registerSchema);
    if (body.response) return body.response;
    const { email, password } = body.data;

    const passwordHash = await hashPassword(password);
    // The unique index is the source of truth; no check-then-insert race.
    let user: { id: number; email: string } | undefined;
    try {
      user = db.transaction((tx) => {
        const u = tx.insert(users).values({ email, passwordHash }).returning({ id: users.id, email: users.email }).get();
        tx.insert(slots).values(DEFAULT_SLOT_NAMES.map((name, position) => ({ userId: u.id, name, position }))).run();
        return u;
      });
    } catch (e) {
      if (e instanceof Error && /UNIQUE/.test(e.message)) return c.json({ error: "Could not create account with those details" }, 409);
      throw e;
    }
    const { token, expiresAt } = createSession(db, user.id);
    setSessionCookie(c, config, token, expiresAt);
    return c.json({ user }, 201);
  });

  r.post("/login", async (c) => {
    const body = await parseBody(c, loginSchema);
    if (body.response) return body.response;
    const { email, password } = body.data;

    const ip = clientIp(c, config.trustProxy);
    const keys: [FailureLimiter, string][] = [
      [limiters.loginByAccount, `${email}|${ip}`],
      [limiters.loginByIp, ip],
    ];
    const wait = Math.max(...keys.map(([l, k]) => l.retryAfter(k)));
    if (wait > 0) {
      c.header("Retry-After", String(wait));
      return c.json({ error: "Too many attempts. Try again later." }, 429);
    }

    const row = db.select().from(users).where(eq(users.email, email)).get();
    // Always run a verify so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(row?.passwordHash ?? (await dummyHash()), password);
    if (!row || !ok) {
      for (const [l, k] of keys) l.fail(k);
      return c.json({ error: "Invalid email or password" }, 401);
    }
    limiters.loginByAccount.reset(keys[0]![1]);
    const { token, expiresAt } = createSession(db, row.id);
    setSessionCookie(c, config, token, expiresAt);
    return c.json({ user: { id: row.id, email: row.email } });
  });

  r.post("/logout", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) destroySession(db, token);
    clearSessionCookie(c, config);
    return c.json({ ok: true });
  });

  r.get("/me", requireAuth(db, config), (c) => c.json({ user: c.get("user") }));

  return r;
}
