import { config } from './config/env';
import { CloudDocumentWorker } from './processing/sqs.processor';
import { logError } from './observability/log';
if (config.processingMode !== 'sqs') throw new Error('The standalone worker requires AWS mode');
const worker = new CloudDocumentWorker();
process.on('SIGTERM', () => worker.stop());
process.on('SIGINT', () => worker.stop());
worker.run().catch(error => { logError('worker_fatal', error); process.exitCode = 1; });
