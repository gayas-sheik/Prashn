# Administrator monitoring

The `/monitoring` page reads the existing stack's Auto Scaling state, SQS counts, CloudWatch metrics/alarms, and selected operational error events through `/api/monitoring`. It does not create infrastructure, start fleets, modify alarms, receive queue messages, or change scaling settings. The implementation is prepared locally; AWS activation and a rendered live-data check are still required.

## What is displayed

- API and worker instance counts, desired/min/max capacity, lifecycle state and Auto Scaling health. Instance health is not a separate worker job/readiness test.
- Processing and dead-letter queue available, in-flight and delayed message counts, explicitly approximate.
- API request/5xx counts and current-instance memory metrics, using five-minute CloudWatch samples from the past hour. A missing series is shown as missing data, not zero. Every chart shows the latest sample timestamp; incomplete responses are labelled Partial data.
- The stack's configured queue-backlog, queue-idle, dead-letter and API-error alarms, with actual OK/ALARM/INSUFFICIENT_DATA states and transition times.
- Selected structured failures and HTTP 5xx events from the application log group over the past 15 minutes. The scan is bounded to two pages per filter and 20 displayed events. An incomplete scan is identified. Raw log messages, document IDs, user IDs, document contents, credentials, SDK exception text and signed URLs are not returned.

The backend coalesces requests and caches each collected snapshot for 60 seconds. The UI refreshes every minute and shows the collection timestamp. The manual Refresh action requests the latest available cached snapshot; it does not bypass the cache. AWS calls have bounded request timeouts. Each section can report unavailable independently; an absent resource or denied read is never displayed as a healthy fleet or empty queue.

Local mode displays Cloud monitoring unavailable. While demo compute is paused, the same application API that serves monitoring is unavailable; the page cannot fetch live AWS data until API readiness returns. No additional always-on service is introduced by this feature. CloudWatch read calls can incur service usage charges.

## Access and deployment

Registration continues to create ordinary `user` accounts. Monitoring middleware verifies the signed session and re-reads the user's current database profile on every request. Only `role: admin` can read monitoring, even if an old JWT claims administrator privileges. Desktop/mobile navigation hides the link for ordinary users, and direct URLs show an administrator-access message. Existing document APIs remain scoped to the document owner; administrator monitoring is not a customer-document browser.

The bootstrap writes `MONITORING_STACK_NAME` from the existing stack name. The backend resolves IDs from that stack, checks fleet/queue/log bindings, and accepts no client-supplied resource names or AWS queries. Existing instance-role credentials are used; there are no AWS keys in frontend code.

Before activating the new code, use the existing IAM administrator CloudShell session to prepare the reviewed read policy and the one administrator account:

```bash
cd ~/Prashn-cloud
git pull --ff-only
python3 infra/setup_monitoring.py plan --account 683146427271 --admin-email '<registered-account-email>'
```

Two `--admin-email` options may be supplied as ordered fallbacks. Only the first registered, validated account is selected; missing accounts are not created or automatically replaced by another repository user. The helper reads only the email-to-user mapping and selected profile ID/email/role, not password hashes.

Review `.aws-build/monitoring-iam/read-policy.json`, `api-boundary.json`, and `previous-api-boundary.json`. The policy adds:

| Read | Scope |
| --- | --- |
| CloudFormation DescribeStackResources | Existing application stack ARN |
| Auto Scaling DescribeAutoScalingGroups | Region-restricted metadata read; backend selects only the two stack groups |
| CloudWatch GetMetricData | Region-restricted read; AWS requires Resource `*`, so backend pins namespaces/dimensions to this stack |
| CloudWatch DescribeAlarms | Four existing stack alarm ARNs |
| SQS GetQueueAttributes | Existing processing/DLQ ARNs |
| Logs FilterLogEvents | Existing application log group |

After reviewing the concrete files, apply:

```bash
python3 infra/setup_monitoring.py apply --account 683146427271 --admin-email '<registered-account-email>'
```

The helper rebuilds the plan and requires the exact `ENABLE MONITORING <account> <selected-user-id>` phrase. It adds only an API-role `monitoring-read` policy, augments only the existing API permission boundary, and conditionally promotes the selected existing account. It preserves the worker boundary, OIDC trust, deployment permissions and reviewed runtime permissions. It starts no compute and does not remove a permission boundary. Existing unreviewed policies/boundaries, changed boundary versions, unexpected profiles or five occupied policy versions stop setup. It does not delete old versions to make room.

IAM changes can remain if a later step fails; inspect the error before retrying. The prior boundary document is saved for operator review. Removing administrator access requires an operator to change that account's database role back to `user`; the next monitoring request is then denied without waiting for JWT expiry. No public role-changing endpoint exists. A future IAM setup refresh preserves the monitoring boundary only when the installed read policy exactly matches this reviewed contract.

Publish the tested source, wait for green CI, and start a new approved-delivery run on `aws-migration-preparation`. No infrastructure-template change or broader deployment permission is needed. Sign in again with the selected account after deployment so the UI refreshes its administrator role. Verify live metrics/queue/alarms/error states, and finish the demo with the existing pause helper.

## Validation status

Frontend build/lint, four frontend regression tests and 65 infrastructure/workflow tests passed locally. A clean backend build and 42 regression tests passed, including six monitoring tests covering current-profile authorization, demotion, pinned resources, missing data, partial failures, log privacy and bounded pagination. All 18 AWS adapter tests passed against the local emulator with the updated SDK dependencies. Setup tests also verify that a failed effective-boundary check cannot promote an account. Local Chrome checks verified administrator navigation, mobile navigation/layout, the truthful local-mode state, and normal-user direct-URL denial.

The four official AWS SDK clients are installed at exact versions with a generated lockfile. CI and live AWS monitoring verification are outstanding. No AWS IAM or account-role changes have been applied by this implementation pass.

Implementation references: [AWS CloudWatch SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/) and [CloudWatch Logs SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch-logs/).
