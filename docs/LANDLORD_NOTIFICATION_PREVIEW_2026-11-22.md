# Landlord notification preview — 22 November 2026

## Inspection and focused change

The deployed `c9eb503` already resolves conversation owner names through `boarding_houses.owner_resident_id/owner_user_id` and resident profiles, identifies messages by authenticated sender ID, and protects chat with `private.boarding_chat_access`. Existing admin scope is all active admins, with per-admin notification receipts. No assignment table exists to select a narrower admin recipient. That scope is preserved.

`AdminNotifications.tsx` already renders an event's message and timestamp and opens `/admin/dashboard?tab=messages&house=<house ID>`. `BoardingMessages.tsx` already displays the profile name in its list/header, falls back to `Landlord/Landlady`, and queries by house/account IDs. `useMessagingUpdates.ts` already re-fetches on authorized realtime changes/reconnect and removes its subscriptions on cleanup. No component, layout, dependency, role or subscription change was necessary.

The remaining missing requirement was the short message preview. Apply `supabase/migrations/20261122111500_landlord_notification_preview.sql` before release. It replaces only two existing internal function definitions:

- `private.brims_send_message(uuid,text,uuid,boolean)`: after the message insert succeeds, its existing landlord event stores the sender profile name and first 120 message characters, with whitespace collapsed for the preview and an ellipsis for longer text. The saved message body, idempotency, moderation, admin reply path and recipient routing are unchanged.
- `private.brims_admin_feed(integer,integer,boolean)`: existing landlord events resolve the same preview from their message and the sender's current profile. Older generic events therefore gain previews without rewriting their stored rows. Event timestamps, read receipts, pagination and all other notification categories are unchanged.

No table, column, access policy, grant, recipient scope or historical message/notification row is changed by the migration. There are no supported chat attachments in the inspected message schema/interface; no upload feature is changed.

## Changed files

1. The backward-compatible migration above.
2. `scripts/verify-messaging-reliability.cjs`: expanded the existing component suite with two-landlord notification, route, fallback, reload, reconnect and cleanup tests at simulated 390px and 1280px widths.
3. `scripts/verify-landlord-notification-preview.sql`: focused rollback-only tests for actual database behavior and permissions.
4. This verification note.

## Verification

- Expanded messaging component suite: **212 checks passed**. It verifies persisted badge loading, separate landlord names/previews and timestamps, correct conversation routes even with identical house names, read acknowledgement after viewing, selective read state, remount/reconnect recovery, duplicate event delivery, missing-name fallback and subscription cleanup. Earlier sender, moderation and private access checks remain included.
- Lint, TypeScript and Vite production build passed.
- Actual PostgreSQL tests ran in one rollback-only transaction with distinct admin, second admin, landlord, second landlord, ordinary resident and unrelated identities. They passed notification creation, exact preview/name/timestamp, stored versus normalized text, Unicode truncation, idempotent retries, offline feed recovery, read persistence, independent admin receipts, rejected/failed messages producing no events, existing admin replies, unchanged incident notification content and unauthorized read/feed denial.
- Additional profile tests passed with distinct landlord names, identical landlord names on separate accounts, stale property-name snapshots and a profile rename after an older notification. Names remain associated by account/house IDs.
- Test users, messages, profile edits and notification rows are rolled back. No production fixture data is intentionally retained.

For the focused SQL test, execute one BEGIN/ROLLBACK transaction containing the migration, the first 17 fixture lines of `scripts/verify-brims.sql`, and `scripts/verify-landlord-notification-preview.sql`. The migration can be omitted when testing an already-updated database. The existing `scripts/verify-chat-profile-names.sql` can run after the focused test to verify same-name account separation.

Actual signed-in browser sessions on separate devices, physical mobile layout inspection and real WebSocket transport/reconnect were not verified. The UI tests simulate realtime callbacks; the database tests authenticate separate role identities and exercise real RLS and RPCs.
