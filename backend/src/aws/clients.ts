import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { config } from '../config/env';

// The SDK uses the workload role in AWS. No application access keys are stored.
const options = { region: config.awsRegion, endpoint: config.awsEndpoint, maxAttempts: 3 };
export const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient(options), {
  marshallOptions: { removeUndefinedValues: true },
});
export const s3 = new S3Client({ ...options, forcePathStyle: !!config.awsEndpoint });
export const sqs = new SQSClient(options);
