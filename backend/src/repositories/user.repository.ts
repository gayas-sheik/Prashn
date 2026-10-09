import { config } from '../config/env';
import { UserRepository as LocalRepository } from './sqlite/user.repository';
import { DynamoUserRepository } from './dynamodb.repositories';

export const UserRepository = config.databaseMode === 'dynamodb' ? DynamoUserRepository : LocalRepository;
