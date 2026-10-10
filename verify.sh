#!/usr/bin/env bash
# Verification only: no deployment, installs or stack deletion.
# Explicit --resume-for-test requires --pause-after under demo-only cost policy.
set -euo pipefail
cd "$(dirname "$0")"
command -v aws >/dev/null || { echo 'Run this in prashn-admin CloudShell with AWS CLI available.'; exit 2; }
command -v python3 >/dev/null || { echo 'Python 3 is required.'; exit 2; }
: "${EXPECTED_ACCOUNT:?Set EXPECTED_ACCOUNT to your 12-digit AWS account ID}"
exec python3 infra/verify_deployment.py --account "$EXPECTED_ACCOUNT" \
  --stack "${PRASHN_STACK:-prashn-cloud-v2}" --region "${AWS_REGION:-us-east-1}" "$@"
