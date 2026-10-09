const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveDocumentQuestion}=require('../dist/processing/question.language');
const {ExtractiveDocumentAnswerer,NOT_FOUND}=require('../dist/processing/document.answerer');
const {StructuredFieldExtractor}=require('../dist/processing/field_extractor');
const pages=[{page:1,text:'INVOICE\nVendor: Example North Ltd\nCustomer: Example Buyer\nPhone: +1 202 555 0147\nTotal: USD 165.00',extractionMethod:'text'},{page:2,text:'INVOICE\nInvoice Number: EVAL-2\nTotal: USD 220.00',extractionMethod:'text'}];
const doc={originalFileName:'context.pdf',documentType:'Invoice',pages,pagesCount:2,...new StructuredFieldExtractor().extractFields(pages.map(p=>p.text).join('\n'),'Invoice',pages)};
const pair=(question,sections=['Total'],sourcePages=[1])=>[{sender:'user',text:question},{sender:'assistant',text:'source-backed answer',citations:sourcePages.map(page=>({page,section:sections[0]}))}];

test('follow-ups carry explicit pages through persisted original questions',async()=>{
  const history=[...pair('What is the total on page 1?'),...pair('And on page 2?',['Total'],[2])];
  assert.equal(resolveDocumentQuestion('And its invoice number?',history),'invoice number on page 2');
  const answer=await new ExtractiveDocumentAnswerer().answer(resolveDocumentQuestion('And its invoice number?',history),doc);
  assert.match(answer.text,/EVAL-2/);assert.deepEqual(answer.citations.map(c=>c.page),[2]);
});

test('empty, failed, cleared and ambiguous context cannot supply an antecedent',()=>{
  for(const history of [[],[{sender:'user',text:'Who is the vendor?'},{sender:'assistant',text:NOT_FOUND,citations:[]}],[{sender:'user',text:'Summarize this document'},{sender:'assistant',text:'summary',citations:[{page:1,section:'Vendor / Seller'},{page:1,section:'Bill To'}]}]])assert.equal(resolveDocumentQuestion('What is their phone number?',history),null);
  assert.equal(resolveDocumentQuestion('And on page 2?',[]),null);
  assert.equal(resolveDocumentQuestion('And its invoice number?',pair('What are the totals?', ['Total'], [1,2])),null);
  assert.equal(resolveDocumentQuestion('What is their phone number?',pair('Who are the vendors?', ['Vendor / Seller'], [1,2])),null);
  assert.equal(resolveDocumentQuestion('What about the other one?',pair('What is the total?', ['Total'],[1,2])),'What about the other one?');
});

test('party follow-ups distinguish customer information from an unqualified vendor phone',async()=>{
  const answerer=new ExtractiveDocumentAnswerer();
  const vendor=resolveDocumentQuestion('What is their phone number?',pair('Who is the vendor?',['Vendor / Seller']));
  assert.match((await answerer.answer(vendor,doc)).text,/0147/);
  const customer=resolveDocumentQuestion('What is their phone number?',pair('Who is the buyer?',['Bill To']));
  assert.equal((await answerer.answer(customer,doc)).text,NOT_FOUND);
});

test('paraphrases retain unsupported qualifiers and missing payment evidence',async()=>{
  const answerer=new ExtractiveDocumentAnswerer();
  for(const question of ['How much federal tax was charged?','How much do I owe for shipping?','Who supplied the damaged printer?','What does one printer cost?','Is this invoice paid?','How much was paid to Alice?','What is the vendor age?'])assert.equal((await answerer.answer(question,doc)).text,NOT_FOUND,question);
});

test('a warranty scope does not establish its duration',async()=>{
  const short={originalFileName:'warranty.pdf',documentType:'Contract',pagesCount:1,pages:[{page:1,text:'Warranty covers manufacturing defects.',extractionMethod:'text'}],extractedFields:[],lineItems:[]};
  assert.equal((await new ExtractiveDocumentAnswerer().answer('How long is the warranty?',short)).text,NOT_FOUND);
});

test('column values do not absorb unrelated footer text; multiline addresses remain intact',()=>{
  const extraction=new StructuredFieldExtractor().extractFields('Tracking Code\tTRK-0281\nStorage Condition\tKeep dry\n\nThis is an unrelated footer','Unknown');
  assert.equal(extraction.extractedFields.find(f=>f.label==='Storage Condition').value,'Keep dry');
  const address=new StructuredFieldExtractor().extractFields('INVOICE\nCustomer Address\n10 Example Road\nExample City\nTotal: USD 1.00','Invoice');
  assert.equal(address.extractedFields.find(f=>f.label==='Customer Address').value,'10 Example Road\nExample City');
});


test('passage fallback refuses labels without an associated answer value', async () => {
  const answerer = new ExtractiveDocumentAnswerer();
  for (const heading of ['Vehicle Number', 'Vehicle Number:', 'Vehicle\tNumber']) {
    const missing = { originalFileName: 'missing-value.pdf', documentType: 'Invoice', pagesCount: 2,
      pages: [{ page: 1, text: 'Payment Summary', extractionMethod: 'text' }, { page: 2, text: heading + '\nCaptain Name\nExample Driver', extractionMethod: 'text' }], extractedFields: [], lineItems: [] };
    const answer = await answerer.answer('What is the vehicle number?', missing);
    assert.equal(answer.text, NOT_FOUND, heading);
    assert.deepEqual(answer.citations, []);
  }
});

test('passage fallback selects supporting content instead of a shorter heading', async () => {
  const passage = 'Warranty covers manufacturing defects for twelve months.';
  const source = { originalFileName: 'warranty-heading.pdf', documentType: 'Contract', pagesCount: 1,
    pages: [{ page: 1, text: 'Warranty\n' + passage, extractionMethod: 'text' }], extractedFields: [], lineItems: [] };
  const answer = await new ExtractiveDocumentAnswerer().answer('What is the warranty?', source);
  assert.equal(answer.text, 'Relevant document passages:\n\n' + passage);
  assert.deepEqual(answer.citations.map(c => c.snippet), [passage]);
});
