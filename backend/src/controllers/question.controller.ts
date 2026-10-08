import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { QuestionRepository } from '../repositories/question.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { QAMessage, QACitation } from '../types';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

const questionRepo = new QuestionRepository();
const docRepo = new DocumentRepository();

export const getConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    
    const doc = await docRepo.findByIdAndUserId(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    let messages = await questionRepo.findByDocumentIdAndUserId(id, userId);
    
    if (messages.length === 0) {
      const fieldSummary = doc.extractedFields && doc.extractedFields.length > 0
        ? `I have found **${doc.extractedFields.length} extracted fields** from this document: ${doc.extractedFields.map(f => f.label).join(', ')}.`
        : 'No structured fields have been extracted yet — the document may still be processing.';

      const initialMessage: QAMessage = {
        id: uuidv4(),
        documentId: id,
        userId,
        sender: 'assistant',
        text: `Hello! I'm ready to answer questions about **${doc.originalFileName}** (${doc.documentType}). ${fieldSummary}\n\nWhat would you like to know?`,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      await questionRepo.createMessage(initialMessage);
      messages = [initialMessage];
    }
    
    res.json({ conversation: messages });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const askQuestion = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const doc = await docRepo.findByIdAndUserId(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const userMsg: QAMessage = {
      id: uuidv4(),
      documentId: id,
      userId,
      sender: 'user',
      text: question,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    await questionRepo.createMessage(userMsg);
    
    const lower = question.toLowerCase();
    let answerText = '';
    let citations: QACitation[] = [];
    
    // Synonyms mapping for better natural language support
    const synonyms: Record<string, string[]> = {
      'price': ['cost', 'amount', 'total', 'unit price'],
      'total': ['amount', 'cost', 'sum', 'due', 'pay', 'paid'],
      'customer': ['client', 'buyer', 'bill to', 'billed to'],
      'vendor': ['seller', 'from', 'company', 'issued by', 'who'],
      'date': ['when', 'issued on', 'time'],
      'invoice number': ['id', 'reference', 'ref'],
      'item': ['product', 'service', 'bought', 'purchased'],
      'tax': ['vat', 'gst', 'tax amount'],
      'subtotal': ['sub total', 'before tax'],
      'address': ['location', 'where', 'street', 'city'],
      'phone': ['number', 'call', 'contact'],
      'discount': ['reduced', 'off', 'saved']
    };

    // Expand query with synonyms
    const queryWords = lower.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 2);
    let expandedKeywords = [...queryWords];
    for (const [key, syns] of Object.entries(synonyms)) {
      if (lower.includes(key) || syns.some(s => lower.includes(s))) {
        expandedKeywords.push(key);
        expandedKeywords.push(...syns);
      }
    }
    
    // Normalize keywords for scoring
    const stopWords = new Set(['what', 'is', 'the', 'this', 'document', 'tell', 'me', 'about', 'how', 'much', 'does', 'are', 'was', 'were', 'has', 'have', 'did', 'when', 'who', 'which', 'where', 'can', 'you', 'there']);
    const keywords = [...new Set(expandedKeywords)].filter(w => w.length > 2 && !stopWords.has(w));

    let bestMatch: { type: string, label: string, value: string, score: number, snippet: string } | null = null;

    // 1. Search Structured Fields
    if (doc.extractedFields) {
      for (const field of doc.extractedFields) {
        let score = 0;
        const fieldLower = field.label.toLowerCase();
        
        // Check keywords
        for (const k of keywords) {
          if (fieldLower.includes(k)) score += 3;
        }
        
        // Exact matching boost
        if (lower.includes(fieldLower)) score += 10;
        
        if (score > (bestMatch?.score || 0)) {
          bestMatch = { type: 'field', label: field.label, value: field.value, score, snippet: `${field.label}: ${field.value}` };
        }
      }
    }

    // 2. Search Tables / Line Items
    if (doc.lineItems) {
      for (const item of doc.lineItems) {
        let score = 0;
        const descLower = item.description.toLowerCase();
        
        for (const k of keywords) {
          if (descLower.includes(k)) score += 4; // Higher weight for item descriptions
        }
        
        // If question asks about quantity or price of this item
        if (score > 0) {
          let targetValue = `Quantity: ${item.quantity}, Price: ${item.unitPrice}, Amount: ${item.amount}`;
          let targetLabel = `Details for ${item.description}`;
          
          if (lower.includes('quantity') || lower.includes('how many')) {
            targetValue = item.quantity.toString();
            targetLabel = `Quantity of ${item.description}`;
            score += 5;
          } else if (lower.includes('price') || lower.includes('cost')) {
            targetValue = item.unitPrice;
            targetLabel = `Unit Price of ${item.description}`;
            score += 5;
          }
          
          if (score > (bestMatch?.score || 0)) {
            bestMatch = { type: 'table', label: targetLabel, value: targetValue, score, snippet: `${item.description} - ${targetValue}` };
          }
        }
      }
    }

    // 3. Search Full Text (Raw OCR)
    const textFilePath = path.join(config.processedDir, `${doc.id}.txt`);
    if (fs.existsSync(textFilePath)) {
      const rawText = fs.readFileSync(textFilePath, 'utf-8');
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
      
      for (const line of lines) {
        let score = 0;
        const lineLower = line.toLowerCase();
        
        for (const k of keywords) {
          if (lineLower.includes(k)) score += 2;
        }
        
        // Boost if it looks like a key-value pair in text
        if (score > 0 && line.includes(':')) {
          score += 1;
        }
        
        if (score > (bestMatch?.score || 0)) {
          bestMatch = { type: 'text', label: 'Document Text', value: line, score, snippet: line };
        }
      }
    }

    // --- Generate Response based on Best Match ---
    if (bestMatch && bestMatch.score > 3) {
      if (bestMatch.type === 'field') {
        answerText = `The ${bestMatch.label.toLowerCase()} is ${bestMatch.value}.`;
      } else if (bestMatch.type === 'table') {
        answerText = `Based on the document, the ${bestMatch.label.toLowerCase()} is ${bestMatch.value}.`;
      } else {
        answerText = `Based on the document content: "${bestMatch.value}"`;
      }
      
      citations.push({
        id: uuidv4(),
        source: doc.originalFileName,
        page: 1,
        section: bestMatch.type === 'field' ? `Extracted Field: ${bestMatch.label}` : (bestMatch.type === 'table' ? 'Line Items Table' : 'Raw Document Text'),
        snippet: bestMatch.snippet,
        confidence: Math.min(99, bestMatch.score * 10)
      });
    } else {
      if (doc.status !== 'Completed') {
        answerText = `This document is currently **${doc.status}** and has not finished processing yet. Please try again once processing is complete.`;
      } else {
        answerText = "I couldn't find that information in this document.";
      }
    }

    const assistantMsg: QAMessage = {
      id: uuidv4(),
      documentId: id,
      userId,
      sender: 'assistant',
      text: answerText,
      timestamp: new Date().toISOString(),
      citations: citations.length > 0 ? citations : undefined,
      createdAt: new Date().toISOString()
    };
    await questionRepo.createMessage(assistantMsg);
    
    res.status(201).json({ message: assistantMsg });
  } catch (error) {
    console.error('Error asking question:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
