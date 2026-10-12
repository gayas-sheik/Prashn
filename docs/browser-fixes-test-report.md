# Browser defect fixes - 12 October 2026

The defects found in the [cloud browser pass](cloud-browser-test-report.md) were corrected and validated locally as described below. This report records the checks before publication and deployment; it is not cloud release acceptance. The cloud report describes release `d701698` and retains its original verdict.

## Changes and evidence

| Area | Correction | Verification |
| --- | --- | --- |
| Document search | Documents and Dashboard share a search predicate covering filenames, metadata, extracted field values/snippets, summaries, and full text from every page. | Four regression tests passed. In Chrome, `Contoso` and `AUD-B` each found invoice B; `manufacturing defects` found invoice A's page 2 text; `Passport` returned no matches. |
| Embedded PDF navigation | Page/zoom changes create a fresh object URL from the already downloaded Blob, forcing native viewer navigation. URLs are revoked on cleanup and previews are scoped to document ID. Previous/Next controls have accessible names. | The owner clicked Next page on local invoice A and confirmed the actual viewer displayed page 2, including Tax, Grand Total, and Warranty. This is owner verification: Chrome automation timed out on the native PDF viewer, so there is no automated rendered-page assertion or screenshot for this check. |
| Workspace/storage labels | Removed unconditional local-only labels. Pipeline storage comes from API configuration; Q&A storage comes from the document's storage URI. Other copy describes the workspace without assuming a hosting mode. | Chrome showed neutral workspace labels and the correct Local storage value for the isolated local backend. The cloud branch is implemented but has not been checked against a newly deployed AWS release. |
| Activity metrics | Success is completed / (completed + failed) documents. Average processing time uses recorded durations from completed documents; missing or malformed durations are excluded. Failure/warning cards describe actual events without claiming SQS DLQ measurements. Actor/event options come from actual activity. | Chrome showed 75% (3 completed / 4 finished), 0.33s across three measured durations, and one failed event. Backend tests cover valid, zero, missing, malformed, and non-completed durations plus API account isolation. |
| Copy/export labels | Copy JSON now awaits clipboard success and reports a failure with a manual fallback. Activity's existing CSV action is labelled Export CSV. | Build/lint passed. Clipboard contents were not independently verified by browser automation; no claim of end-to-end clipboard delivery is made. |

The UI layout and styling are preserved. No extraction, Q&A evidence rules, or storage/repository interfaces were changed.

## Test environment

The browser used `http://127.0.0.1:5178` with an isolated real Express backend on port 5017, SQLite/filesystem storage, and actual PDF/Tesseract processing. Four fictional fixtures were uploaded through the API: two native PDFs, a PNG scan, and a corrupt PDF. Three completed and the corrupt PDF failed as expected. The generated test account, database, uploads, and helper files are under ignored runtime directories; no credentials are included here.

Measured processing durations were 0.1s, 0.0s, and 0.9s. Their mean is 0.3333s, displayed as 0.33s. This metric excludes queue wait and reflects the processor's recorded precision; it is not an end-to-end latency or performance benchmark.

## Automated checks

| Command (repository root) | Result |
| --- | --- |
| `npm test` | 4 frontend search tests passed |
| `npm --prefix backend test` | Backend build and 36 regression tests passed |
| `npm run build` | TypeScript and production Vite build passed |
| `npm run lint` | Passed: zero errors, 10 remaining warnings in existing code |
| `python -W error::ResourceWarning -m unittest discover -s infra/tests -v` | 56 infrastructure/workflow safety tests passed |

The new frontend search tests also run in GitHub CI. AWS emulator tests and live cloud acceptance were not repeated in this local fix pass. GitHub CI and a release-specific cloud browser check are still required after publication.

## Local screenshots and release state

- [Vendor search result](../.aws-build/browser-fixes-2026-10-12/vendor-search.jpg)
- [Measured activity cards](../.aws-build/browser-fixes-2026-10-12/activity-metrics.jpg)

Screenshots remain ignored local artifacts. The AWS API and worker fleets were last verified paused at zero during the earlier cloud browser pass. No AWS resume, IAM update, or release was performed for these fixes.

The next release should run CI, deploy through approved delivery, verify the new release revision, repeat search/PDF/storage-label/metric checks against AWS, then use the existing pause helper and verify both fleets return to zero.
