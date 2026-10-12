import { Document } from '../types';

export function processingTimeMetrics(documents: Document[]) {
  const seconds = documents.filter(doc => doc.status === 'Completed').flatMap(doc => {
    const match = /^(\d+(?:\.\d+)?)s$/.exec(doc.processingDuration || '');
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) ? [value] : [];
  });
  return {
    processingSamples: seconds.length,
    averageProcessingSeconds: seconds.length ? seconds.reduce((sum, value) => sum + value, 0) / seconds.length : null,
  };
}
