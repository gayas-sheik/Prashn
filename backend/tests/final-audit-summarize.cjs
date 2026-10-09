const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'backend/.test-output');
const read = file => fs.readFile(file, 'utf8');
async function testCounts(file) {
  const bytes = await fs.readFile(path.join(output, file));
  const log = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString('utf16le') : bytes.toString('utf8');
  const passed = log.match(/# pass (\d+)/); const failed = log.match(/# fail (\d+)/);
  if (!passed || !failed) throw new Error(`Test totals absent from ${file}`);
  return { passed: Number(passed[1]), failed: Number(failed[1]) };
}
async function files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
(async () => {
  const acceptance = JSON.parse(await read(path.join(output, 'final-audit-latest.json')));
  const full = JSON.parse(await read(path.join(acceptance.run, 'evidence.json')));
  const faults = JSON.parse(await read(path.join(output, 'final-audit-faults-latest.json')));
  const priorFaults = JSON.parse(await read(path.join(output, 'final-audit-faults-I8Q40O/observations.json')));
  const evaluation = JSON.parse(await read(path.join(output, 'evaluation/latest.json')));
  const sourceFiles = [...await files(path.join(root, 'src')), ...await files(path.join(root, 'backend/src')), ...await files(path.join(root, 'backend/tests')), ...['package.json','package-lock.json','backend/package.json','backend/package-lock.json','vite.config.ts'].map(file => path.join(root, file))];
  const inventory = [];
  for (const file of sourceFiles.sort()) inventory.push({ file: path.relative(root, file).replace(/\\/g, '/'), sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex') });
  const result = {
    project: 'Prashn', date: '2026-10-09', timezone: 'Asia/Calcutta', checkout: 'Prashn-latest', baseCommit: 'd330c37',
    runtime: { node: process.version, platform: process.platform },
    backendTests: { initial: await testCounts('final-audit-npm-test.log'), initialFaults: await testCounts('final-audit-faults-before.log'), intermediate: { ...await testCounts('final-audit-npm-test-after.log'), cause: 'Overstrict missing-value guard rejected valid payment row; corrected' }, final: await testCounts('final-audit-npm-test-final.log'), rawLog: 'backend/.test-output/final-audit-npm-test-final.log' },
    frontend: { build: 'passed', lint: '11 warnings, no errors', browser: 'BLOCKED: no enabled browser; iab unavailable' },
    checks: acceptance.checks, apiRequests: full.requests,
    database: { integrity: full.observations.schema.integrity, foreignKeyViolations: full.observations.schema.foreignKeys, finalCounts: full.observations.finalCounts },
    faultsBefore: priorFaults, faultsAfter: faults.observations, evaluation: evaluation.summary,
    evidenceDirectories: { acceptance: path.relative(root, acceptance.run).replace(/\\/g, '/'), faultsAfter: path.relative(root, faults.run).replace(/\\/g, '/'), faultsBefore: 'backend/.test-output/final-audit-faults-I8Q40O' },
    normalApplication: {
      backendHealth: await (await fetch('http://localhost:5000/api/health')).json(),
      frontendProxyHealth: await (await fetch('http://localhost:5173/api/health')).json(),
      configurationChange: 'Ignored local environment previously had no signing secret; generated 48 random bytes, never displayed. Old fallback-signed sessions require login.',
    },
    realDocumentReview: {
      template: { pagesExtracted: 10, pagesVisuallyGraded: [1], finalFields: 8, selectedInvoiceTotalVendorValues: 'matched rendered source', printedDatePlaceholder: 'refused after repair', unlabeledCustomerBlock: 'not recovered', originalChecksum: 'unchanged', privateOutput: 'ignored locally' },
      rideInvoice: { pagesExtracted: 3, pagesVisuallyGraded: [1,2,3], finalFields: 35, selectedIdentifiersDatesCustomerPaymentTotalValues: 'matched rendered source', unlabeledVendorHeading: 'not recovered', originalChecksum: 'unchanged', privateOutput: 'ignored locally' },
    },
    sourceInventory: inventory,
  };
  // Only fictional fixtures and redacted tokens are present in this summary.
  // Private real-document contents remain exclusively in ignored local output.
  await fs.writeFile(path.join(root, 'docs/local-mvp-final-audit-evidence.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ checks: acceptance.checks.length, passed: acceptance.checks.filter(c => c.status === 'VERIFIED').length, requests: full.requests.length, integrity: result.database.integrity, foreignKeys: result.database.foreignKeyViolations, sourceFiles: inventory.length, output: 'docs/local-mvp-final-audit-evidence.json' }));
})().catch(error => { console.error(error); process.exitCode = 1; });
