# Basic ID picture screening

The registration and census verification flow now screens the ID front before
opening live face verification. Both uploaded and camera-captured ID fronts use
the same check, after the existing crop and image-quality checks.

- Recognizes printed headings for the six ID types already offered: PhilSys ID,
  Driver's License, Passport, UMID, Postal ID, and Voter's ID.
- Requires readable name and identifying-detail labels and numeric content.
  Selfies, blank images, and unrelated pictures without ID content are rejected
  with retake instructions.
- A clear mismatch between a recognized heading and the selected ID type asks
  the resident to correct the selection or picture. Uncertain readings and the
  existing Other ID option can proceed only with a manual-review recommendation.
- Uncertain ID text keeps that recommendation even after a strong face match.
  The existing no-usable-ID-face manual-review route is retained.
- Changing the ID type or front image, closing the capture screen, or navigating
  away cancels the check. Late results cannot reopen capture. Loading failures
  and a 90-second timeout offer a retry; neither silently accepts the picture.

Tesseract.js 7.0.0 and English language data are pinned dependencies. The build
and dev scripts generate deployment-local worker, WebAssembly, and language
assets under `public/ocr/v7`. Generated assets are not committed. The actual
recognition runs in a cancellable worker on the device; image pixels and
extracted text are not sent to an OCR provider or stored in logs/local storage.
Only the existing short manual-review reason is saved through the existing
verification flow. No database migration or additional credentials are needed.

This is a client-side content screen, not issuer authentication, forgery
detection, expiry validation, or proof that the document belongs to its holder.
It does not set `government_ids.is_verified`. Existing administrator approval,
private storage, face comparison, liveness, and authorization stay in place.
Existing stored ID records are not retroactively blocked or marked verified.

## Verification

- 546 automated checks passed, including 29 new document/OCR lifecycle checks,
  8 additional integration checks for the live-verification gate, and an admin
  review check for the saved screening reason.
- ESLint and the TypeScript/Vite production build passed.
- The real OCR engine read a generated synthetic test document (95 confidence)
  and rejected a generated unrelated text image (95 confidence).
- The browser environment could not reach the local dev server. The browser
  worker path is covered by component/lifecycle tests and checked in the built
  asset output; manual browser/phone-camera testing remains outstanding.
- Recognition thresholds and heading patterns are heuristics. No representative
  set of real resident IDs was used to measure false acceptance/rejection rates.
  Final ID approval continues to require an administrator.
