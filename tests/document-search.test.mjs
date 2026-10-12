import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesDocumentSearch } from '../src/services/documentSearch.ts';

const invoice = {
  id: 'DOC-A', name: 'invoice-b.pdf', documentType: 'Invoice',
  extractedFields: [{ label: 'Vendor / Seller', value: 'Audit Contoso Services' }, { label: 'Invoice Number', value: 'AUD-B' }],
  pages: [{ page: 1, text: 'INVOICE' }, { page: 2, text: 'Warranty covers manufacturing defects for twelve months.' }],
};

test('finds vendor and invoice number that filename search cannot match', () => {
  assert.equal(matchesDocumentSearch(invoice, 'Contoso'), true);
  assert.equal(matchesDocumentSearch(invoice, 'AUD-B'), true);
  assert.equal(matchesDocumentSearch(invoice, 'Northwind'), false);
});

test('searches full text beyond the first page', () => {
  assert.equal(matchesDocumentSearch(invoice, 'manufacturing defects'), true);
  assert.equal(matchesDocumentSearch(invoice, 'passport'), false);
});

test('handles case, whitespace, empty queries and documents without extraction', () => {
  assert.equal(matchesDocumentSearch(invoice, '  contoso  '), true);
  assert.equal(matchesDocumentSearch(invoice, ' INVOICE-B '), true);
  assert.equal(matchesDocumentSearch({ id: 'DOC-PENDING' }, 'pending'), true);
  assert.equal(matchesDocumentSearch({ id: 'DOC-PENDING' }, 'Contoso'), false);
  assert.equal(matchesDocumentSearch({}, ' '), true);
});

test('finds summary text when only metadata is available', () => {
  assert.equal(matchesDocumentSearch({ extractedSummary: 'Sample code: CU-42' }, 'cu-42'), true);
});
