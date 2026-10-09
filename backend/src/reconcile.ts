import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3,dynamo,sqs } from './aws/clients';
import { config } from './config/env';
import { getCloudDocument } from './repositories/dynamodb.repositories';
import { removeOutput } from './storage/s3.storage';
import { CloudDocumentDispatcher } from './processing/sqs.processor';

export async function reconcileResults(apply=false) {
  if (config.storageMode!=='s3') throw new Error('Reconciliation requires AWS mode');
  let token:string|undefined; let candidates=0; let removed=0;
  const cutoff=Date.now()-24*60*60*1000;
  do {
    const page=await s3.send(new ListObjectsV2Command({Bucket:config.documentBucket,Prefix:'results/',ContinuationToken:token}));
    for (const object of page.Contents || []) {
      if (!object.Key || !object.LastModified || object.LastModified.getTime()>cutoff) continue;
      const id=object.Key.split('/')[1]; const doc=await getCloudDocument(id);
      if (doc?.resultKey===object.Key || (doc?.leaseUntil || 0)>Date.now()) continue;
      candidates++;
      if (apply) { await removeOutput(object.Key); removed++; }
    }
    token=page.NextContinuationToken;
  } while(token);
  const summary={mode:apply?'cleanup':'read-only',orphanCandidates:candidates,removed};
  console.log(JSON.stringify(summary));
  return summary;
}
if (require.main===module) reconcileResults(process.argv.includes('--apply')).then(async()=>{
  if(process.argv.includes('--apply')) await new CloudDocumentDispatcher().recover();
}).catch(error=>{console.error(JSON.stringify({event:'reconcile_failed',errorType:error.name}));process.exitCode=1;})
  .finally(()=>{s3.destroy();dynamo.destroy();sqs.destroy();});
