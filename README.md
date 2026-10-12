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

Use the ordered migration history in `supabase/migrations` for the current
schema. The deployment uses Supabase project `pqpezqeagxeuetztwlam`. The expanded
analytics/service migration is
`20261010124936_expanded_analytics_shared_services_and_fee_snapshots.sql`.
It has been applied to the connected project. The older root SQL files are
historical setup scripts; do not rerun them over the current schema.

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

Camera access requires HTTPS or localhost. Vercel provides HTTPS. Face-api.js
model weights currently load from jsDelivr, so live identity verification also
requires an internet connection. Front and unspecified webcam previews use a
selfie mirror so movement follows the user; rear-camera previews stay normal.
Both screens offer a Mirror Preview toggle. Saved captures always retain the
camera's original, unmirrored orientation so ID text remains readable. Head-turn
instructions refer to the user's own left and right. Screens open fullscreen during
initialization, and photographs require explicit confirmation.

## Current panels and services

Administrators can review census records, manage announcements, appointments,
boarding houses and payment receipts, and view 36 aggregate analytics charts
organized into ten sections. Current census totals are separate from date-filtered
activity. Charts omit names, contacts, addresses, identity images and biometric
measurements. Address groups are explicitly not verified household counts because
there is no household identifier in the schema. Resident category totals may
exceed the resident total because selections overlap; categories count distinct
resident accounts. Occupation free text is grouped into broad reporting categories.

Both panels have separate Active, Completed and Cancelled appointment routes.
The resident panel additionally retains rejected requests. Appointments and
announcements refresh while visible and when the tab regains focus. Resident
queries use account ownership; administrator queries retain the existing RLS scope.

The shared database service catalog contains the existing approved services:
Barangay Clearance costs 230 PHP for regular requests and 130 PHP for students
(education status Currently Studying). Certificate of Residency costs 30 PHP.
The existing first Low Income request exemption remains free. Low Income, Good Moral, Financial and Medical
Assistance purposes are retained. As before, a cancelled or rejected Low Income
request counts as a previous request. Existing appointment fees and service
ownership are immutable. Analytics label older saved prices as historical;
current fees do not change previous requests. Official documentary requirements and processing durations
are not currently recorded; the UI asks residents to consult the barangay office.
No additional official fees or eligibility conditions have been introduced.

Announcement uploads have an interactive 16:7 banner crop. ID and household
photo uploads retain their original proportions, with drag, zoom, reset and
confirmation controls. IDs initially show the complete image. JPEG, PNG and WebP
files are accepted; announcement uploads are limited to 5 MB, resident photos to
8 MB, and images that cannot be decoded or are undersized cannot be confirmed. EXIF orientation
is applied before cropping. Cancelling preserves the previous photo. There is
currently no separate profile-picture upload field, so no new avatar feature was
added. Live face verification stays separate from uploaded photo editing.

Announcement cards and detail views offer View Full Screen in both panels. The
viewer fits the entire saved picture, supports button/slider/pinch zoom and
drag/keyboard panning, and closes with X, outside clicks or Escape. New uploads
save an uncropped original alongside the confirmed banner. Both use the same
private storage audience rules. Old cropped uploads cannot recover content that
was never saved; re-upload their original photo to restore it. Editing/removing
photos cleans both stored images, and partial upload failures do not publish.
ID uploads additionally offer landscape-card and free crop modes with separate
width/height controls. Preview and saved JPEG use the same source rectangle and
white background. Cancel, including during encoding, preserves the previous file.

## One-time Terms and Conditions

The project owner's supplied privacy notice is stored verbatim as approved
version `2026-10-12`. Both administrators and residents must check I agree and
confirm before protected pages mount. New accounts pass this gate before ID
verification/census entry; existing accounts pass it before their dashboard.
`account_terms_acceptances` stores one account-linked receipt, its document and
server-generated acceptance date. Reading the database on login/refresh and on
another device avoids repeating an accepted popup. Published notice versions are
retained; later versions do not silently invalidate this one-time acceptance.
Clients cannot accept for another account, forge dates, update/delete receipts or
edit the approved notice. Missing approved content and failed reads/saves block
proceeding and show Retry/Log Out rather than creating an empty acceptance.
The migration `20261012122129_announcement_originals_and_account_terms.sql` has
been applied to the connected Supabase project. Its transaction-backed regression
test is `supabase/tests/terms_and_announcement_media.sql`; all test data rolls back.

## Session and navigation

Both roles default to 15 minutes of inactivity. Set
`VITE_SESSION_TIMEOUT_MINUTES` before building to configure another duration.
A visible session timer counts down throughout the signed-in session and resets
on activity. The final minute shows a warning and Stay Signed In action. Shared activity and
expiry markers coordinate tabs; suspended tabs check elapsed time on resume.
At timeout protected UI is hidden immediately, the existing census draft is
flushed with a bounded wait, Supabase signs out and login shows the inactivity
message. Draft images follow the existing draft mechanism and are not stored as
browser blobs. Authentication expiry has a separate message. Valid authentication
survives refreshes and application/browser Back navigation. Explicit logout and
Back with no earlier application page ask for confirmation. Browser Back also
shows “Are you sure you want to log out?” at the signed-in session boundary,
including direct dashboard links. Cancel, Escape and outside clicks keep the
current page and authentication. Earlier application routes survive refreshes
through browser history metadata. A single boundary entry is reused; cancelling
does not add more entries. Log Out flushes existing drafts before signing out
and opening the appropriate login page. Ordinary Back/Forward between authorized
pages does not log out or show the confirmation.

## Verification of the expanded flows

`npm test` runs the regression, behavior, presentation and enhancement suites.
`supabase/tests/system_enhancements.sql` is a transaction-backed database test:
all its temporary users, requests and price changes roll back. It verifies chart
privacy, role scope, date semantics, catalog permissions, quote validation,
idempotent booking and immutable historical fees. Existing database test suites
remain available in `supabase/tests`.

Camera tests cover cancellation while permissions, face detection or encoding
are pending, empty captures and failed uploads. Camera screens are fullscreen
from initialization, retain image aspect ratios and release tracks on close or
unmount. One shared dialog manager owns scroll locks, restoring page scrolling
after camera closure and navigation. Captures use an unmirrored canvas and
require confirmation. Physical
camera hardware, lighting, permission prompts and mobile browser behavior still
require a real-device smoke test.
