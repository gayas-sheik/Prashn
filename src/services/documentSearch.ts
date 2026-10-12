import type { DocumentItem } from '../types';

export function matchesDocumentSearch(document: DocumentItem, query: string): boolean {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return true;
  const values = [
    document.name, document.originalFileName, document.id, document.uploaderName,
    document.uploader, document.documentType, document.type, document.extractedSummary,
    ...(document.extractedFields || []).flatMap(field => [field.label, field.value, field.snippet]),
    ...(document.pages || []).map(page => page.text),
  ];
  return values.some(value => value?.toLocaleLowerCase().includes(term));
}
