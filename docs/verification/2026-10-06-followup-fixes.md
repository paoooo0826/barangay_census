# Follow-up fixes verified on 6 October 2026

## Changes

- Enforce duplicate identity checks for direct resident edits as well as the census RPC. Normalize case and whitespace, retain the optional middle-name behavior, and serialize competing submissions. Existing residents are not merged or rewritten.
- Prevent residents from overwriting, renaming, or deleting submitted ID and face evidence. Unused uploads can still be replaced or cleaned up. Replacing submitted ID photos requires a new live verification.
- Cancel stale face-camera permission, detection, encoding, and upload work after reset or unmount. Reject empty captures, show the captured photo, prevent simultaneous captures, and wait for upload completion before reporting success.
- Apply archive, publication date, expiry, and audience checks to announcement-image access. Newly issued resident image links expire after five minutes; previously issued links retain their original expiry.
- Preserve the ID-registration screen and its inputs when Supabase refreshes the same account's token.
- Treat failed administrator-profile and census-record queries as recoverable errors, with Retry, rather than as proof that the account lacks access or a census record. Keep the chosen resident/admin portal behavior.
- Explain when a residence start date is missing and link residents to the existing census editor. Dates are not guessed or backfilled.

## Verification

`npm test` passed 66 component/regression checks. `npm run lint`, `npm run build`, and `git diff --check` passed.

The tests render the relevant React components with controlled Supabase responses and camera inputs. They cover same-account token refresh, administrator lookup retry, resident portal selection by an administrator account, failed census lookup, cancellation during camera permission/detection/encoding, empty and null blobs, duplicate captures, upload failure, cancelled uploads, and successful upload completion. Test hooks are injected only into the test bundle.

The live Supabase migration and rolled-back SQL checks verified:

- Duplicate direct edits, including normalized whitespace and missing middle names, are rejected; distinct known middle names and ordinary contact edits remain supported.
- Submitted evidence cannot be overwritten, renamed, or deleted; draft cleanup and authorized reads remain supported.
- Replacing ID photos requires new live evidence without losing existing approval behavior.
- Archived, scheduled, expired, unpublished, and wrong-audience announcement images are unavailable to residents; administrators and eligible residents retain appropriate access.
- Existing paging, permissions, boarding-house history, six-calendar-month classification, service fees, and first-free request checks continue to pass.

Separate authenticated HTTP API checks used temporary accounts and real Storage uploads. Two simultaneous census submissions for one identity returned one success and one duplicate rejection (HTTP 409, SQLSTATE 23505). Storage API attempts to overwrite all three submitted photos were rejected; a delete request removed none, and signed reads still worked.

Temporary accounts, sessions, records, files, and identity-lock fixtures were removed after verification. The original totals remain 12 accounts, 6 residents, 12 appointments, and 4 announcements; the resident-data fingerprint is unchanged.

## Remaining manual checks

Physical phone/laptop camera behavior under real lighting and permissions still needs a device check. Automated tests verify capture lifecycle and saved-file requirements, not device-specific detection accuracy.

The six existing residents need their genuine continuous residence start dates recorded before six-month classification can be calculated. Their original census data is preserved.
