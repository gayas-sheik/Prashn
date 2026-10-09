import { config } from '../config/env';
import { ActivityRepository as LocalRepository } from './sqlite/activity.repository';
import { DynamoActivityRepository } from './dynamodb.repositories';

export const ActivityRepository = config.databaseMode === 'dynamodb' ? DynamoActivityRepository : LocalRepository;
