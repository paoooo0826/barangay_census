# Messaging fixes — 22 November 2026

## Scope

Existing boarding-house conversations, message rows, notification tables and read receipts are reused. Ordinary residents still cannot access private landlord–admin chat. No message bodies, resident records, credentials or account roles are migrated or deleted.

- The message feed resolves the authenticated sender's admin profile name for `admin` messages, falling back to `Admin`. Landlord messages use that sender's resident profile name. Incoming admin messages no longer inherit the current viewer's or property's owner name. Conversation previews and notification feeds use the same protected resolver.
- Sending includes the panel context. The backend authorizes landlord context against the current assigned owner and admin context against active admin membership. This fixes dual-role accounts being silently classified as admin while sending from the landlord panel. The existing three-argument RPC remains available for already-open clients; it infers landlord context for the assigned owner.
- The central English/Filipino list includes `idiot`/`idiots`. Terms normalize case and repeated letters before pattern generation, with bounded whole-word matches and the existing spacing, punctuation and phrase handling. Browser and generated PostgreSQL patterns agree. Validation works on a separate copy; accepted message spelling is retained. Existing trimming is preserved. Server rejection and client rejection retain the draft. Incident evidence keeps its existing flagging policy.
- Successful messages generate one event through existing unique event keys and idempotent request keys. Landlord messages reach the existing authorized active-admin audience; admin replies reach the property's assigned landlord. Sender accounts are excluded, including dual-role accounts. Notification sender names resolve dynamically from the actual message author.
- RLS-filtered Postgres Changes refresh chat history, previews and bells, including reconnect catch-up. Debounced refetches use database totals rather than local increments. Subscriptions are removed on unmount/account change. Existing polling/focus recovery remains.
- Opening and viewing the newest messages synchronizes conversation and matching notification receipts through the fetched timestamp only. Scrolled-up, older-page and hidden-tab arrivals stay unread. Read boundaries remain persisted per user, and repeated acknowledgements do not create duplicate receipts or update loops.

## Database deployment

Apply in order before the frontend:

1. `20261122010100_messaging_moderation.sql`: generated replacement of the existing internal profanity matcher. The existing moderation trigger still protects inserts/updates.
2. `20261122010200_messaging_identity_delivery.sql`: participant-checked sender-name helper; SELECT-only `boarding_message_feed` view with `security_invoker=true`; additive four-argument send RPC; scoped notification visibility; synchronized read receipts and feed queries. Adds the existing `boarding_messages`, `boarding_conversation_reads`, `notifications` and `admin_notification_reads` tables to the existing realtime publication. Their SELECT RLS restrictions remain in force. The public RPC is SECURITY INVOKER and is unavailable to anonymous callers. No new table or runtime dependency is required.

Moderation source remains `src/lib/profanity-terms.json`; `node scripts/generate-profanity-sql.cjs` now regenerates the new moderation migration, preserving the already-applied November 20 migration.

## Verification

- `npm test`: all existing suites passed. `verify-messaging-reliability.cjs` is included in the package test command; its expanded run passed 178 checks. It exercises admin/landlord panels at simulated 390px and 1280px widths, author names, previews, realtime refetch/deduplication, navigation cleanup, reload persistence, blocked drafts, server rejection, valid text, role context, chronological messages, hidden tabs and scroll-aware reads. Every configured word is tested with four repeated uppercase letters, alongside bypass and clean-lookalike fixtures.
- Lint, TypeScript and Vite production build passed.
- Actual PostgreSQL rollback transactions passed with separate admin, second admin, landlord, other landlord, ordinary resident and boarder identities. Tests cover the dual-role account, exact admin names, missing-name fallback, recipient mapping, self-notification exclusion, duplicate retries, bounded read receipts, per-admin receipt isolation, persisted unread state, direct table/RPC denials, unauthorized sender-name lookup, blocked messages producing no rows/events, and JavaScript/PostgreSQL moderation fixture parity. All test users and records are rolled back.
- Existing full BRIMS and community SQL regression suites also passed under the staged migrations, including appointment/receipt rules and quoted incident evidence.

Reproduce the focused database test by running `node scripts/prepare-messaging-verification.cjs` and executing its output as one SQL transaction against the deployed schema. Before applying these migrations to a test database, add `--staged` to include their definitions in the same rollback transaction. The output always includes BEGIN and ROLLBACK; do not run isolated fixture fragments.

Both migrations were applied to the existing project. Post-deployment checks confirmed the invoker view, anonymous access denial, publication membership, repeated-letter blocking and clean-word acceptance. Security-advisor finding types and counts remained unchanged from the baseline.

Remaining manual verification: actual signed-in browser sessions on separate devices, including a live WebSocket reconnect and visual mobile inspection. Component event simulation and role-authenticated database tests do not constitute that end-to-end check; no real account credentials were available for it.
