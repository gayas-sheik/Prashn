# Prashn CI and approved cloud delivery

CI checks code in GitHub. CD takes the checked version and updates the existing AWS application. A Git push runs CI automatically; it does not deploy or resume AWS servers. Delivery starts only when someone with repository write access chooses **Run workflow** and enters the confirmation.

This is continuous integration with manually approved continuous delivery. It is not automatic production deployment or an independent reviewer approval gate. Repository administrator access would be needed to configure protected environments and required reviewers.

## What exists and what is verified

| Item | Evidence / current status |
| --- | --- |
| Automatic CI | GitHub run [38072471640](https://github.com/gayas-sheik/Prashn/actions/runs/38072471640) passed for implementation commit `ba092929e5468897e769d3ba499fe9a5c57d5d76`, including frontend build/lint, backend regressions, local AWS-emulator checks, infrastructure checks, release packaging and artifact upload. The earlier run `38069908701` also passed, with packaging skipped before the push-packaging condition was added. |
| Artifact and release guards | Implemented; local tests cover archive privacy, checksum/revision verification, real shell packaging, release-only change sets, immutable OIDC trust and safe cleanup controls. These are not live AWS deployment tests. |
| GitHub delivery workflow | Implemented in `.github/workflows/delivery.yml`, published to default branch `main` by normal fast-forward, and inspected through GitHub's API as active. One-time IAM setup and a successful real delivery run remain pending. |
| AWS application | The earlier owner-run cloud acceptance passed with limitations and inspected both fleets at zero afterward. That evidence predates CI/CD and does not prove this workflow has deployed anything. |

## One-time setup in prashn-admin CloudShell

Use the IAM account, not root. Keep uploads stopped during setup and delivery. The original standalone Prashn-Server is separate and is not modified by this workflow.

Update the cloud checkout:

```bash
cd ~/Prashn-cloud
git switch aws-migration-preparation
git pull --ff-only
aws sts get-caller-identity --query Arn --output text --no-cli-pager
python3 infra/setup_github_oidc.py plan --account 683146427271
```

The last command performs read-only AWS checks and writes local policy files under ignored `.aws-build/ci-iam/`. It creates no AWS resources and starts no servers. Inspect them:

```bash
cat .aws-build/ci-iam/trust.json
cat .aws-build/ci-iam/permissions.json
cat .aws-build/ci-iam/api-boundary.json
cat .aws-build/ci-iam/worker-boundary.json
```

After reviewing the plan, apply the one-time IAM configuration:

```bash
python3 infra/setup_github_oidc.py apply --account 683146427271
```

It rebuilds the plan from current AWS state and asks you to type `683146427271`. It creates or safely reuses the GitHub identity provider, a `prashn-cloud-v2-github-release` role, and two permissions-boundary policies on the existing API/worker roles. It creates no access keys, app secrets, EC2 instances, application stack, or paid plan upgrade. IAM changes can remain if setup fails partway through; inspect the reported failure before rerunning.

OIDC lets GitHub obtain temporary AWS credentials without storing access keys in GitHub. The trust requires this repository's immutable owner/repository IDs, audience `sts.amazonaws.com`, and the exact `aws-migration-preparation` branch. [GitHub's AWS OIDC guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

The deployment role is scoped to this stack and its existing resources. It can update existing workload inline policies because their artifact-download permission changes with each release; the workload boundaries limit effective permissions and cannot be removed or edited by the deployment role. Existing AWS-managed SSM agent permissions are preserved. This preserves an existing operational policy, rather than claiming a complete least-privilege audit of that managed policy.

The role can list document keys and read originals/results for acceptance verification. This includes private document content: repository writers on the trusted branch are therefore trusted operators. It cannot directly read the private JWT parameter, modify the data table through direct DynamoDB writes, create IAM roles, create a new application stack, or delete the application stack. Deployed runtime code retains its normal application permissions, so code review still matters.

## Make the delivery button available

GitHub requires the `workflow_dispatch` workflow file on the default branch (`main`) to enable manual dispatch. This activation has been completed with a normal fast-forward, without force push or AWS deployment. Open [repository Actions](https://github.com/gayas-sheik/Prashn/actions), choose **Prashn approved delivery**, then **Run workflow**. [GitHub manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

Choose branch **aws-migration-preparation**, enter:

```text
DEPLOY prashn-cloud-v2
```

Then click **Run workflow**. Selecting `main` for delivery is deliberately rejected; only the reviewed cloud branch is trusted by AWS. No repository secret or environment variable needs manual entry for this fixed-account demo workflow.

## What happens in a release

1. The approval job validates the manual event, trusted branch and exact confirmation.
2. CI installs locked dependencies, builds/lints the frontend, tests the backend and AWS adapters locally, and checks the infrastructure template and safety helpers. It has no AWS credentials.
3. CI packages only compiled backend files, runtime dependency manifests, bootstrap helpers and a release identity. It separately retains built frontend files and their checksums. Private handbook files, environment files and document storage are excluded. Dirty source or stale release output is rejected.
4. The delivery job downloads that same run's artifact, obtains temporary AWS credentials and verifies all checksums, paths and the exact source revision.
5. It checks the account, credits, idle queue, existing stack, workload boundaries and fleet bounds. It uses CloudFormation's existing template and changes only `ArtifactKey` and `ArtifactDigest`. The change set must contain only permitted existing launch-template/group/role modifications, with no replacements. Changes to a resolved public AMI are rejected for separate infrastructure review.
6. It resumes the existing fleets within agreed limits and applies the rolling backend/worker release. It waits for the new artifact parameters and `UPDATE_COMPLETE`; an old completion observation is not accepted.
7. It publishes the tested frontend to the existing private S3 bucket, invalidates CloudFront, and compares the public API release identity and served HTML with the CI artifact.
8. `verify.sh --expected-release <commit> --pause-after` checks the real application, cleans up its controlled test documents and attempts to pause both fleets. It does not generate a new scaling load test.
9. A separate cleanup job gets fresh credentials and attempts another safe pause even if delivery/acceptance fails. It waits for CloudFormation to finish, checks the queue, closes API admission before removing workers and inspects zero capacity.

Read the acceptance report's individual statuses and limitations. A workflow job passing only proves its stated checks, not every browser/security/scaling scenario.

## How to know the cloud received the update

The overall GitHub workflow must finish successfully. Download its evidence artifacts and check the exact commit matches the workflow commit:

- `change-summary.json`: only allowed existing resources changed.
- Delivery report: CloudFormation reached `UPDATE_COMPLETE`, public backend revision matched, and public HTML matched the tested build.
- Acceptance report: required functional checks succeeded, with untested scope listed separately.
- Final cleanup report: both API and worker groups have min/max/desired/current zero.

After pausing, the frontend can still be served but API actions are deliberately unavailable. To show the website, explicitly resume the demo using the existing operations instructions. An unavailable paused API is not evidence of a failed code release.

## Future code updates

Push changes to `aws-migration-preparation`, wait for green **Prashn CI**, and run **Prashn approved delivery** for that branch. It reruns checks and packages the selected commit. A green CI badge alone does not mean AWS changed. A failed delivery must be investigated before another release.

For a change to the infrastructure template, instance sizes, maximum capacity, public AMI, authentication design or AWS permissions, use a separately reviewed infrastructure update. This workflow intentionally cannot apply those changes.

## Cost and failure handling

Delivery is bounded to the existing `t3.small` fleets with a maximum of two instances each. It checks at least $10 of active account credits before resuming, creates no fresh application stack, and avoids another load test. Credits, budget alerts and script limits are not enforceable spending caps; AWS billing is delayed. Pausing compute still leaves ALB, storage, logging and any original server costs.

CloudFormation rollback may recover the previous backend release after a failed update. There is no automatic frontend rollback after a frontend publication followed by acceptance failure. Reports identify the reached stage; use the previous known-good commit for a reviewed follow-up release. Persistent S3/DynamoDB data is not imported, reset or deleted by delivery.

Cleanup cannot guarantee success after a forced workflow cancellation, unavailable AWS APIs, permission errors, a stack stuck updating, or a busy queue. If cleanup is blocked, inspect CloudFormation status, queue counts and ASG capacity in CloudShell. Never terminate a worker with real work merely to make the report green. No first live IAM assumption or code-only CloudFormation update has been demonstrated until its workflow evidence exists; provider permission/boundary behavior may require a narrow follow-up fix.

Do not post access tokens, temporary credentials, passwords, JWT values or signed document URLs in logs or issue comments. Evidence artifacts have seven-day retention and contain sanitized reports, not registration passwords or private document payloads.
