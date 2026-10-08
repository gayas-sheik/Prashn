import { DocumentClassifier, ClassificationResult } from './classifier.interface';
import { DocumentType } from '../types';

export class LocalClassifier implements DocumentClassifier {
  classify(text: string): ClassificationResult {
    const lowerText = text.toLowerCase();
    const has = (phrase: string) => new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`).test(lowerText);
    
    let scores = {
      invoice: 0,
      receipt: 0,
      form: 0,
    };
    
    // Invoice indicators
    if (has('invoice')) scores.invoice += 10;
    if (has('invoice number')) scores.invoice += 5;
    if (has('bill to')) scores.invoice += 3;
    if (has('due date')) scores.invoice += 3;
    if (has('subtotal')) {
      scores.invoice += 2;
      scores.receipt += 2;
    }
    
    // Receipt indicators
    if (has('receipt')) scores.receipt += 10;
    if (has('store')) scores.receipt += 3;
    if (has('cash')) scores.receipt += 3;
    if (has('change')) scores.receipt += 3;
    
    // Form indicators
    if (has('name')) scores.form += 2;
    if (has('address')) scores.form += 2;
    if (has('signature')) scores.form += 5;
    if (has('date of birth') || has('dob')) scores.form += 5;
    if (/\b(?:agreement|contract)\b/.test(lowerText) && /\b(?:termination|parties|clause|hereby|effective date)\b/.test(lowerText) && scores.invoice < 10) return { type: 'Contract', confidence: 0.85 };

    let maxScore = 0;
    let predictedType: DocumentType = 'Unknown';
    
    if (scores.invoice > maxScore) { maxScore = scores.invoice; predictedType = 'Invoice'; }
    if (scores.receipt > maxScore) { maxScore = scores.receipt; predictedType = 'Receipt'; }
    if (scores.form > maxScore) { maxScore = scores.form; predictedType = 'Form'; }
    
    let confidence = 0.50; // default baseline
    if (maxScore > 15) confidence = 0.98;
    else if (maxScore > 10) confidence = 0.90;
    else if (maxScore > 5) confidence = 0.75;
    else if (maxScore === 0) confidence = 0.20;

    return { type: predictedType, confidence };
  }
}
