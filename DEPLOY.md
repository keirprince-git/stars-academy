# Deploying Stars Academy to Railway

## Prerequisites

- A GitHub account (free)
- A Railway account (free tier available at railway.app)

## Step 1: Push code to GitHub

Open Terminal on your Mac and run:

```bash
cd "/Users/keirprince/Library/CloudStorage/OneDrive-Personal/Documents/5. Abuja/Stars Academy/stars-app"

git init
git add -A
git commit -m "Initial commit — Stars Academy app"
```

Then create a repo on GitHub:
1. Go to https://github.com/new
2. Name it `stars-academy` (private is fine)
3. Don't add README or .gitignore (we already have them)
4. Click "Create repository"
5. Copy the two commands GitHub shows under "push an existing repository" and run them, e.g.:

```bash
git remote add origin https://github.com/YOUR_USERNAME/stars-academy.git
git branch -M main
git push -u origin main
```

## Step 2: Create a Railway project

1. Go to https://railway.app and sign up / log in (GitHub login is easiest)
2. Click **"New Project"**
3. Choose **"Deploy from GitHub Repo"**
4. Select your `stars-academy` repository
5. Railway will detect the Dockerfile and start building

## Step 3: Add a persistent volume

The SQLite database must live on a persistent volume — otherwise it resets on every deploy.

1. In your Railway project, click on the service (the box showing your app)
2. Go to the **"Volumes"** tab (or Settings → Volumes)
3. Click **"Add Volume"**
4. Set:
   - **Mount Path**: `/data`
   - **Size**: 1 GB (plenty for this app)
5. Click **"Add"**

## Step 4: Set environment variables

1. In your Railway service, go to the **"Variables"** tab
2. Add these variables:

| Variable | Value |
|----------|-------|
| `DATABASE_PATH` | `/data/stars_academy.db` |
| `NODE_ENV` | `production` |

3. Click **"Deploy"** (or it may auto-deploy)

## Step 5: Seed the database

The app auto-creates the admin and recorder users on first startup. But you need to seed the player data. Two options:

### Option A: Upload the seeded database (recommended)

1. On your Mac, the database is already seeded at:
   `stars-app/stars_academy.db`
2. In Railway, open the service → **"Volumes"** tab
3. Use Railway's file upload to put `stars_academy.db` into the `/data` volume

### Option B: Start fresh

If you start without seeding, the app will create an empty database with just the two login accounts:
- **admin** / stars2026
- **recorder** / recorder2026

You can then add players manually through the app.

## Step 6: Get your URL

1. In Railway, go to your service → **"Settings"** tab
2. Under **"Networking"** → **"Public Networking"**
3. Click **"Generate Domain"**
4. Railway will give you a URL like: `stars-academy-production-xxxx.up.railway.app`

Share this URL with your recorder — it works on any smartphone browser.

## Login credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | admin | stars2026 |
| Recorder | recorder | recorder2026 |

**Important:** Change these passwords after your first login (a password-change feature can be added later).

## Updating the app

After making changes locally:

```bash
git add -A
git commit -m "describe your change"
git push
```

Railway auto-deploys on every push. The database on the volume is preserved.

## Costs

Railway's free tier includes $5/month of usage, which is more than enough for this app. After that, the Hobby plan is $5/month with $5 of included usage.
