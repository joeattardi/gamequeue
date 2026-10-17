import { createApp } from "../src/app.js";
import { FailureLimiter } from "../src/auth/rate-limit.js";
import { loadConfig, type Config } from "../src/config.js";
import { openDb } from "../src/db/client.js";

export function makeApp(overrides: Partial<Config> = {}) {
  const db = openDb(":memory:");
  const config = { ...loadConfig({}), ...overrides };
  const limiters = { loginByAccount: new FailureLimiter(5, 60_000), loginByIp: new FailureLimiter(30, 60_000) };
  const app = createApp({ db, config, limiters });
  return { app, db, config };
}

type App = ReturnType<typeof makeApp>["app"];

export const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

export async function register(app: App, email = "me@example.com", password = "correct horse battery") {
  return app.request("/api/auth/register", json({ email, password }));
}
