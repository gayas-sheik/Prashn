# Optional AWS deployment

**Status:** this document preserves the original hosting guidance and proposed serverless design. Since 10 October 2026, [migration preparation](aws-migration.md) supplies S3/DynamoDB/SQS adapters and deployment automation for scalable EC2 API/worker services, while retaining the local extractor and authentication. That new stack has not been deployed. The [existing EC2 installation](ec2-deployment.md) uses the original local persistence. The Cognito/Textract/Lambda design below remains a future alternative.

Prashn's purpose is document processing and document-grounded question answering. AWS is an optional place to host it. The [main application guide](project-documentation.md) describes the implemented application, local setup, configuration and API.

## Choose a deployment path

| Path | Suitable when | Work required | Main limitation |
| --- | --- | --- | --- |
| A: EC2 with persistent storage | You want an initial hosted installation with minimal application changes | Linux packaging, persistent storage, HTTPS, process supervision, backups and operational validation | One backend instance and one processing queue; no high availability |
| B: Managed AWS services | You need durable jobs, independent workers and shared storage across instances | Storage/database adapters, identity integration, queue workers, upload redesign and infrastructure | A substantial application migration, not a configuration switch |

Start with Path A if the priority is to publish the existing application. Consider Path B after workload measurements justify it. Neither path requires custom model training. Instance size and worker concurrency should follow measured OCR memory, CPU, processing time and representative document workloads.

## Path A: host the existing application on EC2

### Deployment shape

~~~mermaid
flowchart LR
    B[Browser] -->|HTTPS| P[Reverse proxy on EC2]
    P --> F[Built React files]
    P -->|/api| A[Express backend]
    A --> Q[Existing processing queue and OCR]
    A --> D[(SQLite on persistent EBS)]
    Q --> S[(Originals and extracted text on EBS)]
~~~

Keep one backend process. Its current queue and SQLite/filesystem design do not implement coordination between replicas. EBS provides persistent block storage; configure volume retention and backups rather than relying on a replaceable instance's incidental files. See [EC2 EBS storage](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/storage_ebs.html).

### Preparation and rollout

1. Choose a region, domain, initial budget and supported Linux/CPU architecture. Record the exact Git commit to deploy.
2. Package the frontend and backend for the target platform. A Docker image is useful for repeatable installation, but Dockerfiles and Compose configuration must first be created and tested. Install locked dependencies inside Linux; Windows native modules cannot be copied to the host.
3. Build the frontend using `npm ci` and `npm run build` from the repository root. Build the backend using the same commands from `backend/`. Launch the compiled backend with `npm start`. Serve frontend `dist/` through the reverse proxy and configure SPA fallback for application routes.
4. Create a persistent data directory on EBS and grant the backend account write access. Set absolute `DB_FILE`, `UPLOAD_DIR` and `PROCESSED_DIR` paths there. If using containers, bind-mount these paths; keep data outside the image and container writable layer. Configure retention when replacing the instance.
5. Supply server configuration privately: `NODE_ENV=production`, a unique `JWT_SECRET`, the public `CORS_ORIGIN` and appropriate processing limits. Leave `OLLAMA_MODEL=` empty for the tested default answerer. Keep server secrets out of frontend build variables and Git.
6. Configure HTTPS and reverse-proxy `/api` to the backend. Keep the backend port private; expose the necessary web ports through the security group. Set the proxy request limit high enough for a 10 MiB file plus multipart overhead, and check request timeouts. Use an instance role for any AWS access rather than embedding long-lived credentials.
7. Configure a supervised service or container restart policy, logs and disk/memory monitoring. Run `/api/health` plus an authenticated upload, processing, preview and cited-question check. Health alone does not establish operational readiness.
8. Set up coordinated database/file backups and perform a restore into a separate test installation. For a file-copy backup, stop the backend before taking the consistent copy or snapshot; otherwise use a SQLite-aware backup and coordinate the file data.
9. Run the acceptance checks below before routing real users to the installation. Record the deployed commit, environment, backup procedure and rollback steps.

A simple release can replace application code/builds while retaining data paths. Back up first, stop the backend, install the selected release, rebuild if necessary, restart and verify. Roll back application code only after checking compatibility with the data schema. Existing documents need reprocessing to apply extraction changes; reprocessing all documents is not an automatic release step.

The current app also needs rate limiting, recovery/session controls and a production security review before broader public use. Hosting it does not implement those features. Monitor disk growth because originals, extracted text and database content persist until deliberately removed.

### Why not deploy the current filesystem design unchanged to App Runner?

App Runner describes its application filesystem as ephemeral and expects stateless applications. Persisting the current SQLite database and uploads there would be unsuitable. Use persistent storage on EC2 for Path A, or implement external persistence before adopting a stateless runtime. See [App Runner application development](https://docs.aws.amazon.com/apprunner/latest/dg/develop.html).

## Path B: proposed managed-service integration

The following is a design to implement, not a description of existing AWS behavior. Textract is a proposed alternative extractor; it does not automatically reproduce the current PDF layout, fields or citations.

~~~mermaid
flowchart TD
    U[User] --> F[React via CloudFront and private S3 origin]
    U --> C[Cognito]
    F --> A[API Gateway and API Lambda]
    C -->|Validated token| A
    A -->|Authorized upload intent| D[(DynamoDB metadata)]
    A -->|Presigned upload URL| F
    F -->|Direct upload| S[(Private S3 originals)]
    S --> E[Filtered Object Created event]
    E --> Q[SQS ingestion queue]
    Q --> L[Start worker]
    Q --> DLQ[Ingestion dead-letter queue]
    L --> T[Textract asynchronous job]
    T --> N[SNS completion topic]
    N --> CQ[SQS completion queue]
    CQ --> R[Result worker]
    CQ --> CDLQ[Completion dead-letter queue]
    R --> O[(S3 full text and page outputs)]
    R --> D
    A --> QA[Document-grounded answerer]
    D --> QA
    O --> QA
    QA --> A
~~~

For multipage PDFs, use Textract's asynchronous Start/Get operations. Persist the job ID, receive completion notification and retrieve all paginated result blocks before marking extraction complete. See [Textract asynchronous operations](https://docs.aws.amazon.com/textract/latest/dg/api-async.html).

### Required application changes

| Area | Implementation required |
| --- | --- |
| Frontend hosting | Build/deploy static assets, configure SPA routes and API origin, and invalidate changed assets as needed |
| Authentication | Validate Cognito tokens; map the stable user subject to document, conversation and activity ownership |
| Original-file storage | Implement S3 read/write/delete and authenticated, short-lived download links |
| Processed outputs | Replace direct filesystem writes with output storage; preserve complete text and page provenance |
| Metadata and history | Replace SQLite repositories for documents, conversations, activity and account/identity mapping; define pagination and indexes |
| Uploads | Create an owned upload intent, upload directly to private S3, validate/finalize acceptance and track status |
| Job scheduling | Replace the in-process queue with durable queue workers and persisted job generations |
| Extraction | Normalize Textract or another worker's output into the application's fields, items, pages and citations |
| Retry/deletion | Handle duplicate jobs, stale results and cleanup consistently across storage and metadata |
| Q&A | Load only the selected owner's document evidence; retain extractive behavior and missing-evidence refusal |
| Operations | Implement deployment automation, least-privilege roles, alarms, backup/restore and failure recovery |

The implemented EC2-worker migration now selects S3/DynamoDB/SQS adapters through the complete mode tuple and required resource configuration; it replaces authoritative local storage/queue dependencies. See [the current migration guide](aws-migration.md). Merely setting a flag does not provision resources or implement the Cognito, Textract, direct Lambda or identity changes proposed in this section.

### Upload and data design

The current limit is 10 MiB per file. Standard buffered synchronous Lambda requests have a 6 MB payload limit, so routing the existing multipart upload through a Lambda handler would not preserve that limit. Prefer direct-to-S3 uploads instead of sending document bytes through the API. See [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html).

Create a unique, owner-associated object key and document intent before issuing a short-lived presigned URL. Validate the resulting object size, type, ownership and intended generation before queueing it; verify the content rather than trusting only a client-provided MIME label. Use signed upload constraints where applicable and remove abandoned or invalid objects. A signed URL is a temporary capability and should be kept out of logs. See [S3 presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html).

Keep large page text, OCR blocks and full extracted output in S3, with references in DynamoDB. DynamoDB has a 400 KB item limit; unbounded document text or conversation history should not be placed in one item. Plan paginated history and document queries. Storage and metadata changes also require cleanup/reconciliation because S3 and DynamoDB do not provide one shared transaction. See [DynamoDB large-item guidance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-use-s3-too.html).

### Durable jobs and recovery

SQS-triggered Lambda processing can deliver a message more than once, so workers must be idempotent. See [Lambda with SQS](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html).

Persist `documentId`, owner, processing generation, source object/version and job ID. A duplicate event should reuse or ignore an already accepted job. A retry should create a new generation; completion from an older generation must not overwrite its result. If a document is deleted during processing, a later completion must not recreate it.

Filter object-created notifications to original uploads so saving processed outputs cannot trigger another ingestion cycle. Configure visibility timeouts, bounded retries, dead-letter queues, partial-batch failure handling and alarms. Distinguish unreadable input from a temporary provider failure. Record failed jobs in a form that supports an owned user retry and operational diagnosis without logging private document text.

### Identity and private file access

Verify token signature, issuer, expiry, token use and the expected app client/audience as appropriate to the selected Cognito token type. Do not treat decoding a token as verification. See [Cognito JWT verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html).

Plan how existing local accounts map to the new identity system before migrating data. Matching an email alone must not grant ownership of another account's stored documents. Preserve owner checks for lists, details, original downloads, questions, conversation clearing, activity, retries and deletion.

Keep document and output buckets private. Issue download links only after verifying ownership, with short expiration. Use a separate bucket for frontend assets. For private S3 frontend origins, use CloudFront Origin Access Control with a regular bucket origin and a bucket policy restricted to the distribution; the S3 website endpoint does not support OAC. See [CloudFront private S3 origins](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

Configure TLS, appropriate encryption and retention, narrowly scoped IAM permissions and private server secrets. Avoid logging tokens, signed URLs or extracted private content. Retention/deletion rules and backups must reflect what the installation actually promises users.

## Validation before use

| Check | Required evidence |
| --- | --- |
| Upload and processing | Single and batch files complete; supported formats and limits remain enforced; preview bytes match the original |
| Extraction and Q&A | Representative anonymized documents are graded for missed/extra fields, values, answers and source citations; missing evidence still refuses |
| Access isolation | A second account cannot list, preview, question, retry or delete the first account's documents/history |
| Browser behavior | Navigation, chat scrolling, mobile layout, interrupted uploads, session expiry and failure messages work on the deployed origin |
| Durability | Restart/redeploy retains documents, metadata and conversations; backup restoration is demonstrated |
| Recovery | Corrupt files fail clearly; temporary failures and retries recover without duplicate or conflicting records |
| Managed-path events | Duplicate/out-of-order events and late completions after retry/deletion cannot corrupt state |
| Operations | Logs/alarms expose failures without private content; resource limits, retention, release and rollback are recorded |

Run the existing regression suite and synthetic benchmark, then add representative holdout documents. Local benchmark passes do not establish Textract accuracy or deployment correctness. Any new extractor must preserve full text, page numbering, field provenance and citation grounding, and must be evaluated separately.

## Cost and implementation sequence

Choose the region and estimate costs from expected uploads, pages, retention and concurrent users. EC2/EBS incur hosting and storage charges; the managed design adds request, OCR, queue, database, logging and data-transfer charges. OCR volume may dominate the managed design. Use current [AWS pricing](https://aws.amazon.com/pricing/) and set budget notifications; a budget notification is not a hard spending cap. No fixed monthly price or free-tier assumption is made here.

For Path A, prepare packaging and persistent storage, deploy a test installation, verify restore/release procedures, then run acceptance checks. For Path B, first specify ownership and data contracts; implement and test storage/repositories; integrate identity and direct uploads; add queue workers/extraction; test failure recovery; then publish the frontend and run end-to-end checks.

Manage repeatable infrastructure with Terraform or CloudFormation once the design and account settings are chosen. Add CI/CD only after build, secrets, migrations and rollback are concrete. Those tools express and automate a deployment; they do not supply the missing application integrations.
