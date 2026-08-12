# Barangay Census System

A React, TypeScript, Vite, and Supabase application for resident census
registration, identity verification, resident record updates, and administrator
review.

## Local development

1. Install Node.js 22 or later.
2. Copy `.env.example` to `.env`.
3. Enter your Supabase project URL and anon key in `.env`.
4. Install and start the project:

```bash
npm install
npm run dev
```

Open the address displayed by Vite. The application is configured with the
GitHub Pages base path `/barangay-census/`.

## Database setup

Run the supplied SQL files in the Supabase SQL Editor as required by your
existing schema:

- `supabase-verification-setup.sql`
- `face-verification-migration.sql`
- `household-photo-migration.sql`
- `census-submit-rls-fix.sql`
- `submit-census-database-fix.sql`
- `resident-remarks-rls-fix.sql`
- `new-features-migration.sql` (required for monthly rent and announcements)

Review all Row Level Security policies before using real resident information.

## Publish with GitHub Pages

Create a GitHub repository named exactly:

```text
barangay-census
```

Before the first deployment, open the repository on GitHub and add these
repository secrets under **Settings → Secrets and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then enable Pages under **Settings → Pages → Build and deployment** and select
**GitHub Actions**.

Upload or push this project to the `main` branch. The included
`.github/workflows/deploy.yml` workflow will install, build, and publish the
website automatically.

The deployed address will use this format:

```text
https://YOUR_GITHUB_USERNAME.github.io/barangay-census/
```

Add that address to the allowed Site URL and redirect URLs in your Supabase
Authentication URL configuration.

## Upload with Git

Run these commands inside the project directory:

```bash
git init
git add .
git commit -m "Publish Barangay Census"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/barangay-census.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your GitHub username.

## Verification commands

```bash
npm ci
npm run lint
npm run build
```

The `.env`, `node_modules`, and `dist` paths are intentionally excluded from
Git. Never add a Supabase service-role key or database password to frontend
files.

## Camera verification

Camera access requires HTTPS or localhost. GitHub Pages provides HTTPS.
face-api.js model weights currently load from jsDelivr, so face verification
also requires an internet connection. The live preview uses a larger 4:3 frame
and starts mirrored for natural movement; residents can use **Flip preview** if
their device reports the opposite orientation. The stored verification photo is
kept in the camera's original orientation for comparison.

## Administrator features

- Publish information, important, or urgent announcements to all residents or
  to residents with a selected review status.
- Hide, republish, expire, or delete announcements.
- View descriptive and diagnostic census indicators.
- View a bounded 30-day submission projection and residents approaching senior
  citizen eligibility.
- Review rule-based recommended actions for record processing, data quality,
  housing assessment, and outreach.

The prediction panel is a transparent trend estimate from the available census
records. It is not a guaranteed forecast and should be used with administrator
judgment.
