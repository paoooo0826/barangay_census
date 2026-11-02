# Grouped admin tools and private resident workflows

The existing admin pages are organized under five main navigation items. Old
hash routes, notification links, and appointment status pages remain supported.

| Main section | Tools |
| --- | --- |
| Dashboard | Overview and quick actions |
| Residents | Resident Records, Analytics |
| Services & Appointments | Services, Appointments, Payments & Receipts, Receipt Reconciliation |
| Boarding Houses | House Management, Landlord Messages |
| Community | Announcements, Incident Reports, Written Feedback |

Appointments have one page selector for Recent, Accepted, Completed, Cancelled,
Rejected, and History. Switching sections/pages scrolls to the top.

## Private admin–landlord conversations

Only active administrators and the currently assigned landlord/landlady may
read conversations. Landlord access checks the assigned owner record and the
account's latest census boarding status. Ordinary residents, boarders, other
landlords, and former landlords cannot read/send/mark these conversations.

The UI also gates message panels and redirects ordinary resident message links.
Message notifications are filtered in both table RLS and the resident feed RPC,
including unread totals. Administrators retain read-only history when the owner
no longer has landlord access; they cannot send to the former landlord.

## Incident location, progress, and follow-ups

- The required written location now supports an optional nearby landmark,
  latitude/longitude pin, and device accuracy. Coordinates are checked in the
  client and database, saved to six decimal places, and included in retry checks.
- Current location is requested only after clicking **Use My Current Location**.
  Permission denial, unavailable location, and timeout leave manual entry usable.
  Late GPS results cannot replace manually edited coordinates.
- A map link opens OpenStreetMap only when the user chooses it. The app does not
  send incident coordinates to a map provider automatically or use geocoding keys.
- Reports show recorded progress stages and a newest-first activity history.
  Stages are not completion percentages or deadlines. Administrators must supply
  a short progress/action note when changing an incident status or response.
- Both parties can append private follow-ups. The resident may ask about a closed
  report, but only an administrator can reopen it through the existing workflow.
  Follow-ups never silently change its status or replace the original evidence.
- Follow-ups are idempotent and notify the other party. A concurrent follow-up
  invalidates a stale admin review; Reload Latest keeps the response draft.
- Admin search includes the report text, location, landmark, and tracking number.
  Report lists show the latest activity and location. Resident management filters
  remain absent, and each resident reads only their own reports and attachments.

## Feedback on each saved census update

Initial submissions, census edits, and attachment/classification changes expose
an admin feedback editor on their specific history entry. A resident sees these
notes in Record History on their own record page and receives a notification.
The general Community feedback form remains separate.

Feedback links to the actual audit entry and resident account. It is editable by
active administrators, with database version checks, retry protection, author and
time records, and an audit trail. Residents cannot write admin feedback or read
another account's notes/history. Resident history uses a guarded projection that
omits removed identity fields and uses generic staff attribution.

Background refreshes preserve an administrator's unsaved feedback draft. If a
second administrator changes the saved note, the draft retains its original
version and cannot silently overwrite it. Explicit Reload replaces it with the
saved version. Historical updates without feedback show an honest empty state;
no staff feedback or review decision is fabricated.

## English and Tagalog language checker

A shared, versioned list of common profane English/Tagalog words is checked on the
client and in database writes. Whole words, repeated letters, common substitutions,
letter-spaced spellings, punctuation, accents, and common Tagalog phrases are
handled. Ordinary phrases such as “put a streetlight,” class, assistance, and
Putatan are covered by false-positive checks.

Offensive messages, general feedback/responses, update feedback, appointment
notes/reasons, census review remarks, and announcement text are rejected with a
clear edit message. Form text is retained; saved text is never silently censored.
Incident descriptions and resident follow-ups retain quoted evidence and receive
an administrator language-review flag. Personal names and location fields are
not subject to a blanket word ban. Existing stored wording is not rewritten.

This is a deterministic word/phrase checker, not a complete language or context
model. It cannot recognize every slang term, obfuscation, or legitimate context;
flagged incident evidence still requires human review.

## Verification and setup

- All 711 automated checks, ESLint, and the TypeScript/Vite production build
  passed with the updated navigation and both panels' component flows.
- Rollback-only database tests exercise actual authenticated roles, direct table
  reads, private notifications, former-owner access, coordinate retries, follow-up
  idempotency, stale reviews, feedback versions, and moderation across write APIs.
  The existing receipt/payment, count privacy, and analytics checks also pass.
- Fixtures are synthetic, and the database tests roll them back. No resident
  messages, reports, feedback, or receipts are created for production UI testing.
- The installed migration is `20261102142209_grouped_admin_private_messages_incident_followups_update_feedback.sql`. Installed-schema role tests passed; the security advisor findings are unchanged from the existing baseline.
- No new external service, package, API key, or fee configuration is required.
  Device GPS needs HTTPS/browser permission; manual incident locations remain
  available. Actual-device location and authenticated mobile visual checks remain
  outstanding; component permission/error tests do not substitute for those.
