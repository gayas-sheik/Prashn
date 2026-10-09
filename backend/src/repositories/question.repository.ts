import { config } from '../config/env';
import { QuestionRepository as LocalRepository } from './sqlite/question.repository';
import { DynamoQuestionRepository } from './dynamodb.repositories';

export const QuestionRepository = config.databaseMode === 'dynamodb' ? DynamoQuestionRepository : LocalRepository;
