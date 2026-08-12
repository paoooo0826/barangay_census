# Repair pass 1

Fixed the main census form and verification blockers:

- Guarded the optional captured-face storage path for no-webcam records.
- Corrected the default region from CARAGA to Cordillera Administrative Region (CAR).
- Allowed valid IDs without a face photograph to continue through liveness verification and be flagged for manual admin review.
- Preserved skipped/no-webcam verification records when loading Update Census.
- Replaced the random `sort()` action shuffle with Fisher-Yates.
- Aligned shared education and tenurial TypeScript values with the census form.
- Included the supplied `.env` file in this local project package.

Run the included `submit-census-database-fix.sql` in Supabase before testing no-webcam submissions.

## GitHub Pages preparation

- Configured the production base path for the `barangay-census` repository.
- Replaced browser-history routing and absolute redirects with GitHub
  Pages-compatible hash routing.
- Added an automatic GitHub Pages deployment workflow.
- Removed the committed `.env` file and documented repository secrets.
- Rebuilt the dependency lockfile using the public npm registry.
- Added the missing QR code dependency to the lockfile.
- Removed unused packages with vulnerable transitive dependencies.
- Corrected the TypeScript build-blocking unused import.

## Feature update 2

- Enlarged the live camera to a 4:3 preview and added an orientation flip control.
- Added the missing monthly-rent input shown when **Renter** is selected.
- Added administrator announcements with resident targeting, priorities,
  expiration, publishing controls, and a resident announcement feed.
- Added descriptive, diagnostic, predictive, and prescriptive administrator
  analysis with documented rule-based estimates.
- Added `new-features-migration.sql` with the required announcement table,
  monthly-rent safeguard, indexes, and Row Level Security policies.
