import { config } from '../config/env';
import { DocumentRepository as LocalRepository } from './sqlite/document.repository';
import { DynamoDocumentRepository } from './dynamodb.repositories';

export const DocumentRepository = config.databaseMode === 'dynamodb' ? DynamoDocumentRepository : LocalRepository;
