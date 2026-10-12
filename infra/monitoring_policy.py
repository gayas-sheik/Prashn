"""Reviewed read-only monitoring policy; no clients or AWS calls."""
from copy import deepcopy


def monitoring_policy(bindings):
    region = {'StringEquals': {'aws:RequestedRegion': bindings['region']}}
    return {'Version': '2012-10-17', 'Statement': [
        {'Sid': 'PrashnMonitoringStack', 'Effect': 'Allow', 'Action': ['cloudformation:DescribeStackResources'], 'Resource': bindings['stackArn']},
        {'Sid': 'PrashnMonitoringFleet', 'Effect': 'Allow', 'Action': ['autoscaling:DescribeAutoScalingGroups'], 'Resource': '*', 'Condition': region},
        {'Sid': 'PrashnMonitoringMetrics', 'Effect': 'Allow', 'Action': ['cloudwatch:GetMetricData'], 'Resource': '*', 'Condition': region},
        {'Sid': 'PrashnMonitoringAlarms', 'Effect': 'Allow', 'Action': ['cloudwatch:DescribeAlarms'], 'Resource': bindings['monitorAlarmArns']},
        {'Sid': 'PrashnMonitoringQueues', 'Effect': 'Allow', 'Action': ['sqs:GetQueueAttributes'], 'Resource': bindings['queueArns']},
        {'Sid': 'PrashnMonitoringEvents', 'Effect': 'Allow', 'Action': ['logs:FilterLogEvents'], 'Resource': bindings['logArn'] + ':*'},
    ]}


def with_monitoring_boundary(base, policy):
    result = deepcopy(base)
    result['Statement'] += deepcopy(policy['Statement'])
    return result
