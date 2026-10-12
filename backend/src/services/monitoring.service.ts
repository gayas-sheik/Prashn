import { config } from '../config/env';

export interface MonitoringTransport {
  call(service: string, operation: string, input: any): Promise<any>;
}
export type Section<T> = { status: 'ok'; data: T } | { status: 'unavailable'; data: null; message: string };
export interface Fleet { kind: string; name: string; desired: number; min: number; max: number; instances: { id: string; state: string; healthy: boolean }[] }
export interface MonitoringMetric { id: string; label: string; unit: string; points: { time: string; value: number }[]; complete: boolean }

function requireValue(condition: unknown): asserts condition { if (!condition) throw new Error('Monitoring resource binding unavailable'); }
function safeError(error: any): string {
  return /AccessDenied|Unauthorized/.test(error?.name || '') ? 'Monitoring read permission is missing.' : 'AWS monitoring data is temporarily unavailable.';
}
async function section<T>(action: () => Promise<T>): Promise<Section<T>> {
  try { return { status: 'ok', data: await action() }; }
  catch (error) { return { status: 'unavailable', data: null, message: safeError(error) }; }
}
const failureEvents = new Set(['worker_fatal', 'dispatch_pending', 'deletion_cleanup_pending', 'dispatch_recovery_failed',
  'reconciliation_failed', 'worker_poll_failed', 'invalid_job', 'worker_heartbeat_failed', 'job_attempt_failed',
  'unpublished_result_cleanup_failed', 'staging_cleanup_failed', 'upload_rollback_failed']);
export function sanitizedLog(entry: { message?: string; timestamp?: number }) {
  try {
    const parsed = JSON.parse(entry.message || '');
    if (!failureEvents.has(parsed.event) && !(parsed.event === 'http_request' && Number.isInteger(parsed.status) && parsed.status >= 500 && parsed.status <= 599)) return null;
    if (!Number.isFinite(entry.timestamp)) return null;
    return { time: new Date(entry.timestamp!).toISOString(), event: parsed.event as string,
      status: parsed.event === 'http_request' ? parsed.status as number : null,
      category: /AccessDenied|Unauthorized/.test(parsed.errorType || '') ? 'Access denied' : /Throttl/.test(parsed.errorType || '') ? 'Throttled' : 'Operational error' };
  } catch { return null; }
}

export async function collectMonitoring(reader: MonitoringTransport, stack: string, queueUrl: string, now = new Date()) {
  const base = { enabled: true, mode: 'cloud', collectedAt: now.toISOString(), refreshSeconds: 60, windowMinutes: 60 };
  const [stackData, resourcesData] = await Promise.all([
    reader.call('cfn', 'stacks', { StackName: stack }), reader.call('cfn', 'resources', { StackName: stack }),
  ]);
  const outputs = Object.fromEntries((stackData.Stacks?.[0]?.Outputs || []).map((item: any) => [item.OutputKey, item.OutputValue]));
  const resources = Object.fromEntries((resourcesData.StackResources || []).map((item: any) => [item.LogicalResourceId, item.PhysicalResourceId]));
  requireValue(outputs.ApiGroup && outputs.WorkerGroup && resources.ApiGroup === outputs.ApiGroup && resources.WorkerGroup === outputs.WorkerGroup);
  requireValue(outputs.QueueUrl === queueUrl && resources.Jobs === queueUrl && resources.DeadLetters === outputs.DeadLetterQueue);
  requireValue(outputs.ApplicationLogGroup === resources.ApplicationLogs && resources.ApplicationLogs === `/prashn/${stack}/application`);
  const fleet = await section<Fleet[]>(async () => {
    const response = await reader.call('asg', 'groups', { AutoScalingGroupNames: [outputs.ApiGroup, outputs.WorkerGroup] });
    requireValue(response.AutoScalingGroups?.length === 2);
    return ['ApiGroup', 'WorkerGroup'].map((key, index) => {
      const group = response.AutoScalingGroups.find((item: any) => item.AutoScalingGroupName === outputs[key]);
      requireValue(group && [group.DesiredCapacity, group.MinSize, group.MaxSize].every(Number.isInteger));
      return { kind: index ? 'Worker' : 'API', name: outputs[key], desired: group.DesiredCapacity, min: group.MinSize, max: group.MaxSize,
        instances: (group.Instances || []).map((item: any) => ({ id: item.InstanceId, state: item.LifecycleState, healthy: item.HealthStatus === 'Healthy' && item.LifecycleState === 'InService' })) };
    });
  });
  const [queues, alarms, metrics, errors] = await Promise.all([
    section(async () => Promise.all(['QueueUrl', 'DeadLetterQueue'].map(async (key, index) => {
      const result = await reader.call('queue', 'attributes', { QueueUrl: outputs[key], AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed'] });
      const count = (name: string) => { const raw = result.Attributes?.[name]; requireValue(typeof raw === 'string' && /^\d+$/.test(raw)); return Number(raw); };
      return { kind: index ? 'Dead-letter queue' : 'Processing queue', visible: count('ApproximateNumberOfMessages'), inFlight: count('ApproximateNumberOfMessagesNotVisible'), delayed: count('ApproximateNumberOfMessagesDelayed') };
    }))),
    section(async () => {
      const names = ['QueueBacklog', 'QueueIdle', 'DeadLetterAlarm', 'ApiErrors'].map(key => resources[key]);
      requireValue(names.every(name => typeof name === 'string' && name.startsWith(stack + '-')));
      const result = await reader.call('metrics', 'alarms', { AlarmNames: names });
      const observed = result.MetricAlarms || [];
      requireValue(observed.length === names.length && observed.every((item: any) => names.includes(item.AlarmName)));
      return observed.map((item: any) => ({ name: item.AlarmName, state: ['OK', 'ALARM', 'INSUFFICIENT_DATA'].includes(item.StateValue) ? item.StateValue : 'UNKNOWN', changedAt: item.StateUpdatedTimestamp?.toISOString?.() || null }));
    }),
    section<MonitoringMetric[]>(async () => {
      const definitions: any[] = [{ id: 'requests', label: 'API requests', unit: 'Count', metric: 'Count', stat: 'Sum' },
        { id: 'errors', label: 'API 5xx responses', unit: 'Count', metric: '5xx', stat: 'Sum' }].map(item => ({ ...item,
          namespace: 'AWS/ApiGateway', dimensions: [{ Name: 'ApiId', Value: resources.HttpApi }, { Name: 'Stage', Value: '$default' }] }));
      requireValue(resources.HttpApi);
      if (fleet.status === 'ok') for (const group of fleet.data) for (const instance of group.instances.slice(0, 2)) {
        definitions.push({ id: `memory_${definitions.length}`, label: `${group.kind} memory · ${instance.id}`, unit: '%', metric: 'mem_used_percent', stat: 'Average', namespace: 'Prashn', dimensions: [{ Name: 'InstanceId', Value: instance.id }] });
      }
      const result = await reader.call('metrics', 'data', { StartTime: new Date(now.getTime() - 3600000), EndTime: now, ScanBy: 'TimestampAscending', MaxDatapoints: 1000,
        MetricDataQueries: definitions.map(item => ({ Id: item.id, ReturnData: true, MetricStat: { Period: 300, Stat: item.stat,
          Metric: { Namespace: item.namespace, MetricName: item.metric, Dimensions: item.dimensions } } })) });
      return definitions.map(item => {
        const data = result.MetricDataResults?.find((row: any) => row.Id === item.id);
        return { id: item.id, label: item.label, unit: item.unit, complete: data?.StatusCode === 'Complete' && !result.NextToken,
          points: (data?.Timestamps || []).flatMap((time: Date, index: number) => Number.isFinite(data.Values?.[index]) ? [{ time: time.toISOString(), value: data.Values[index] }] : []) };
      });
    }),
    section(async () => {
      const entries: any[] = []; let truncated = false;
      for (const filterPattern of ['{ $.errorType = * }', '{ $.event = "http_request" && $.status >= 500 }']) {
        let nextToken: string | undefined;
        for (let page = 0; page < 2; page++) {
          const response = await reader.call('logs', 'events', { logGroupName: resources.ApplicationLogs, startTime: now.getTime() - 900000, endTime: now.getTime(), filterPattern, limit: 100, ...(nextToken ? { nextToken } : {}) });
          entries.push(...(response.events || []).map(sanitizedLog).filter(Boolean));
          nextToken = response.nextToken;
          if (!nextToken) break;
        }
        truncated ||= !!nextToken;
      }
      return { windowMinutes: 15, truncated, entries: entries.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20) };
    }),
  ]);
  return { ...base, stackStatus: stackData.Stacks[0].StackStatus, fleet, queues, alarms, metrics, errors };
}

let cached: { expires: number; value: Promise<any> } | undefined;
export function getMonitoringSnapshot() {
  if (config.storageMode !== 's3' || !config.monitoringStack) return Promise.resolve({ enabled: false, mode: config.storageMode === 's3' ? 'cloud' : 'local', collectedAt: new Date().toISOString(),
    reason: config.storageMode === 's3' ? 'Cloud monitoring has not been configured.' : 'CloudWatch monitoring is available when this workspace runs in AWS.' });
  if (!cached || cached.expires <= Date.now()) cached = { expires: Date.now() + 60000, value: import('../aws/monitoring.clients').then(({ transport }) => collectMonitoring(transport, config.monitoringStack, config.queueUrl)).catch(error => {
    cached = undefined; throw Object.assign(new Error(safeError(error)), { status: 503 });
  }) };
  return cached.value;
}
