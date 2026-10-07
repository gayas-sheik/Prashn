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
      const initialMessage: QAMessage = {
        id: uuidv4(),
        documentId: id,
        userId,
        sender: 'assistant',
        text: 'Hello! I am ready to answer any questions grounded in this document. What would you like to verify?',
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
    
    // Attempt to answer using extracted fields and text
    const lower = question.toLowerCase();
    let answerText = "I couldn't find that information in this document.";
    let citations: QACitation[] = [];

    // Check structured fields first
    if (doc.extractedFields && doc.extractedFields.length > 0) {
      if (lower.includes('total') || lower.includes('amount') || lower.includes('cost')) {
        const field = doc.extractedFields.find(f => f.label.toLowerCase().includes('total'));
        if (field) answerText = `The total amount is **${field.value}**.`;
      } else if (lower.includes('vendor') || lower.includes('who') || lower.includes('from')) {
        const field = doc.extractedFields.find(f => f.label.toLowerCase().includes('vendor') || f.label.toLowerCase().includes('store') || f.label.toLowerCase().includes('name'));
        if (field) answerText = `The vendor is **${field.value}**.`;
      } else if (lower.includes('tax')) {
        const field = doc.extractedFields.find(f => f.label.toLowerCase().includes('tax'));
        if (field) answerText = `The tax is **${field.value}**.`;
      } else if (lower.includes('date')) {
        const field = doc.extractedFields.find(f => f.label.toLowerCase().includes('date'));
        if (field) answerText = `The date is **${field.value}**.`;
      } else if (lower.includes('number')) {
        const field = doc.extractedFields.find(f => f.label.toLowerCase().includes('number'));
        if (field) answerText = `The document number is **${field.value}**.`;
      } else if (lower.includes('summarize')) {
        answerText = `This is a **${doc.documentType}**. I found ${doc.extractedFields.length} key fields.`;
      }
    }
    
    // If we still don't have a good answer, let's search raw text if possible
    if (answerText === "I couldn't find that information in this document." && fs.existsSync(path.join(config.processedDir, `${doc.id}.txt`))) {
      const rawText = fs.readFileSync(path.join(config.processedDir, `${doc.id}.txt`), 'utf-8');
      
      // Extremely basic local search
      const lines = rawText.split('\n');
      const keywords = lower.split(' ').filter((w: string) => w.length > 3 && !['what','is','the','this','document','tell','me'].includes(w));
      
      for (const line of lines) {
        if (keywords.some((k: string) => line.toLowerCase().includes(k))) {
          answerText = `I found a related mention: "${line.trim()}"`;
          citations.push({
            id: uuidv4(),
            source: doc.originalFileName,
            page: 1,
            section: 'Extracted Text',
            snippet: line.trim(),
            confidence: 50
          });
          break;
        }
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
