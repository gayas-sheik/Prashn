# Synthetic evaluation and browser verification

Date: 9 October 2026. Working checkout: Prashn-latest. Tests used generated fictional documents and isolated SQLite/storage directories. Existing user uploads were not changed or reprocessed.

## Document benchmark

Nine PDFs cover a values-first column invoice, three invoice pages with repeated amounts, a paid receipt, application form, service agreement, generic shipment columns, scanned invoice, sideways scanned invoice and mixed digital/scanned pages. All 12 generated pages were rendered with the installed PDF.js/pdf-parse renderer and visually inspected as a contact sheet; the browser also displayed the original invoice. Python reportlab and Pillow author the fixtures. The expected fields, answers and pages were specified separately from actual extraction.

| Check | Before | After |
| --- | --- | --- |
| Expected fields with provenance | 64/72 | 72/72 |
| Correct answers | 42/73 | 73/73 |
| Positive-answer citation checks | 33/61 | 61/61 |
| Correct missing-evidence refusals | 12/12 | 12/12 |
| Fully correct question and citation checks | 41/73 | 73/73 |

All nine documents completed, classification/page counts/extraction methods matched, and both expected line items passed after repairs. Before repair, seven fields were missing and one absorbed a distant footer; after repair, no expected fields were missing or incorrect.

These numbers describe this synthetic development benchmark. The same answer key was retained for the comparison, but this is not an independent post-fix holdout or an estimate of accuracy on arbitrary real documents. Positive-answer grading checks required content and citations, rather than using a semantic grading model. Unexpected emitted fields remain available for inspection in the raw JSON; the field metric does not measure their precision.

## Repairs

- Added bounded common question rewrites for supplier, due dates, owed/paid amounts, tax percentages, item prices, applicant details and shipment fields. Extra qualifiers remain significant.
- Resolved explicit page follow-ups and party pronouns from the immediately preceding successfully cited, document-owned conversation. Ambiguous or missing antecedents refuse. History selects a source context and never supplies answer facts.
- Retrieved short source passages and required a printed duration for warranty-duration questions. Kept totals separate from paid amounts and tax rates.
- Retried weak OCR at quarter turns on an expanded canvas, avoiding the OCR library rotation path that clipped labels. Originals and full extraction remain preserved.
- Retained large vertical layout gaps as paragraph boundaries so a distant footer does not become part of a structured value, while multiline addresses and categories still work.
- Fixed the document breadcrumb overflowing the mobile header and stacked batch staging actions on small screens. Removed fabricated document/queue counts, unsupported certification/cloud claims and placeholder account identities from navigation.

## Browser verification

Brave on Windows, a desktop capture of 1536 x 864 and a 390 x 844 CSS-pixel DevTools phone viewport. The frontend ran at localhost:5186 and its API target at localhost:5066, using a separate synthetic account and test database. Native file pickers, browser clicks, Enter submission and rendered screenshots were used.

| Check | Result | Observed evidence |
| --- | --- | --- |
| Single upload | PASS | Selected invoice-columns.pdf in Single Document Quick Inspect, clicked Upload / Retry Files; completion automatically navigated to its document details. |
| PDF preview | PASS | Browser PDF viewer rendered the original invoice with identifier EVAL-A104, correct columns, and scrollable content. Details displayed 11 fields and 2 line items. |
| Browser Q&A | PASS | Typed How much do I owe? and pressed Enter. UI rendered USD 165.00 with Source: Page 1, Total. |
| Chat history and scrolling | PASS | Reload restored 14 persisted messages. Scrolling inside the message thread changed visible messages while the document column and chat header stayed in place. Outer page scrolling exposed the input, and Enter successfully sent the browser question. |
| Mobile viewport | PASS (header repaired) | At 390 x 844 CSS pixels, the long document identifier initially overflowed the header. After hiding that breadcrumb on small screens, the header, Q&A field column and upload page fit the viewport. Mobile menu opened and Upload Documents navigation closed it and changed the route. |
| Batch results | PASS | Uploaded receipt-payment.pdf and broken.pdf together through the mobile UI. Stayed on /upload; inline results showed 1 of 2 ready, receipt fields including GBP 24.00 total, and Invalid PDF structure for the corrupt PDF. |
| Mobile upload controls | PASS (layout repaired) | Stacked the selected-document heading and actions on small screens. Clear All and Upload / Retry Files remained fully visible and the mobile upload completed. |
| Failed-document retry | PASS | Clicked Retry Processing for broken.pdf. A second failed processing event was recorded; the UI retained Invalid PDF structure and the Failed state, correctly avoiding a false success. |
| Session expiry | PASS | Signed in through the browser with JWT_EXPIRES_IN=30s in the isolated server. Observed the authenticated dashboard, then protected polling responses changed to HTTP 401 and the browser automatically returned to /login without a sign-out action. |

The long-history stress setup appended six summary question pairs through the real API before browser reload. Browser submission was independently checked using the typed owed-amount question. Retry of the corrupt PDF appropriately failed again; this verifies the retry action and honest reporting, not repair of damaged source bytes. Session expiry used a temporary 30-second JWT lifetime only in the isolated server; HTTP status logs contain no tokens, credentials or request bodies.

## Automated verification

The final backend build and all 24 regression cases passed after the ambiguity guard. The complete synthetic HTTP benchmark exited successfully: 9/9 documents, 72/72 expected fields, 2/2 line items, 73/73 answers, 61/61 positive citation checks and 12/12 refusals. Frontend TypeScript and Vite production builds passed. Lint exited successfully with 11 advisory warnings and zero errors; git diff --check passed.

## Reproduction and artifacts

From backend/: npm test runs the normal regression suite; npm run evaluate builds the backend, generates fixtures and runs the HTTP benchmark. The optional benchmark requires Python, reportlab, Pillow and the Windows Arial font. See backend/tests/evaluation/README.md for grading definitions.

Generated fixtures and raw before/after results: backend/.test-output/evaluation/. Browser notes and response-status evidence: backend/.test-output/browser-evaluation/. These runtime directories remain ignored.

## Limits and application use

This verifies the listed flows in Brave and one emulated phone viewport. Other browsers, physical devices, drag-and-drop, network interruptions and the full range of real document layouts remain outside this pass. Extraction and Q&A remain heuristic; no model was trained, installed or invoked.

Restart a separately running compiled backend to load the new code. Existing document records require Reprocess to apply extraction changes. The evaluation did not restart the original backend or alter its database.
