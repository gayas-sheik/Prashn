// Maintainer-only fixture generation; live verification needs only Python/AWS CLI.
const fs = require('node:fs');
const path = require('node:path');
const { image, pdf } = require('../backend/tests/fixtures.cjs');
const scan = image();
const expected = { type: 'Invoice', vendor: 'Clear Scan Technologies', total: 'USD 110.00', text: 'Warranty covers defects for twelve months.' };
const items = [
  { name: 'scan.png', mime: 'image/png', bytes: scan.png },
  { name: 'scan.jpg', mime: 'image/jpeg', bytes: scan.jpeg },
  { name: 'scan.pdf', mime: 'application/pdf', bytes: pdf([{ jpeg: scan.jpeg, width: scan.width, height: scan.height }]) },
].map(({ bytes, ...item }) => ({ ...item, ...expected, content: bytes.toString('base64') }));
fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'fixtures', 'audit-images.json'), JSON.stringify(items, null, 2) + '\n');
