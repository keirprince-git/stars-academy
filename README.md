# Stars Football Academy

Player management and session balance dashboard for the Stars Football Academy.

## Tech Stack

- **Next.js 14** (App Router, Server Components, Server Actions)
- **better-sqlite3** (single-file database)
- **TypeScript**
- No client-side state stores — URL-driven filtering
- Declarative HTML controls (`<details>/<summary>`)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database (if stars_academy.db doesn't already exist)
python3 scripts/seed.py

# 3. Start the dev server
npm run dev
```

Open http://localhost:3100

## Default Users

| Username   | Password       | Role     |
|-----------|----------------|----------|
| admin     | stars2026      | Admin    |
| recorder  | recorder2026   | Recorder |

**Change these passwords** before deploying anywhere accessible.

## Roles

- **Admin**: Full access — can add/edit players, view all data
- **Recorder**: Read-only access to dashboard and player list

## Project Structure

```
stars-app/
  app/
    layout.tsx          # Shell with nav bar
    page.tsx            # Redirects to /dashboard
    login/page.tsx      # Login form
    dashboard/page.tsx  # Session balances, summary, filters
    players/
      page.tsx          # Player list with filtering
      new/page.tsx      # Add player (admin only)
      [id]/page.tsx     # Player detail + edit + history
  lib/
    db.ts               # Database connection, schema, queries
    auth.ts             # Cookie-based auth, password hashing
    types.ts            # TypeScript interfaces
  scripts/
    seed.py             # Imports data from StarsAcademy_v2.xlsx
  stars_academy.db      # SQLite database (created by seed)
  middleware.ts         # Route protection
```

## Database

Single file: `stars_academy.db`. Back up by copying this file.

Tables: `users`, `sessions`, `players`, `attendance_log`, `sessions_purchased`.
