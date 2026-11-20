# Analytics, capture and moderation update — 20 November 2026

## Implementation

The existing admin Analytics route and its four analysis sections are retained. Existing authentication, account roles, message privacy, booking/payment rules and navigation are unchanged.

- `AdminAnalytics.tsx`, `AnalyticsCharts.tsx`: visible count/percentage tooltips on bars, visual action meters, and debounced aggregate invalidation with focus and 60-second polling recovery.
- `PlanningAnalytics.tsx`, `CountLineChart.tsx`: civil-status bars defaulting to verified accounts; independently labeled barangay/submission-year/cohort filters; January–December new/active boarder lines, comparison years, series controls, peak insights, selectable points and exact-value tables. Missing/future observations break lines rather than becoming zero.
- `ForecastPanel.tsx`, `lib/forecast.ts`: annual verified-submission history and a conservative, testable forecasting engine with a Forecast Details panel, generation timestamp, 1/3/5-year horizons and rolling-origin validation.
- `FaceIdentityVerification.tsx`, `lib/captureQuality.ts`: 20 FPS ideal camera input, fewer transient no-face warnings, specific positioning feedback, and final face-crop luminance/blur screening. Existing liveness actions, identity-comparison thresholds, multiple-face rejection, confirmation, upload and stream cleanup remain in force.
- `lib/profanity.ts`, `profanity-terms.json`, `generate-profanity-sql.cjs`: centralized terms, plural variants, repeated characters, substitutions, Unicode normalization, invisible-character removal and short spelling-chunk matching. Moderated forms identify the relevant field and retain the draft. Names/address census fields are not indiscriminately moderated. Incident descriptions and resident follow-ups continue preserving quoted evidence with an administrator flag.

## Data definitions and evidence

`public.admin_planning_analytics` is an authenticated, active-admin-only SECURITY INVOKER aggregate RPC. It uses the existing RLS policies; no names, contact details, ID images, street addresses or conversation text are returned.

Civil status uses the latest resident row per account (updated_at, then id), default `status=verified`. It normalizes only equivalent labels and keeps Married, Single, Widowed, Separated and Divorced distinct. Submission-year filtering is explicitly a filter on the latest submission date, not a historical population snapshot.

New boarders are distinct account identities with a recorded `boarder_stays.move_in_date` in the month. Active boarders have a stay overlapping at least one day of that month; departure is exclusive. Repeat stays count once per account/month/measure. No inquiry data exists, so inquiries or housing-search demand are not inferred. Current months are partial; future months are null. Zero means no recorded matching activity, not confirmed comprehensive coverage.

A rollback-only database run on 20 November 2026 returned two verified Single respondents, two verified submissions in 2026, and one dated stay: one new/active boarder in October and one active boarder in November. December was null. The chart uses those SQL aggregates, not seeded or hardcoded dashboard values. Counts can change as real records change.

## Forecasting method and present limitation

The database has no annual population snapshot dataset or annual census-coverage certification. Annual submissions from currently verified records are therefore explicitly labeled as a proxy. Elapsed years are unconfirmed, the current year partial, and gaps missing. Later submissions or verification changes may revise this history.

The forecast engine requires at least four consecutive confirmed full years ending last year. It fits an ordinary least-squares linear trend to up to ten comparable years, rounds predictions to whole counts, and clamps them at zero. Horizons start after the last full year. Rolling-origin tests train on at least three older years and predict each later observed year. MAE uses all held-out observations; MAPE excludes actual zero counts and is unavailable if all held-out actuals are zero.

Reproducible tests: a 100/110/120/130/140 annual series projects 150 through 190 for five following years, with held-out MAE and MAPE both zero. A 100/110/120/160 series produces MAE 30 and MAPE 18.75%. These are isolated test fixtures, never presented as live population forecasts. Missing, duplicate, unconfirmed or sparse years prevent a forecast.

Production correctly displays **Insufficient historical data for reliable forecasting**. A defensible population forecast still requires a trustworthy annual population-snapshot source and explicit comparability/coverage rules; it cannot be inferred from this registration table.

## Database changes

Apply in order:

1. `20261120124532_visual_planning_analytics.sql`: aggregate RPC; one RLS-protected singleton `analytics_refresh_state` storing only a revision number; statement-level invalidation triggers on the relevant source tables; realtime publication for that revision table. Existing table schemas and existing RLS policies are retained.
2. `20261120124600_expanded_moderation.sql`: replaces the internal matcher and existing moderation trigger function. It preserves their restricted execution grants. Its patterns are generated from the same JSON list used in the client.

No production resident records or messages are created or modified by either migration. Rollback tests insert disposable fixtures and roll back the entire transaction. Regenerate the moderation SQL with `node scripts/generate-profanity-sql.cjs` after editing the central terms; the generator preserves the handwritten trigger definition and a regression check detects stale generated patterns.

## Verification

- Existing `npm test` suites, including new `verify-planning-updates.cjs`; lint; TypeScript; production build.
- New unit/component checks: forecast math/backtests and data sufficiency, live revision invalidation, interactive chart measures, quality screening and moderation.
- Same 32 bypass/clean-lookalike examples passed in JavaScript and PostgreSQL. Existing community database rollback checks also passed, including quoted incident evidence, per-role chat privacy, moderation, feedback updates and appointment/payment workflows.
- `scripts/verify-planning.sql` passed against the actual schema in a rollback-only transaction: repeat stay deduplication, month/departure boundaries, 24 comparison-month rows, review/year/area filters, invalid years, resident access rejection and notification-free revision invalidation.
- Face component simulation confirms that a blurry capture cannot proceed even with a matching descriptor; prior gesture, camera denial, cancellation, stream cleanup and mismatch tests remain covered.

Manual checks still required: real webcams/phones under varied lighting and a full desktop/mobile visual inspection. Headless Chromium was blocked by the execution sandbox's socket restriction; the shared browser disallowed local-file previews. Automated component checks are not claimed as physical camera or visual browser verification.

Other edited files: `AdminAnnouncements.tsx`, `AdminAppointments.tsx`, `ResidentAppointments.tsx`, `CommunityCases.tsx`, `ResidentUpdateFeedback.tsx` and `AdminReview.tsx` pass field names into the existing validation helper. `types/database.ts` adds the typed RPC contract. The package test command includes the new planning suite; existing analytics, community and camera test files were extended to cover the changed behavior. No runtime dependency was added.

Post-migration verification returned civil total **2** versus independent latest-verified SQL count **2**, and dated-stay total **1** versus independent SQL count **1**. The revision publication is enabled. Supabase security-advisor finding names/counts are unchanged from the pre-change baseline; no new advisor finding was introduced by these migrations.
