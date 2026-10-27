# BRIMS adviser update

## Verified architecture and baseline

- Main and production were inspected at `f34bc489e815ff6fb8e4da1fb473e05aad509c91`.
- React 19, TypeScript, Vite, Tailwind and custom hash navigation remain in use. No dependency upgrades are planned.
- `AuthContext` reads Supabase sessions and active `admin_profiles`; `App` guards both panels, required terms acceptance, idle timeout and logout confirmation. These guards are retained.
- Appointments use `pending`, `confirmed`, `completed`, `rejected`, `cancelled`. Acceptance and cash receipt recording were separate operations. The existing payment table already has unique receipt numbers, request keys, immutable fee snapshots and void history.
- Seven existing Completed appointments have no posted receipt. They are historical records requiring reconciliation, not evidence of receipt-backed service completion. No receipt will be fabricated and their original statuses/dates will be retained.
- Resident notifications require a resident recipient. Admin events therefore need a separate event feed and per-administrator read receipts.
- Landlords could select named `boarder_stays`/occupancy history through ownership policies and manage individual stays. Count-only privacy requires database changes, not only different JSX.
- Announcements are paginated in SQL but default to creation ordering and are regrouped by recency in the interface. Publication ordering must be preserved through rendering.
- Existing analytics already use Manila dates and birth dates for age, and warn that distinct addresses are not households. Root totals, selected-status denominators and receipt-backed completion still need alignment.
- No feedback, incident-report or landlord-message tables existed at inspection.

## Implementation scope

1. Add administrator events/read receipts and preserve resident notifications.
2. Retain `confirmed` internally, display Accepted, and make receipt issuance/completion atomic. A void reopens a receipt-backed completion as Accepted; corrections preserve old receipts and require a new unique reference. Zero-fee acknowledgments are not cash collections.
3. Add written feedback, reviewed incident reports with private images, and house-scoped landlord conversations. Database operations derive account identity and use retry keys.
4. Replace housing rosters with aggregate registered-stay counts and a separate landlord-reported count ledger. Remove landlord access to individual stay identities while preserving authorized census records.
5. Correct publication sorting, dashboard terminology, deep links and aggregate decision-support insights. Preserve explicitly selected sorts.

## Deployment and verification

Applied to Supabase project `pqpezqeagxeuetztwlam`: `20261027093819_brims_notifications_receipts_cases_boarding_analytics.sql` and `20261027094449_align_residency_analytics_units.sql`. The latter corrects the residency chart unit to residents, matching its deduplicated account grain. Its statements were first exercised in rollback transactions, then the complete role/workflow fixture was rerun against the applied schema successfully. No fixture accounts, receipts, messages or reports persist.

- Receipt checks cover acceptance without completion, RPC and direct-update attempts without proof, exact fee validation, repeated requests, preserved receipt-number uniqueness, void/reissue history, explicit zero-fee acknowledgments, and a deliberately failed completion after receipt insertion. The injected failure leaves neither payment nor completion.
- Ownership checks cover resident cases/receipts/notifications, private incident Storage metadata, administrator read receipts, assigned landlord messaging, guessed house IDs, identified stay endpoint denial, and count-only summaries. Message read boundaries preserve newer unread messages.
- Analytics runs across all charts and filtered dates, and selected-cohort resident, age, residency and ID chart totals reconcile to the source denominator.
- Seven pre-existing Completed appointments lack linked receipts. Their count and original ID/completion-date fingerprint are unchanged (`f637b75a48b6dc9afb599fcaf94523fd`). They appear under Receipt Reconciliation, outside verified completion totals.
- 471 component/regression checks pass (440 existing checks, adjusted where the requested behavior changed, plus 31 new interaction checks). TypeScript/production build and ESLint pass. New suite: `scripts/verify-brims.cjs`; database suite: `scripts/verify-brims.sql` (run inside `begin;`, finishes with rollback).
- Security advisor findings match the pre-change baseline: two intentional deny-by-default RLS tables without policies, six existing anonymous-callable definer functions, fourteen existing authenticated-callable definer functions, and disabled leaked-password protection. No new advisor findings were introduced. Existing wrappers retain role checks; new APIs use guarded private functions with public invoker wrappers. See [Supabase security advisor guidance](https://supabase.com/docs/guides/database/database-linter) and [password protection settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Affected modules

`AdminDashboard`, `ResidentDashboard`, both appointment lists, `AppointmentPaymentPanel`, `AdminPayments`, `RecentServices`, announcement ordering/sections, resident notifications, analytics, database types and summary types. New modules: `AdminNotifications`, `CommunityCases`, `BoardingMessages`, and shared community/status utilities. `HousingManager` now uses aggregate RPCs and the reported count ledger; authorized census identities and internal identified stay functions remain stored.

### Operational details and remaining limits

- Current approved services/rates and immutable fee snapshots are retained. `confirmed` stays the stored status; interfaces display Accepted.
- The census's original reported tenant field is retained separately. Assigned landlords must establish the initial count ledger explicitly; it is not imported or added to registered stays.
- New notification events start when this migration is applied; historical events are not fabricated. Polling refreshes visible pages within 30 seconds (resident notifications within 60 seconds) and on focus. These are in-app notifications, not push/SMS alerts.
- Incident images use a new private 5 MB bucket and the existing free-aspect crop and fullscreen viewer. Signed links expire after one hour; reopening the report renews them. Interrupted/abandoned submissions can leave unreferenced private uploads; no automatic orphan cleanup was added.
- Both roles were tested through isolated React interactions and actual database roles in rollback transactions. No production resident submissions were created for manual presentation testing. Physical camera orientation and permission recovery still depend on the user's device/browser and were covered through the existing camera component tests, not a physical webcam session.
- No dependencies were upgraded. No MFA or unrelated auth redesign was restored. Session, consent, camera, draft, image, scrolling and history controls retain their regression coverage.

Canonical production application: https://barangay-census.vercel.app/#/. Deployment readiness, exact source commit and alias verification are recorded in the release response after Vercel confirms READY; source publication alone is not treated as deployment success.
