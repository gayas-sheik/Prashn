import { DocumentType, DocumentPage, ExtractedField, LineItem } from '../types';

const AMOUNT = /^(?:(?:USD|INR|EUR|GBP|Rs\.?|[$€£₹])\s*)?-?\d[\d,.]*(?:\s*(?:USD|INR|EUR|GBP))?$/i;
const MONEY_TOKEN = '(?:(?:USD|INR|EUR|GBP|Rs\\.?|[$€£₹])\\s*)?-?\\d[\\d,.]*(?:\\s*(?:USD|INR|EUR|GBP))?';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class StructuredFieldExtractor {
  extractFields(text: string, type: DocumentType, pages?: DocumentPage[]): { extractedFields: ExtractedField[]; lineItems: LineItem[] } {
    const fields: ExtractedField[] = [];
    const items: LineItem[] = [];
    const canonical = new Map<string, string>();
    const partyRows = new Set<number>();
    const heading = /^(?:invoice(?: no\.?| number| date| id)?|receipt(?: no\.?| number| date)?|(?:due|issue|birth) date|date|state|tax category|place of supply|gst(?: number)?|vehicle number|captain name|customer(?: name| (?:pick up|pickup|billing|shipping) address)?|(?:pick up|pickup|billing|shipping) address|bill(?:ed)? to|bill details|payment summary|total(?: amount)?|sub[ -]?total|from|to|tax|currency|email|phone)\s*[:#]?$/i;
    const validValue = (label: string, value: string) => {
      if (heading.test(value)) return false;
      if (/\bdate\b/i.test(label)) return /\d/.test(value) && /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(value);
      if (/^(?:Invoice|Receipt) Number$/.test(label)) return /^[\p{L}\p{N}_/#.-]+$/u.test(value);
      return true;
    };
    const rows = (pages || [{ page: 1, text, extractionMethod: 'text' as const }]).flatMap(page => page.text.split('\n').map(line => ({ page: page.page, line: line.trim() })).filter(row => row.line));
    const add = (label: string, value: string, row: typeof rows[number], confidence = 0.9) => {
      if (value.trim() && !fields.some(field => field.label.toLowerCase() === label.toLowerCase() && field.value === value.trim())) fields.push({ label, value: value.trim(), page: row.page, snippet: row.line, confidence });
    };
    const labeled = (label: string, aliases: string[]) => {
      for (const alias of aliases) canonical.set(alias.toLowerCase(), label);
      const pattern = new RegExp(`^(?:${[...aliases].sort((a, b) => b.length - a.length).map(escape).join('|')})(?:[ \\t]*[:#][ \\t]*|[ \\t]+|$)(.*)$`, 'i');
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const match = row.line.match(pattern);
        if (!match) continue;
        const next = rows[index + 1];
        let value = match[1].trim() || (next?.page === row.page ? next.line : '');
        if (!value || !validValue(label, value)) continue;
        let snippet = match[1].trim() ? row.line : `${row.line}\n${value}`;
        if (/address$/i.test(label) && !match[1].trim()) {
          for (let following = index + 2; following < rows.length; following++) {
            const continuation = rows[following];
            if (continuation.page !== row.page || heading.test(continuation.line) || /\t|:/.test(continuation.line)) break;
            value += '\n' + continuation.line; snippet += '\n' + continuation.line;
          }
        }
        if (label === 'Payment Method' && /\t/.test(value)) {
          const cells = value.split(/\t+/);
          if (cells.length === 2 && AMOUNT.test(cells[1])) {
            add('Amount Paid', cells[1], { ...row, line: snippet });
            value = cells[0];
          }
        }
        add(label, value, { ...row, line: snippet });
        break;
      }
    };
    // Explicit fields can appear in every document type, including unknown documents.
    const common: [string, string[]][] = [
      ['Vendor / Seller', ['Vendor', 'Vendor Name', 'Supplier', 'Seller', 'Sold by', 'Issued by', 'From']],
      ['Bill To', ['Bill To', 'Billed To', 'Customer', 'Customer Name', 'Buyer', 'Client']],
      ['Email', ['Email', 'E-mail', 'Email Address']], ['Phone', ['Phone', 'Telephone', 'Mobile', 'Tel']],
      ['Address', ['Address', 'Vendor Address', 'Supplier Address']], ['Currency', ['Currency']],
      ['Customer Address', ['Customer Address', 'Customer Pick Up Address', 'Customer Pickup Address', 'Billing Address']],
      ['Payment Terms', ['Payment Terms', 'Terms']], ['Payment Method', ['Payment Method', 'Paid by', 'Tender', 'Paid Using', 'You Paid Using']],
      ['Payment Status', ['Payment Status', 'Invoice Status']],
      ['Tax Rate', ['Tax Rate', 'Tax Percentage', 'GST Rate', 'VAT Rate']],
      ['GST Number', ['GST Number', 'GSTIN', 'GST Registration Number']],
    ];
    common.forEach(([label, aliases]) => labeled(label, aliases));
    if (type === 'Invoice' || type === 'Receipt') {
      labeled(type === 'Invoice' ? 'Invoice Number' : 'Receipt Number', [`${type} Number`, `${type} No.`, `${type} No`, `${type} #`, `${type} ID`]);
      const bare = rows.find(row => new RegExp(`^${type}\\s*[:#]\\s*\\S+`, 'i').test(row.line));
      if (bare) add(`${type} Number`, bare.line.replace(new RegExp(`^${type}\\s*[:#]\\s*`, 'i'), ''), bare);
      labeled(type === 'Invoice' ? 'Invoice Date' : 'Date', ['Invoice Date', 'Receipt Date', 'Date Issued', 'Issue Date', 'Date']);
      labeled('Due Date', ['Due Date', 'Payment Due', 'Pay by']);
      const amounts: [string, string[]][] = [
        ['Total', ['Grand Total', 'Total Amount Due', 'Total Amount', 'Total Due', 'Amount Due', 'Balance Due', 'Net Payable', 'Total']],
        ['Subtotal', ['Subtotal', 'Sub Total', 'Sub-total']],
        ['Tax', ['Tax', 'Tax Amount', 'GST', 'VAT', 'Sales Tax']], ['Discount', ['Discount', 'Discount Amount']],
        ['Amount Paid', ['Amount Paid', 'Paid Amount', 'Total Paid']],
      ];
      for (const [label, aliases] of amounts) {
        for (const alias of aliases) canonical.set(alias.toLowerCase(), label);
        // Alias order deliberately prioritizes final payable/grand total over plain total.
        for (const alias of aliases) {
          const pattern = new RegExp(`^${escape(alias)}(?:[ \\t]*\\([^)]*\\))?(?:[ \\t]*[:=][ \\t]*|[ \\t]+|$)(.*)$`, 'i');
          let found = false;
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const match = row.line.match(pattern);
            if (!match) continue;
            const raw = match[1].trim() || (rows[index + 1]?.page === row.page ? rows[index + 1].line : '');
            const rate = raw.match(/^(\d+(?:\.\d+)?\s*%)\s+(.+)$/);
            const value = rate ? rate[2] : raw;
            if (label === 'Tax' && /^\d+(?:\.\d+)?\s*%$/.test(raw)) {
              add('Tax Rate', raw, { ...row, line: match[1].trim() ? row.line : `${row.line}\n${raw}` });
              found = true;
              break;
            }
            if (!AMOUNT.test(value)) continue;
            const source = { ...row, line: match[1].trim() ? row.line : `${row.line}\n${raw}` };
            add(label, value, source);
            if (rate && label === 'Tax') add('Tax Rate', rate[1], source);
            const printedRate = row.line.match(/\((\d+(?:\.\d+)?\s*%)\)/);
            if (printedRate && label === 'Tax') add('Tax Rate', printedRate[1], source);
            found = true;
            break;
          }
          if (found) break;
        }
      }
      // Two-column FROM / TO blocks: retain the actual values without guessing OCR repairs.
      const blockIndex = rows.findIndex(row => /^(?:from|vendor|seller)\s*\t+\s*(?:to|bill to|buyer|customer)\s*$/i.test(row.line));
      if (blockIndex >= 0 && rows[blockIndex + 1]?.page === rows[blockIndex].page) {
        const values = rows[blockIndex + 1].line.split(/\t+/);
        if (values.length === 2) {
          partyRows.add(blockIndex + 1);
          const source = { ...rows[blockIndex], line: `${rows[blockIndex].line}\n${rows[blockIndex + 1].line}` };
          add('Vendor / Seller', values[0], source); add('Bill To', values[1], source);
        }
      }
      if (!fields.some(field => field.label === 'Vendor / Seller')) {
        const heading = rows.slice(0, 4).find(row => /\b(?:ltd\.?|limited|inc\.?|llc|technologies|solutions|corp\.?|store)\b/i.test(row.line) && !/[:\t]|customer|bill to/i.test(row.line));
        if (heading) add('Vendor / Seller', heading.line, heading, 0.65);
      }
      if (type === 'Receipt') {
        const store = fields.find(field => field.label === 'Vendor / Seller');
        if (store) fields.push({ ...store, label: 'Store' });
        else if (rows[0] && !/^receipt\b/i.test(rows[0].line) && !/:|\d/.test(rows[0].line)) add('Store', rows[0].line, rows[0], 0.6);
      }
      let columns: string[] = [];
      for (const row of rows) {
        let cells = row.line.split(/\t+|\s{2,}|\s*\|\s*/).map(cell => cell.trim()).filter(Boolean);
        if (/\b(?:description|product|item|service)\b/i.test(row.line) && /\b(?:qty|quantity)\b/i.test(row.line) && /\b(?:price|rate)\b/i.test(row.line) && /\b(?:amount|total)\b/i.test(row.line)) {
          columns = cells.length >= 4 ? cells : ['Description', 'Quantity', 'Unit Price', 'Amount'];
          continue;
        }
        if (!columns.length || /^(?:sub[ -]?total|grand total|total|tax|gst|vat|discount|amount due)\b/i.test(row.line)) continue;
        const descIndex = columns.findIndex(cell => /description|product|item|service/i.test(cell));
        const qtyIndex = columns.findIndex(cell => /qty|quantity/i.test(cell));
        const priceIndex = columns.findIndex(cell => /price|rate/i.test(cell));
        const amountIndex = columns.findIndex(cell => /amount|total/i.test(cell));
        if (cells.length !== columns.length && descIndex === 0 && qtyIndex === 1 && priceIndex === 2 && amountIndex === 3) {
          const match = row.line.match(new RegExp(`^(.*?)\\s+(\\d+(?:\\.\\d+)?)\\s+(${MONEY_TOKEN})\\s+(${MONEY_TOKEN})$`, 'i'));
          if (match) cells = match.slice(1);
        }
        if (cells.length !== columns.length || [descIndex, qtyIndex, priceIndex, amountIndex].includes(-1)) continue;
        if (!/^\d+(?:\.\d+)?$/.test(cells[qtyIndex]) || !AMOUNT.test(cells[priceIndex]) || !AMOUNT.test(cells[amountIndex])) continue;
        items.push({ id: `li-${items.length + 1}`, description: cells[descIndex], quantity: cells[qtyIndex], unitPrice: cells[priceIndex], amount: cells[amountIndex], serviceUsage: '', page: row.page, snippet: row.line });
      }
    }
    if (type === 'Form') {
      labeled('Name', ['Full Name', 'Applicant Name', 'Name']);
      labeled('Date of Birth', ['Date of Birth', 'DOB', 'Birth Date']);
    }
    // No cap: keep every explicit key/value pair, including fields outside the common schema.
    for (let index = 0; index < rows.length; index++) {
      if (partyRows.has(index)) continue;
      const row = rows[index];
      const cells = row.line.split(/\t+/).map(cell => cell.trim());
      if (cells.length === 2 && /^[\p{L}][\p{L}\p{N} ()/#.%&-]{1,60}$/u.test(cells[0]) && validValue(canonical.get(cells[0].toLowerCase()) || cells[0], cells[1]) && !fields.some(field => field.snippet === row.line)) {
        let label = canonical.get(cells[0].toLowerCase()) || cells[0];
        if (['Total', 'Subtotal', 'Tax', 'Discount', 'Amount Paid'].includes(label) && !AMOUNT.test(cells[1])) {
          if (/^gst$/i.test(cells[0]) && /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{10,20}$/.test(cells[1])) label = 'GST Number';
          else if (label === 'Tax' && /^\d+(?:\.\d+)?\s*%$/.test(cells[1])) label = 'Tax Rate';
          else continue;
        }
        let value = cells[1]; let snippet = row.line;
        if (!AMOUNT.test(value)) {
          for (let following = index + 1; following < rows.length; following++) {
            const continuation = rows[following];
            if (continuation.page !== row.page || heading.test(continuation.line) || /\t|:/.test(continuation.line) || AMOUNT.test(continuation.line) || !/[\p{L}]/u.test(continuation.line)) break;
            value += '\n' + continuation.line; snippet += '\n' + continuation.line;
          }
        }
        add(label, value, { ...row, line: snippet }, 0.85);
      }
      for (const part of row.line.split(/\t+(?=[^:\t]{1,50}:)/)) {
        const match = part.match(/^([\p{L}][\p{L}\p{N} ()/#.-]{1,50}):[ \t]*(\S.*)$/u);
        if (match && !fields.some(field => field.snippet === row.line)) add(match[1].trim(), match[2], row, 0.8);
      }
    }
    return { extractedFields: fields, lineItems: items };
  }
}
