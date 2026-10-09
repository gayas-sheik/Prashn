#!/usr/bin/env bash
# Runs on fresh Ubuntu instances, not the existing Prashn server.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq build-essential python3 libfontconfig1 fonts-dejavu-core fonts-liberation xz-utils
mkdir -p /opt/node /var/log/prashn
curl -fsS https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz -o /tmp/node.tar.xz
curl -fsS https://nodejs.org/dist/v22.23.3/SHASUMS256.txt -o /tmp/node-shasums
grep ' node-v22.23.3-linux-x64.tar.xz$' /tmp/node-shasums | sed 's|node-v22.23.3-linux-x64.tar.xz|/tmp/node.tar.xz|' | sha256sum -c -
tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
export PATH="/opt/node/bin:$PATH"
id prashn >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/prashn prashn
cd /opt/prashn/backend
npm ci --omit=dev
bash /opt/prashn/infra/verify-native.sh .
python3 - <<'PY'
import os, subprocess
secret=subprocess.check_output(['aws','ssm','get-parameter','--name',os.environ['JWT_PARAMETER'],'--with-decryption','--query','Parameter.Value','--output','text','--region',os.environ['AWS_REGION']],text=True).strip()
if not secret or '\n' in secret: raise RuntimeError('Invalid private signing secret')
values={'NODE_ENV':'production','PORT':'5000','JWT_SECRET':secret,'JWT_EXPIRES_IN':'1d','CORS_ORIGIN':'same-origin',
    'STORAGE_MODE':'s3','DATABASE_MODE':'dynamodb','PROCESSING_MODE':'sqs','PROCESSING_CONCURRENCY':'1','MAX_DOCUMENT_PAGES':'100','OCR_LANGUAGE':'eng','OCR_MODE':'auto','OLLAMA_MODEL':''}
values.update({key:os.environ[key] for key in ['AWS_REGION','DOCUMENT_BUCKET','DYNAMODB_TABLE','PROCESSING_QUEUE_URL']})
import json
values['APP_RELEASE']=json.load(open('/opt/prashn/.aws-build/release-manifest.json'))['revision']
fd=os.open('.env',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as file: file.write(''.join(key+'='+value+'\n' for key,value in values.items()))
PY
chown prashn:prashn .env
cat > /etc/systemd/system/prashn.service <<SERVICE
[Unit]
Description=Prashn application
After=network-online.target
Wants=network-online.target
[Service]
Type=exec
User=prashn
Group=prashn
WorkingDirectory=/opt/prashn/backend
ExecStart=/opt/node/bin/node /opt/prashn/backend/dist/$ENTRY
Restart=on-failure
RestartSec=5
TimeoutStopSec=180
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/prashn /var/log/prashn
StandardOutput=append:/var/log/prashn/application.log
StandardError=append:/var/log/prashn/application.log
[Install]
WantedBy=multi-user.target
SERVICE
curl -fsS https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb -o /tmp/cloudwatch.deb
dpkg -i /tmp/cloudwatch.deb
python3 - <<'PY'
import json, os
config={'agent':{'metrics_collection_interval':60},'logs':{'logs_collected':{'files':{'collect_list':[{'file_path':'/var/log/prashn/application.log','log_group_name':os.environ['LOG_GROUP'],'log_stream_name':'{instance_id}','timezone':'UTC'}, {'file_path':'/var/log/prashn/bootstrap.log','log_group_name':os.environ['LOG_GROUP'],'log_stream_name':'{instance_id}/bootstrap','timezone':'UTC'}]}}},'metrics':{'namespace':'Prashn','metrics_collected':{'mem':{'measurement':['mem_used_percent']},'disk':{'measurement':['used_percent'],'resources':['/']}},'append_dimensions':{'InstanceId':'${aws:InstanceId}'}}}
with open('/opt/aws/amazon-cloudwatch-agent/etc/prashn.json','w') as file: json.dump(config,file)
PY
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/prashn.json -s
systemctl daemon-reload
systemctl enable --now prashn
if [[ "$ENTRY" == "server.js" ]]; then
  curl -fsS --retry 30 --retry-connrefused --retry-delay 2 --max-time 5 http://127.0.0.1:5000/api/health >/dev/null
else
  sleep 5
  systemctl is-active --quiet prashn
fi
