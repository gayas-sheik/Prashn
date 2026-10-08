import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DocumentRepository } from '../repositories/document.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { getStorageProvider } from '../storage/storage.factory';
import { Document, DocumentType, DocumentStatus } from '../types';
import { DocumentProcessor } from '../processing/processor';

const docRepo = new DocumentRepository();
const activityRepo = new ActivityRepository();
const storage = getStorageProvider();
const processor = new DocumentProcessor();

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getDocuments = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const docs = await docRepo.findAllByUserId(userId);
    res.json({ documents: docs });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDocumentById = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const doc = await docRepo.findByIdAndUserId(id, userId);
    
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ document: doc });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    
    const doc = await docRepo.findByIdAndUserId(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    await storage.deleteFile(doc.storageKey);
    await docRepo.deleteByIdAndUserId(id, userId);
    
    // Log activity
    await activityRepo.createEvent({
      id: uuidv4(),
      userId,
      timestamp: new Date().toISOString(),
      event: 'Document Deleted',
      documentName: doc.originalFileName,
      documentId: doc.id,
      actor: req.user!.email,
      status: 'Success',
      details: 'Document was deleted permanently.',
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadSingleDocument = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const storageKey = await storage.saveFile(file.path, file.originalname, file.mimetype);
    
    const doc: Document = {
      id: `DOC-${Math.floor(10000 + Math.random() * 90000)}`, // Simulate DOC-12345 format
      userId,
      fileName: file.originalname,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      formattedSize: formatBytes(file.size),
      storageKey,
      documentType: 'Unknown',
      status: 'Uploaded',
      uploadDate: new Date().toISOString(),
      uploaderName: req.user!.email,
      pagesCount: 1, // Will be updated by processor
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await docRepo.createDocument(doc);
    
    // Log activity
    await activityRepo.createEvent({
      id: uuidv4(),
      userId,
      timestamp: new Date().toISOString(),
      event: 'Document Uploaded',
      documentName: doc.originalFileName,
      documentId: doc.id,
      actor: req.user!.email,
      status: 'Success',
      details: 'Document uploaded successfully and queued for processing.',
      createdAt: new Date().toISOString()
    });
    
    processor.triggerPipeline(doc.id, userId);
    
    res.status(201).json({ document: doc });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadMultipleDocuments = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedDocs: Document[] = [];
    
    for (const file of files) {
      const storageKey = await storage.saveFile(file.path, file.originalname, file.mimetype);
      
      const doc: Document = {
        id: `DOC-${Math.floor(10000 + Math.random() * 90000)}`,
        userId,
        fileName: file.originalname,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        formattedSize: formatBytes(file.size),
        storageKey,
        documentType: 'Unknown',
        status: 'Uploaded',
        uploadDate: new Date().toISOString(),
        uploaderName: req.user!.email,
        pagesCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await docRepo.createDocument(doc);
      uploadedDocs.push(doc);
      
      await activityRepo.createEvent({
        id: uuidv4(),
        userId,
        timestamp: new Date().toISOString(),
        event: 'Document Uploaded',
        documentName: doc.originalFileName,
        documentId: doc.id,
        actor: req.user!.email,
        status: 'Success',
        details: 'Document uploaded successfully and queued for processing.',
        createdAt: new Date().toISOString()
      });
      
      processor.triggerPipeline(doc.id, userId);
    }
    
    res.status(201).json({ documents: uploadedDocs });
  } catch (error) {
    console.error('Error uploading documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const retryDocument = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    
    const doc = await docRepo.findByIdAndUserId(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Allow retrying ANY document to re-run extraction
    
    // Log activity
    await activityRepo.createEvent({
      id: uuidv4(),
      userId,
      timestamp: new Date().toISOString(),
      event: 'Retry Initiated',
      documentName: doc.originalFileName,
      documentId: doc.id,
      actor: req.user!.email,
      status: 'Success',
      details: 'User initiated document retry.',
      createdAt: new Date().toISOString()
    });

    processor.triggerPipeline(doc.id, userId);
    
    res.json({ success: true, message: 'Retry initiated' });
  } catch (error) {
    console.error('Error retrying document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const downloadDocumentFile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    
    const doc = await docRepo.findByIdAndUserId(id, userId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const filePath = await storage.getFileUrl(doc.storageKey);
    res.download(filePath, doc.originalFileName || doc.fileName);
  } catch (error) {
    console.error('Error downloading document file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
