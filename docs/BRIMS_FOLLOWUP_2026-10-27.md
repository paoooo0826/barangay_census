# Role and camera follow-up

The resident incident/feedback pages used the same management filter block as the admin panels. These controls are now admin-only. Residents retain submission forms, a simple My Reports/My Feedback history, their tracking references and the responses intended for them. Resident list and detail queries also explicitly filter by account in addition to existing database ownership policies.

Landlord contact names are displayed to boarders and administrators. A landlord's management page no longer repeats their own name as a contact, and their count ledger is titled My Reported Counts. Their message conversation identifies the Barangay Office as the other party. Admin messages still identify the assigned landlord. Boarding navigation remains conditional on the saved census role; census role selection and authorized management remain available.

The census ID and live-face cameras now render through a body portal, outside form cards. Capture screens occupy the viewport without preview borders, padding or rounded card frames. Header and capture controls overlay the image, respect safe areas, remain scrollable on short displays, and preserve close, Escape, retake, confirm, switch and preview-orientation controls. Guides retain positioning and shading without drawn outlines. Video and captured photos retain their original proportions; capture orientation and detection rules are unchanged.

Additional logic fixes:

- Open resident report details refresh their saved status and response on focus and while visible.
- A failed boarding-house read clears the prior result; totals are bound to the selected house and date/history page. Previous-house results cannot be submitted as a new-house update.
- Count retries preserve the original request key, action and expected version after a background refresh. A lost reply cannot turn a previously committed initial balance or arrival into a second entry. Uncertain retries lock the old inputs until confirmed; explicit database validation/conflict errors allow correction.
- A late count-save response cannot replace the state of a different selected house.
- Opening cancellation from an appointment deep link clears that detail link, so background refresh cannot reopen the details over the cancellation dialog.
- Reversed administrator report date ranges show validation instead of stale results.

Validation: 508 automated checks pass (including role-specific controls, ownership filters, live report refresh, lost-response initial-zero/arrival retries, failed house switches, conversation labels, and borderless camera portals). ESLint and the TypeScript/production build pass. No database policy or schema changes were needed for this follow-up. Physical camera/permission testing on a real phone or webcam remains outside this environment; existing capture, orientation, permission cancellation and stream-release tests pass.
