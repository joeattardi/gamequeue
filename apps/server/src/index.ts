import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/sessions.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/client.js";

const config = loadConfig();
const db = openDb(config.databasePath);
const app = createApp({ db, config });

// Production: serve the built web app from the same process/port, with SPA fallback.
const webDist = resolve(process.env.WEB_DIST ?? "../web/dist");
if (existsSync(webDist)) {
  const root = webDist.replace(process.cwd() + "/", "./");
  app.use("/*", serveStatic({ root }));
  app.get("*", async (c) => c.html(await readFile(resolve(webDist, "index.html"), "utf8")));
}

purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db), 6 * 3600_000).unref();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`GameQueue listening on http://localhost:${info.port}`);
});
