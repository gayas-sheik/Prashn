# Synthetic document evaluation

The nine generated PDFs contain fictional invoices, a receipt, an application form, a contract, a shipment record, a scanned invoice, a sideways scan and a mixed digital/scanned document. Their answer key specifies 72 expected fields, two line items and 73 sequential questions, including 12 questions with missing evidence.

Run from the backend directory:

    npm run evaluate

Requirements: installed npm dependencies; Python with reportlab and Pillow; Windows Arial font at C:/Windows/Fonts/arial.ttf. No inference model or network OCR is used. For a rendered contact sheet, run node tests/evaluation/render.cjs after generating the fixtures.

Generated documents and isolated API databases stay under the ignored .test-output/evaluation directory. run.cjs writes latest.json by default and exits unsuccessfully if processing, classification, page count, extraction method, expected fields/provenance, line items, answers or citation checks fail. The evaluation uses actual upload, processing and persisted-question HTTP endpoints; it does not substitute mocked extraction results.

The answer key is defined independently of the extracted output. Field correctness requires the specified label, value and page with a verbatim source snippet. Positive answer correctness checks specified content and rejects a generic passage dump when a direct field/item answer is expected. Citation checks require the expected pages, original filename, verbatim snippets, and the expected supporting values. Missing-evidence questions must produce the exact refusal and no citations. Extra extracted fields remain in the JSON for inspection; this is expected-field recall/correctness, not a precision estimate for every emitted field or a semantic grading model.

The baseline was recorded before repairs; after.json contains the completed repair run. It uses the same fixtures and answer key. These are synthetic development/regression results, not an estimate of accuracy on arbitrary real documents or an independent post-fix holdout.
