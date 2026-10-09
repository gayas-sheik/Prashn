#!/usr/bin/env bash
# Run only after the application startup check succeeds.
set -euo pipefail
: "${AWS_REGION:?}" "${STACK_NAME:?}" "${LOGICAL_RESOURCE:?}"
export AWS_RETRY_MODE=standard AWS_MAX_ATTEMPTS=6

state=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].StackStatus' --output text --region "$AWS_REGION")
if [[ "$state" != CREATE_IN_PROGRESS && "$state" != UPDATE_IN_PROGRESS ]]; then
  echo "CloudFormation readiness signal skipped: stack is $state."
  exit 0
fi

# Auto Scaling readiness signals identify a member instance, not its hostname.
# Use IMDSv2, which is required by the launch template; never log its token.
token=$(curl --noproxy '*' -fsS --connect-timeout 2 --max-time 5 --retry 3 --retry-delay 1 \
  -X PUT http://169.254.169.254/latest/api/token \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
instance_id=$(curl --noproxy '*' -fsS --connect-timeout 2 --max-time 5 --retry 3 --retry-delay 1 \
  -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)
[[ "$instance_id" =~ ^i-([0-9a-f]{8}|[0-9a-f]{17})$ ]] || { echo 'Cannot send readiness signal: invalid instance ID.' >&2; exit 1; }

echo "Sending CloudFormation readiness signal: $LOGICAL_RESOURCE / $instance_id."
aws cloudformation signal-resource --stack-name "$STACK_NAME" --logical-resource-id "$LOGICAL_RESOURCE" \
  --unique-id "$instance_id" --status SUCCESS --region "$AWS_REGION"
echo "CloudFormation readiness API accepted the signal for $instance_id."
