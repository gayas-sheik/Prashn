import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { QuestionRepository } from '../repositories/question.repository';
import { DocumentRepository } from '../repositories/document.repository';
import { QAMessage } from '../types';
import { getDocumentAnswerer, NOT_FOUND } from '../processing/document.answerer';
import { resolveDocumentQuestion } from '../processing/question.language';

const questions = new QuestionRepository();
const documents = new DocumentRepository();

export const getConversation = async (req: Request, res: Response) => {
  const doc = await documents.findByIdAndUserId(req.params.id as string, req.user!.userId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ conversation: await questions.findByDocumentIdAndUserId(doc.id, req.user!.userId) });
};

export const clearConversation = async (req: Request, res: Response) => {
  const doc = await documents.findByIdAndUserId(req.params.id as string, req.user!.userId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  await questions.clear(doc.id, req.user!.userId);
  res.json({ success: true });
};

export const askQuestion = async (req: Request, res: Response) => {
  const question = req.body?.question;
  if (typeof question !== 'string' || !question.trim() || question.length > 4000) return res.status(400).json({ error: 'Enter a question between 1 and 4000 characters' });
  const userId = req.user!.userId;
  const doc = await documents.findByIdAndUserId(req.params.id as string, userId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.status !== 'Completed') return res.status(409).json({ error: 'Wait until document processing completes before asking questions' });
  if (!doc.pages?.length) return res.status(409).json({ error: 'Reprocess this document to restore its page content for Q&A' });
  let answer;
  try {
    const history = await questions.findByDocumentIdAndUserId(doc.id, userId);
    const resolved = resolveDocumentQuestion(question.trim(), history);
    answer = resolved ? await getDocumentAnswerer().answer(resolved, doc) : { text: NOT_FOUND, citations: [] };
  }
  catch (error) {
    console.error('Q&A provider failed:', error);
    return res.status(503).json({ error: 'Local Q&A model unavailable. Check Ollama and the configured model, then retry.' });
  }
  const timestamp = new Date().toISOString();
  const userMessage: QAMessage = { id: randomUUID(), documentId: doc.id, userId, sender: 'user', text: question.trim(), timestamp, createdAt: timestamp };
  const assistantMessage: QAMessage = { id: randomUUID(), documentId: doc.id, userId, sender: 'assistant', text: answer.text, citations: answer.citations, timestamp, createdAt: timestamp };
  await questions.createPair(userMessage, assistantMessage);
  res.status(201).json({ message: assistantMessage });
};
