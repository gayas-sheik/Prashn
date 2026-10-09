# Prashn EC2 deployment

Deployment record: **10 October 2026 (Asia/Kolkata)**. The application is hosted at **https://prashn.98-81-180-63.sslip.io/**.

## Deployed architecture

```text
Browser --HTTPS--> Nginx on EC2
                    |-- /           built React frontend
                    |-- /api/       Express backend on port 5000
                                      |-- SQLite
                                      |-- private document/text storage
                                      |-- local processing queue and PDF/OCR extraction
                                      |-- extractive document-grounded Q&A
```

This deployment hosts the existing application on one EC2 instance. It uses local PDF extraction and bundled English OCR; Textract is not required for this configuration. S3, DynamoDB, Cognito, SQS, Lambda workers, load balancing, automatic scaling and CloudWatch application-log shipping have not been deployed. Processing remains asynchronous within one backend process; this is not the proposed distributed AWS event pipeline.

## Deployment configuration

| Item | Recorded configuration |
| --- | --- |
| Source | `main`, commit `1b4217e3f137fb811c833e633574a4de8b0d69a2` |
| Region / instance | `us-east-1`, `i-0247ac169ada1732f`, Prashn-Server |
| Compute | Ubuntu 24.04 LTS, x86-64, t3.small, CPU credits Standard |
| Disk | 20 GiB encrypted gp3; delete on termination enabled |
| Public address | `98.81.180.63`; no Elastic IP |
| Runtime | Node 22.23.3, npm 10.9.9, Nginx 1.24.0 |
| Checkout | `/home/ubuntu/Prashn` |
| Frontend deployment | Built `dist/` copied to `/var/www/prashn` |
| Backend service | `prashn-backend.service`, enabled, running as `ubuntu` |
| Backend entry | `/home/ubuntu/Prashn/backend/dist/server.js` |
| Node executable | `/home/ubuntu/.nvm/versions/node/v22.23.3/bin/node` |
| Database | `/home/ubuntu/Prashn/backend/data/production/prashn.db` |
| Original / processed storage | Backend `storage/uploads` and `storage/processed` |
| Private configuration | Backend `.env`, random signing secret, production mode; not committed |
| Processing | Concurrency 1, up to 100 PDF pages, English OCR in auto mode |
| Q&A | Extractive; `OLLAMA_MODEL` empty |
| HTTPS | Certbot Nginx integration; HTTP redirects to HTTPS |

The Nginx site is `/etc/nginx/sites-available/prashn`, enabled through `sites-enabled/prashn`. It serves the SPA with `try_files` and proxies `/api/` to `http://127.0.0.1:5000` without removing the API path. A 210 MiB request-body limit permits the supported batch size; backend limits remain 10 MiB per file and 20 files per batch. Login and registration have a configured per-IP Nginx limit of 20 requests/minute with burst 10 and JSON HTTP 429 responses. The rate-limit behavior has not been independently exercised on the deployed service.

The systemd unit uses `Restart=on-failure`, `UMask=0077`, `NoNewPrivileges=true`, `PrivateTmp=true` and `ProtectSystem=full`. Its working directory is the backend directory. It launches compiled JavaScript, rather than Vite or nodemon.

The security group permits HTTP/HTTPS publicly and SSH only from the owner's recorded laptop IP. Backend port 5000 is not included in its public inbound rules. No instance IAM role or AWS application credentials were added.

## Verification evidence

Remote execution was performed by the owner. The following command outputs were supplied in the deployment session and inspected; they are not fabricated direct remote-tool observations.

| Check / command | Observed result |
| --- | --- |
| `git log -1 --oneline` | Commit `1b4217e`, matching the deployment source |
| `npm ci --include=dev`, root and backend | Both completed; development dependency advisories remain |
| Backend `npm audit --omit=dev` | Zero known production dependency vulnerabilities reported at the time |
| Backend `npm test` | 35 tests passed, zero failures/skips; about 13.52 seconds, including native OCR and negative cases |
| Root `npm run build` | TypeScript and Vite 8.3.3 build passed; 1,933 modules transformed |
| `systemctl status prashn-backend` and journal | Enabled and active; SQLite initialized; compiled Node process running |
| `curl -fsS http://127.0.0.1:5000/api/health` | Successful production health JSON |
| `nginx -t` | Syntax and configuration tests successful, before and after HTTPS setup |
| Nginx localhost health with the configured Host header | HTTP 200 and backend health JSON |
| Nginx localhost frontend HEAD with that Host header | HTTP 200, HTML content length 1,311 bytes |
| `curl -i https://prashn.98-81-180-63.sslip.io/api/health` | HTTP 200 using normal certificate validation |
| `curl -I http://prashn.98-81-180-63.sslip.io/` | HTTP 301 to the matching HTTPS URL |
| `systemctl status snap.certbot.renew.timer` | Enabled and active (waiting) |
| `sudo /snap/bin/certbot renew --dry-run` | All simulated renewals succeeded for the deployed certificate |
| Health check after backend restart | Successful health JSON supplied after the persistence check |
| SSH-session exit cleanup | AWS returned `Return: true`, revoking temporary rule `sgr-0bc3d578ab9986ce1` for CloudShell `54.235.11.190/32` |
| SSH security-group rule listing after cleanup | Only original SSH rule `sgr-00d0e74ba04df6cc9`, laptop source `157.50.1.248/32`, remained |

The deployed health response was:

```json
{"status":"ok","environment":"production","processingMode":"local","qaMode":"extractive","workspace":"Prashn","extractionVersion":"layout-fields-v2"}
```

The owner reported that the browser application worked and that the document, extracted values and question history remained usable after restarting the backend. These are **owner-reported browser/persistence checks**, not an independent rendered UI audit. Individual browser actions, mobile layouts, themes, browser-console errors, extraction accuracy on those uploads and all failure states were not independently inspected in this deployment pass. The earlier local acceptance evidence remains separately documented in [the local audit](local-mvp-final-audit.md).

Dependency installation reported seven frontend advisories (two moderate, five high) and three backend high advisories. Lockfile review located these in development/build dependency chains; production-only audits reported zero known advisories. No forced dependency upgrades were applied. The full dependency advisories are unresolved, and a zero-advisory production audit is not a complete security assessment.

## Operating the deployment

The website runs independently of SSH or CloudShell. Visitors use the HTTPS URL and application accounts, without signing in to AWS.

Run these on the Ubuntu instance when checking or restarting the backend:

```bash
sudo systemctl status prashn-backend --no-pager -l
sudo journalctl -u prashn-backend -n 60 --no-pager
sudo systemctl restart prashn-backend
curl -fsS https://prashn.98-81-180-63.sslip.io/api/health
```

For Nginx and certificate checks:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo systemctl status snap.certbot.renew.timer --no-pager
sudo /snap/bin/certbot renew --dry-run
```

Certbot manages renewal and Nginx integration. See [Ubuntu's certificate instructions](https://ubuntu.com/server/docs/how-to/security/obtain-tls-certificates/). Keep port 80 reachable for HTTP certificate validation and renewal.

For application updates, preserve the private environment and data paths, back up the database and both storage directories together, install the locked dependencies, run affected tests and build both packages. Copy the new frontend `dist/` into `/var/www/prashn` and restart the backend after a successful backend build. The systemd unit pins the installed Node executable path; a runtime version change requires reviewing that unit and native dependencies. The current deployment is manual and does not implement CI/CD.

## Remaining limits and next work

- The URL embeds the current auto-assigned public IP. A stop/start can change that IP and require a new hostname, Nginx configuration, CORS origin and certificate. A reboot is a different operation. No stable address or owned domain has been provisioned.
- Saved data survived the reported backend restart. Full instance reboot recovery and backup/restore have not been tested. Deleting this instance deletes its root disk under the selected policy; no backup was created in this pass.
- One instance is a single point of failure. This deployment does not provide automatic application scaling or durable distributed processing.
- Authentication and application data isolation retain the local implementation. Password recovery, token revocation, complete abuse controls and a production security review remain outstanding. The Nginx authentication limit is a deployment control, not a change to the application middleware.
- Systemd journal and Nginx logs remain local. CloudWatch application logs, alarms and performance tests remain future work.
- Cost-budget alerts are notifications, not a spending cap. Running compute, storage and networking consume applicable account credits or incur charges under the account's plan. Review costs and the account plan before leaving resources running long term.
- Resolve development dependency advisories through reviewed compatible changes, verify additional browser/error flows, add a consistent backup/restore procedure, then implement managed AWS components incrementally with appropriate workload IAM roles.

**Outcome: the existing application is operational on EC2 with HTTPS, backend service management and tested certificate renewal. The broader AWS migration and full production acceptance are not complete.**
