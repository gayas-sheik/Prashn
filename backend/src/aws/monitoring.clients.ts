import { CloudFormationClient, DescribeStacksCommand, DescribeStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { AutoScalingClient, DescribeAutoScalingGroupsCommand } from '@aws-sdk/client-auto-scaling';
import { CloudWatchClient, DescribeAlarmsCommand, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { sqs } from './clients';
import { config } from '../config/env';
import type { MonitoringTransport } from '../services/monitoring.service';

const options = { region: config.awsRegion, endpoint: config.awsEndpoint, maxAttempts: 1 };
const clients = { cfn: new CloudFormationClient(options), asg: new AutoScalingClient(options),
  metrics: new CloudWatchClient(options), logs: new CloudWatchLogsClient(options) };
export const transport: MonitoringTransport = {
  async call(service, operation, input) {
    const abortSignal = AbortSignal.timeout(8000);
    if (service === 'cfn') return clients.cfn.send(operation === 'stacks' ? new DescribeStacksCommand(input) : new DescribeStackResourcesCommand(input), { abortSignal });
    if (service === 'asg') return clients.asg.send(new DescribeAutoScalingGroupsCommand(input), { abortSignal });
    if (service === 'metrics' && operation === 'alarms') return clients.metrics.send(new DescribeAlarmsCommand(input), { abortSignal });
    if (service === 'metrics' && operation === 'data') return clients.metrics.send(new GetMetricDataCommand(input), { abortSignal });
    if (service === 'logs') return clients.logs.send(new FilterLogEventsCommand(input), { abortSignal });
    if (service === 'queue') return sqs.send(new GetQueueAttributesCommand(input), { abortSignal });
    throw new Error('Unsupported monitoring operation');
  },
};
