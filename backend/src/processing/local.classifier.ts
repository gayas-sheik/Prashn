import { DocumentClassifier, ClassificationResult } from './classifier.interface';
import { DocumentType } from '../types';

export class LocalClassifier implements DocumentClassifier {
  classify(text: string): ClassificationResult {
    const lowerText = text.toLowerCase();
    
    let scores = {
      invoice: 0,
      receipt: 0,
      form: 0,
    };
    
    // Invoice indicators
    if (lowerText.includes('invoice')) scores.invoice += 10;
    if (lowerText.includes('invoice number')) scores.invoice += 5;
    if (lowerText.includes('bill to')) scores.invoice += 3;
    if (lowerText.includes('due date')) scores.invoice += 3;
    if (lowerText.includes('subtotal')) {
      scores.invoice += 2;
      scores.receipt += 2;
    }
    
    // Receipt indicators
    if (lowerText.includes('receipt')) scores.receipt += 10;
    if (lowerText.includes('store')) scores.receipt += 3;
    if (lowerText.includes('cash')) scores.receipt += 3;
    if (lowerText.includes('change')) scores.receipt += 3;
    
    // Form indicators
    if (lowerText.includes('name')) scores.form += 2;
    if (lowerText.includes('address')) scores.form += 2;
    if (lowerText.includes('signature')) scores.form += 5;
    if (lowerText.includes('date of birth') || lowerText.includes('dob')) scores.form += 5;

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
