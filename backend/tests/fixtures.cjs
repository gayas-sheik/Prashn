const { createCanvas } = require('@napi-rs/canvas');

function pdf(pages) {
  const objects = [null, '', ''];
  const add = value => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value)); return objects.length - 1; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const stream = (data, entries = '') => Buffer.concat([Buffer.from(`<< ${entries} /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream')]);
  const pageIds = [];
  for (const page of pages) {
    let commands;
    let resources = `/Font << /F1 ${font} 0 R >>`;
    if (page.jpeg) {
      const image = add(stream(page.jpeg, `/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`));
      resources += ` /XObject << /Im0 ${image} 0 R >>`;
      commands = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
    } else {
      const positioned = page.rows.flatMap((row, index) => {
        const cells = Array.isArray(row) ? row : [row];
        return cells.map((text, col) => ({ col, index, command: `BT /F1 12 Tf 1 0 0 1 ${[40,280,380,490][col]} ${750 - index * 24} Tm (${text.replace(/[\\()]/g, '\\$&')}) Tj ET` }));
      });
      if (page.valuesFirst) positioned.sort((a, b) => b.col - a.col || a.index - b.index);
      commands = positioned.map(item => item.command).join('\n');
    }
    const content = add(stream(Buffer.from(commands)));
    pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${resources} >> /Contents ${content} 0 R >>`));
  }
  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = Buffer.from(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`);
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let length = parts[0].length;
  for (let index = 1; index < objects.length; index++) {
    offsets.push(length);
    const object = Buffer.concat([Buffer.from(`${index} 0 obj\n`), objects[index], Buffer.from('\nendobj\n')]);
    parts.push(object); length += object.length;
  }
  parts.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
  return Buffer.concat(parts);
}

const invoicePages = [
  { rows: ['INVOICE', 'Invoice Number: INV-2026-001', 'Vendor: ABC Technologies', 'Bill To: Example Customer', 'Invoice Date: 2026-10-09', ['Description','Qty','Unit Price','Amount'], ['Laptops','2','USD 500.00','USD 1,000.00'], ['Monitor','1','USD 100.00','USD 100.00'], 'Subtotal: USD 1,100.00'] },
  { rows: ['Tax: USD 110.00', 'Grand Total: USD 1,210.00', 'Warranty covers manufacturing defects for twelve months.', 'Payment Terms: Net 30 days'] },
];
function image(blank = false) {
  const canvas = createCanvas(1600, 1100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'black'; ctx.font = '36px Arial';
  if (!blank) ['INVOICE', 'Invoice Number: SCAN-123', 'Vendor: Clear Scan Technologies', 'Invoice Date: 2026-10-09', 'Subtotal: USD 100.00', 'Tax: USD 10.00', 'Grand Total: USD 110.00', 'Warranty covers defects for twelve months.'].forEach((line, index) => ctx.fillText(line, 70, 100 + index * 85));
  return { png: canvas.toBuffer('image/png'), jpeg: canvas.toBuffer('image/jpeg'), width: canvas.width, height: canvas.height };
}
module.exports = { pdf, invoicePages, image };
