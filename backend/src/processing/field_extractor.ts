import { DocumentType, ExtractedField, LineItem } from '../types';

export class StructuredFieldExtractor {
  extractFields(text: string, type: DocumentType): { extractedFields: ExtractedField[], lineItems?: LineItem[] } {
    const fields: ExtractedField[] = [];
    const lines = text.split('\n');
    const lowerText = text.toLowerCase();

    if (type === 'Invoice') {
      // Very rudimentary local extraction
      const invoiceNumberMatch = text.match(/invoice(?:\s+number|#)?[:\s]+([A-Z0-9-]+)/i);
      if (invoiceNumberMatch) fields.push({ label: 'Invoice Number', value: invoiceNumberMatch[1], confidence: 0.95 });

      const dateMatch = text.match(/date[:\s]+(\d{2,4}[-/]\d{1,2}[-/]\d{1,4})/i);
      if (dateMatch) fields.push({ label: 'Date', value: dateMatch[1], confidence: 0.90 });

      const totalMatch = text.match(/total[:\s]*\$?([\d,]+\.\d{2})/i);
      if (totalMatch) fields.push({ label: 'Total', value: `$${totalMatch[1]}`, confidence: 0.85 });

      const taxMatch = text.match(/tax[:\s]*\$?([\d,]+\.\d{2})/i);
      if (taxMatch) fields.push({ label: 'Tax', value: `$${taxMatch[1]}`, confidence: 0.80 });
      
      const subtotalMatch = text.match(/subtotal[:\s]*\$?([\d,]+\.\d{2})/i);
      if (subtotalMatch) fields.push({ label: 'Subtotal', value: `$${subtotalMatch[1]}`, confidence: 0.80 });

      // Vendor fallback
      const vendorMatch = lines.find(l => l.trim().length > 3 && !l.toLowerCase().includes('invoice') && !l.includes(':'));
      if (vendorMatch) fields.push({ label: 'Vendor', value: vendorMatch.trim(), confidence: 0.70 });
    }
    else if (type === 'Receipt') {
      const totalMatch = text.match(/total[:\s]*\$?([\d,]+\.\d{2})/i);
      if (totalMatch) fields.push({ label: 'Total', value: `$${totalMatch[1]}`, confidence: 0.85 });
      
      const dateMatch = text.match(/date[:\s]+(\d{2,4}[-/]\d{1,2}[-/]\d{1,4})/i);
      if (dateMatch) fields.push({ label: 'Date', value: dateMatch[1], confidence: 0.90 });

      const storeMatch = lines[0] ? lines[0].trim() : 'Unknown Store';
      fields.push({ label: 'Store', value: storeMatch, confidence: 0.60 });
    }
    else if (type === 'Form') {
      const nameMatch = text.match(/name[:\s]+([A-Za-z\s]+)/i);
      if (nameMatch) fields.push({ label: 'Name', value: nameMatch[1].trim(), confidence: 0.85 });
      
      const dobMatch = text.match(/(?:date of birth|dob)[:\s]+(\d{2,4}[-/]\d{1,2}[-/]\d{1,4})/i);
      if (dobMatch) fields.push({ label: 'Date of Birth', value: dobMatch[1], confidence: 0.90 });
    }

    return { extractedFields: fields };
  }
}
