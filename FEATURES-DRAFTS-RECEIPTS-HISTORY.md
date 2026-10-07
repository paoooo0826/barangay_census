# Census drafts, receipts and record history

## Resident census drafts

The census form saves editable text and classification fields to Supabase after
input pauses. **Save draft** saves immediately. **Draft saved** and the timestamp
confirm the server accepted the save. An account can recover its draft on another
device. Drafts are private to that account, including accounts with an admin role.

The account email, review status, identity-verification evidence and uploaded
files cannot be supplied by a draft. Photos not uploaded must be reattached.
A draft based on an older census version does not overwrite the current record.
Successful census submission clears the account’s drafts in the same transaction.

## Payment and receipt tracking

Open an appointment’s **View** details to see **Payment & receipt**. Administrators
record cash already collected at the barangay office and the actual official
receipt number. The amount must equal the appointment’s stored fee. Free requests
cannot have a collection entered. Recording payment does not complete or change
an appointment.

Residents see their own receipt, amount, collection date and cashier. Administrators
can correct a collection by voiding its record with a reason. This retains the
original entry and receipt number; a replacement collection needs a new receipt
number. Voiding a record does not perform a cash refund.

Use **Payments & Receipts** or **View Today’s Collections** for the daily report.
Dates use Asia/Manila time. Totals exclude voided entries. Searching and status
filters paginate receipt records; the daily totals continue to summarize the
whole chosen day. Older appointments do not become paid merely because their
appointment status is completed.

## Record history

Administrator resident details contain **Record History**. Existing saved review
decisions remain visible. Future census edits record changed fields with before
and after values, actor and timestamp. Removed PhilSys-number and vocational
fields remain hidden. No past changes are manufactured where the database has
no audit entry. History is append-only for application users.

## Verification loading

Face verification and face-api.js are a separate production chunk. Initial pages
do not load it. It loads when the ID verification step opens or the resident
starts live verification. Loading failure offers a retry; the original camera
capture and upload flow remains responsible for successful verification.

## Database migrations and tests

For another deployment using the same existing schema, apply these in order:

1. `supabase/migrations/20261007174919_drafts_payments_record_history.sql`
2. `supabase/migrations/20261007180452_census_draft_version_guard.sql`

Run `npm run lint`, `npm test`, and `npm run build` for client verification.
`scripts/verify-drafts-payments.sql` is an optional database-maintenance test. It
requires an existing verified non-admin resident and an active administrator.
Every fixture and census edit occurs inside a transaction that rolls back.
