import { QAMessage } from '../types';

// Rewrite complete, common question forms. Extra qualifiers remain significant.
export function canonicalQuestion(question: string): string {
  const query = question.toLowerCase().replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim();
  const patterns: [RegExp, string][] = [
    [/^who (?:supplied|issued|sent) (?:this |the |an )?(?:invoice|document)$/, 'what is the vendor'],
    [/^which store (?:issued|provided) (?:this |the )?receipt$/, 'what is the store'],
    [/^when is (?:the )?payment due$/, 'what is the due date'],
    [/^how much (?:do|did) (?:i|we) owe$/, 'what is the total'],
    [/^what is (?:the )?amount before taxes$/, 'what is the subtotal'],
    [/^how much (?:tax|vat|gst) was charged$/, 'what is the tax amount'],
    [/^what (?:percentage|percent) is (?:the )?(?:tax|vat|gst)$/, 'what is the tax rate'],
    [/^how much did (?:the customer|they|i|we) pay$/, 'how much was paid'],
    [/^how did (?:the customer|they|i|we) pay$/, 'what is the payment method'],
    [/^how much change was (?:returned|given)$/, 'what is the change'],
    [/^who is (?:the )?applicant$/, 'what is the name'],
    [/^when (?:was|were) (?:the applicant|applicant) born$/, 'what is the date of birth'],
    [/^what is (?:the )?(?:submission|application) date$/, 'what is the date'],
    [/^which language (?:does the applicant|do they) prefer$/, 'what is the preferred language'],
    [/^where is (?:the )?destination$/, 'what is the destination'],
    [/^when was (?:it|the shipment) dispatched$/, 'what is the dispatch date'],
    [/^what (?:notice is required for|is the notice for) termination$/, 'termination notice'],
    [/^what is (?:the )?delivery time$/, 'delivery'],
  ];
  for (const [pattern, replacement] of patterns) if (pattern.test(query)) return replacement;
  const quantity = query.match(/^how many (.+?) did (?:we|i|they|the customer) (?:buy|purchase)$/);
  if (quantity) return 'how many ' + quantity[1];
  const price = query.match(/^what (?:does|did) (?:one|a|an) (.+?) cost$/);
  if (price) return 'what is the unit price of ' + price[1];
  return question;
}

// Context can select an explicit source page or party; it never supplies answer facts.
// Only the immediately preceding, successfully cited turn is eligible.
export function resolveDocumentQuestion(question: string, history: QAMessage[]): string | null {
  let previous: { question: string; sections: string[]; pages: number[]; sourceCount: number } | undefined;
  const resolve = (text: string): string | null => {
    const query = text.trim().replace(/[?!.]+$/g, '').toLowerCase();
    const pageOnly = query.match(/^(?:and |what about |how about )?(?:(?:on|from|in) )?page (\d+)$/);
    if (pageOnly) return previous ? previous.question.replace(/\b(?:(?:on|from|in) )?page\s+\d+\b/gi, '').trim() + ' on page ' + pageOnly[1] : null;
    if (/\b(?:their|its|they)\b/.test(query) && !/^how (?:much|did)\b.*\bpay\b/.test(query) && !/^which language do they prefer$/.test(query)) {
      if (!previous || previous.pages.length !== 1 || previous.sourceCount !== 1) return null;
      const sections = new Set(previous.sections);
      const party = sections.size === 1 && sections.has('Vendor / Seller') ? 'vendor' : sections.size === 1 && sections.has('Bill To') ? 'customer' : sections.size === 1 && sections.has('Name') ? 'applicant' : '';
      const explicitAttribute = /^and (?:its|their) (?:invoice|receipt) number$/.test(query);
      if (!party && !explicitAttribute) return null;
      let resolved = query.replace(/^and /, '').replace(/\b(?:their|its)\b/g, party).replace(/\bthey\b/g, party);
      if (!/\bpage\s+\d+\b/.test(resolved) && previous.pages.length === 1) resolved += ' on page ' + previous.pages[0];
      return resolved.trim();
    }
    return text;
  };
  for (let index = 0; index < history.length - 1; index++) {
    const user = history[index], assistant = history[index + 1];
    if (user.sender !== 'user' || assistant.sender !== 'assistant') continue;
    const resolved = resolve(user.text);
    previous = resolved && assistant.citations?.length ? { question: resolved, sections: [...new Set(assistant.citations.map(c => c.section))], pages: [...new Set(assistant.citations.map(c => c.page))], sourceCount: assistant.citations.length } : undefined;
  }
  return resolve(question);
}
