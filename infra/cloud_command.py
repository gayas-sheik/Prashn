"""Run an operator command with stack settings and a private in-memory secret."""
import json, os, subprocess, sys
from pathlib import Path
if len(sys.argv)<3 or sys.argv[1] not in ('migrate','reconcile'):
    raise SystemExit('Usage: python3 infra/cloud_command.py migrate|reconcile STACK [arguments]')
root=Path(__file__).resolve().parent.parent
region=os.environ.get('AWS_REGION','us-east-1'); stack=sys.argv[2]
def aws(*args):
    return subprocess.check_output(['aws',*args,'--region',region,'--no-cli-pager'],text=True)
outputs=json.loads(aws('cloudformation','describe-stacks','--stack-name',stack))['Stacks'][0]['Outputs']
values={item['OutputKey']:item['OutputValue'] for item in outputs}
secret=aws('ssm','get-parameter','--name','/prashn/'+stack+'/jwt','--with-decryption','--query','Parameter.Value','--output','text').strip()
env=dict(os.environ,NODE_ENV='production',AWS_REGION=region,STORAGE_MODE='s3',DATABASE_MODE='dynamodb',PROCESSING_MODE='sqs',
    DOCUMENT_BUCKET=values['DocumentBucket'],DYNAMODB_TABLE=values['DataTable'],PROCESSING_QUEUE_URL=values['QueueUrl'],JWT_SECRET=secret)
raise SystemExit(subprocess.call(['node',str(root/'backend'/'dist'/(sys.argv[1]+'.js')),*sys.argv[3:]],cwd=root/'backend',env=env))
