# GameQueue

Personal video game collection and "what do I play next" manager.

## Develop
```
npm install
cp apps/server/.env.example apps/server/.env   # optional until IGDB arrives in M1
npm run dev        # server :3000 + web :5173 (open http://localhost:5173)
npm test
npm run typecheck
```

## Production (single process)
```
npm run build && NODE_ENV=production npm start   # API + built web app on $PORT
```
Schema changes: edit `apps/server/src/db/schema.ts`, run `npm run db:generate`, commit the new file in `apps/server/drizzle/`. Migrations run at startup.
