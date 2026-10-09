#!/usr/bin/env bash
# Usage: bash deploy.sh plan | bash deploy.sh apply
# Plan performs read-only AWS checks. Apply creates a separate paid-resource stack.
set -euo pipefail
command="${1:-plan}"
[[ "$command" == plan || "$command" == apply ]] || { echo 'Use plan or apply'; exit 2; }
cd "$(dirname "$0")"
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}" AWS_PAGER=''
stack="${PRASHN_STACK:-prashn-cloud}"
[[ "$stack" =~ ^[a-z][a-z0-9-]{2,24}$ ]] || { echo 'PRASHN_STACK must be 3-25 lowercase letters/digits/dashes'; exit 2; }
for executable in aws node npm python3 tar curl; do command -v "$executable" >/dev/null || { echo "Install $executable first"; exit 1; }; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(!((a===20&&b>=19)||(a===22&&b>=12)||a>22)) process.exit(1)' || { echo 'Install a supported Node runtime, preferably Node 22'; exit 1; }
identity=$(aws sts get-caller-identity --output json)
account=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Account"])' <<<"$identity")
arn=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Arn"])' <<<"$identity")
[[ "$arn" != *:root ]] || { echo 'Use the IAM administrator session, not root'; exit 1; }
if [[ -n "${EXPECTED_ACCOUNT:-}" && "$account" != "$EXPECTED_ACCOUNT" ]]; then echo 'Account does not match EXPECTED_ACCOUNT'; exit 1; fi
echo "Account: $account; region: $AWS_REGION; stack: $stack"
echo 'A separate stack uses at least TWO EC2 instances, an internal ALB, API Gateway and CloudFront.'
echo 'It adds recurring costs and can exceed the existing $10 monthly alert budget. Credits are not a spending cap.'
echo 'The current Prashn-Server and its data are not modified or migrated by this command.'
quota=$(aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A --query 'Quota.Value' --output text)
aws ec2 describe-instances --filters Name=instance-state-name,Values=pending,running --output json > /tmp/prashn-instances-"$$".json
python3 - "$quota" /tmp/prashn-instances-"$$".json "$stack" <<'PY'
import json,sys,re
instances=[i for r in json.load(open(sys.argv[2]))['Reservations'] for i in r['Instances'] if re.match(r'^[acdhimrtz]',i['InstanceType']) and i.get('InstanceLifecycle')!='spot']
instances=[i for i in instances if not any(t.get('Key')=='aws:autoscaling:groupName' and t.get('Value','').startswith((sys.argv[3]+'-ApiGroup-',sys.argv[3]+'-WorkerGroup-')) for t in i.get('Tags',[]))]
existing=sum(i.get('CpuOptions',{}).get('CoreCount',1)*i.get('CpuOptions',{}).get('ThreadsPerCore',1) for i in instances)
required=existing+8
print('Standard EC2 quota:',sys.argv[1],'; peak vCPUs with existing instances:',required)
if required>float(sys.argv[1]): raise SystemExit('Insufficient quota for the configured maximum fleet; request a quota change or revise the rollout')
PY
rm -f /tmp/prashn-instances-"$$".json
# Verify the proposed default-VPC public subnets really have an internet route.
vpc=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
[[ "$vpc" != None && -n "$vpc" ]] || { echo 'A default VPC is required; configure one deliberately or adapt the template'; exit 1; }
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" --output json > /tmp/prashn-subnets-"$$".json
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$vpc" --output json > /tmp/prashn-routes-"$$".json
subnets=$(python3 - /tmp/prashn-subnets-"$$".json /tmp/prashn-routes-"$$".json <<'PY'
import json,sys
subnets=json.load(open(sys.argv[1]))['Subnets']; routes=json.load(open(sys.argv[2]))['RouteTables']
selected=[]; zones=set()
for subnet in subnets:
    explicit=next((t for t in routes if any(a.get('SubnetId')==subnet['SubnetId'] for a in t.get('Associations',[]))),None)
    table=explicit or next((t for t in routes if any(a.get('Main') for a in t.get('Associations',[]))),{})
    public=any(r.get('DestinationCidrBlock')=='0.0.0.0/0' and r.get('GatewayId','').startswith('igw-') and r.get('State')=='active' for r in table.get('Routes',[]))
    if public and subnet['AvailabilityZone'] not in zones and subnet.get('AvailableIpAddressCount',0)>20:
        selected.append(subnet['SubnetId']); zones.add(subnet['AvailabilityZone'])
if len(selected)<2: raise SystemExit('Need two public subnets in distinct availability zones with free IPs')
print(','.join(selected[:2]))
PY
)
rm -f /tmp/prashn-subnets-"$$".json /tmp/prashn-routes-"$$".json
for service in 'apigatewayv2 get-apis' 'elbv2 describe-load-balancers' 'dynamodb list-tables' 'sqs list-queues' 'cloudfront list-distributions'; do
  read -r service_name service_action <<<"$service"
  aws "$service_name" "$service_action" --output json >/dev/null
done
python3 infra/build_template.py
aws cloudformation validate-template --template-body file://infra/template.json >/dev/null
echo "Read-only preflight passed. VPC: $vpc; subnets: $subnets"
if [[ "$command" == plan ]]; then
  echo 'Review infra/template.json and docs/aws-migration.md before running bash deploy.sh apply.'
  echo 'Successful listing calls do not guarantee free-plan permission to create every resource.'
  exit 0
fi
if [[ "${PRASHN_APPROVE_DEPLOY:-}" != yes ]]; then
  read -r -p "Type the AWS account ID $account to approve creating these resources: " approval
  [[ "$approval" == "$account" ]] || { echo 'Deployment cancelled'; exit 1; }
fi
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit or resolve source changes before deploying a reproducible release'; exit 1; }
mkdir -p .aws-build
python3 -m unittest discover -s infra/tests -v
npm ci --include=dev
npm run build
(cd backend && npm ci --include=dev && bash ../infra/verify-native.sh . && mkdir -p .test-output && npm test)
python3 - <<'PY'
import json,subprocess,datetime
json.dump({'revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},open('.aws-build/release-manifest.json','w'))
PY
tar -czf .aws-build/release.tar.gz backend/dist backend/package.json backend/package-lock.json infra/bootstrap.sh infra/verify-native.sh infra/signal-ready.sh .aws-build/release-manifest.json
digest=$(sha256sum .aws-build/release.tar.gz | cut -d' ' -f1)
aws cloudformation deploy --stack-name "$stack-artifacts" --template-file infra/artifacts.json --no-fail-on-empty-changeset
bucket=$(aws cloudformation describe-stacks --stack-name "$stack-artifacts" --query 'Stacks[0].Outputs[?OutputKey==`Bucket`].OutputValue | [0]' --output text)
aws s3 cp .aws-build/release.tar.gz "s3://$bucket/$digest.tar.gz" --only-show-errors
parameter="/prashn/$stack/jwt"
count=$(aws ssm describe-parameters --parameter-filters "Key=Name,Option=Equals,Values=$parameter" --query 'length(Parameters)' --output text)
if [[ "$count" == 0 ]]; then
  secretfile=$(mktemp /tmp/prashn-secret.XXXXXX)
  trap 'rm -f "$secretfile"' EXIT
  python3 -c 'import secrets,sys; open(sys.argv[1],"w").write(secrets.token_hex(48))' "$secretfile"
  aws ssm put-parameter --name "$parameter" --type SecureString --value "file://$secretfile" >/dev/null
  rm -f "$secretfile"
  trap - EXIT
fi
aws cloudformation deploy --stack-name "$stack" --template-file infra/template.json --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "VpcId=$vpc" "SubnetIds=$subnets" "ArtifactBucket=$bucket" "ArtifactKey=$digest.tar.gz" "ArtifactDigest=$digest" "JwtParameter=$parameter"
aws cloudformation describe-stacks --stack-name "$stack" --query 'Stacks[0].Outputs' --output json > .aws-build/outputs.json
output() { python3 -c 'import json,sys; print(next(x["OutputValue"] for x in json.load(open(".aws-build/outputs.json")) if x["OutputKey"]==sys.argv[1]))' "$1"; }
frontend=$(output FrontendBucket)
aws s3 sync dist/ "s3://$frontend/" --exclude index.html --cache-control 'public,max-age=31536000,immutable' --only-show-errors
aws s3 cp dist/index.html "s3://$frontend/index.html" --cache-control no-cache --content-type text/html --only-show-errors
distribution=$(output DistributionId)
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' >/dev/null
website=$(output WebsiteUrl)
# Narrow direct-upload/download CORS to the deployed frontend after its URL exists.
python3 - "$website" <<'PY'
import json,sys
json.dump({'CORSRules':[{'AllowedOrigins':[sys.argv[1]],'AllowedMethods':['POST','GET','HEAD'],'AllowedHeaders':['*'],'MaxAgeSeconds':300}]},open('.aws-build/cors.json','w'))
PY
aws s3api put-bucket-cors --bucket "$(output DocumentBucket)" --cors-configuration file://.aws-build/cors.json
curl -fsS --retry 20 --retry-all-errors --retry-delay 5 --max-time 10 "$website/api/health"
printf '\nWebsite: %s\n' "$website"
echo 'Run the live acceptance checklist in docs/aws-migration.md; existing accounts/data require the separate verified migration procedure.'
