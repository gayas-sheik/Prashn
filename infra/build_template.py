"""Generate the reviewable CloudFormation template; makes no AWS calls."""
import json
from pathlib import Path

ref = lambda name: {"Ref": name}
att = lambda name, attribute: {"Fn::GetAtt": [name, attribute]}
sub = lambda value: {"Fn::Sub": value}
resources = {}
def resource(name, kind, properties, retain=False, **extra):
    resources[name] = {"Type": "AWS::" + kind, "Properties": properties, **extra}
    if retain:
        resources[name].update(DeletionPolicy="Retain", UpdateReplacePolicy="Retain")

public_block = dict(BlockPublicAcls=True, BlockPublicPolicy=True, IgnorePublicAcls=True, RestrictPublicBuckets=True)
bucket_props = {"PublicAccessBlockConfiguration": public_block, "OwnershipControls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
    "BucketEncryption": {"ServerSideEncryptionConfiguration": [{"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}}
resource("Documents", "S3::Bucket", {**bucket_props, "CorsConfiguration": {"CorsRules": [{"AllowedOrigins": ["*"], "AllowedMethods": ["POST", "GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAge": 300}]},
    "LifecycleConfiguration": {"Rules": [{"Id": "ExpireStaging", "Status": "Enabled", "Prefix": "staging/", "ExpirationInDays": 1}, {"Id": "AbortMultipart", "Status": "Enabled", "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}}]}}, True)
resource("Frontend", "S3::Bucket", bucket_props, True)
for name in ["Documents", "Frontend"]:
    resource(name + "TlsPolicy", "S3::BucketPolicy", {"Bucket": ref(name), "PolicyDocument": {"Version": "2012-10-17", "Statement": [{"Effect": "Deny", "Principal": "*", "Action": "s3:*", "Resource": [att(name,"Arn"), sub("${" + name + ".Arn}/*")], "Condition": {"Bool": {"aws:SecureTransport": "false"}}}]}})
resource("Data", "DynamoDB::Table", {"BillingMode": "PAY_PER_REQUEST", "SSESpecification": {"SSEEnabled": True}, "PointInTimeRecoverySpecification": {"PointInTimeRecoveryEnabled": True},
    "AttributeDefinitions": [{"AttributeName": name, "AttributeType": "S"} for name in ["PK","SK","GSI1PK","GSI1SK","dispatchPK","dispatchSK"]],
    "KeySchema": [{"AttributeName":"PK","KeyType":"HASH"},{"AttributeName":"SK","KeyType":"RANGE"}],
    "GlobalSecondaryIndexes": [{"IndexName": name, "KeySchema": [{"AttributeName":pk,"KeyType":"HASH"},{"AttributeName":sk,"KeyType":"RANGE"}], "Projection":{"ProjectionType":"ALL"}} for name,pk,sk in [("OwnerIndex","GSI1PK","GSI1SK"),("DispatchIndex","dispatchPK","dispatchSK")]]}, True)
resource("DeadLetters", "SQS::Queue", {"MessageRetentionPeriod":1209600,"SqsManagedSseEnabled":True})
resource("Jobs", "SQS::Queue", {"VisibilityTimeout":120,"ReceiveMessageWaitTimeSeconds":20,"MessageRetentionPeriod":345600,"SqsManagedSseEnabled":True,
    "RedrivePolicy":{"deadLetterTargetArn":att("DeadLetters","Arn"),"maxReceiveCount":10}})
resource("ApplicationLogs", "Logs::LogGroup", {"LogGroupName":sub("/prashn/${AWS::StackName}/application"),"RetentionInDays":14}, True)
resource("AccessLogs", "Logs::LogGroup", {"LogGroupName":sub("/prashn/${AWS::StackName}/access"),"RetentionInDays":14}, True)
resource("VpcLinkSecurity", "EC2::SecurityGroup", {"GroupDescription":"API Gateway VPC link", "VpcId":ref("VpcId")})
resource("BalancerSecurity", "EC2::SecurityGroup", {"GroupDescription":"Private API ingress from VPC link only","VpcId":ref("VpcId"),
    "SecurityGroupIngress":[{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"SourceSecurityGroupId":ref("VpcLinkSecurity")}]})
resource("ApiSecurity", "EC2::SecurityGroup", {"GroupDescription":"API instances; no public inbound access","VpcId":ref("VpcId"),
    "SecurityGroupIngress":[{"IpProtocol":"tcp","FromPort":5000,"ToPort":5000,"SourceSecurityGroupId":ref("BalancerSecurity")}]})
resource("WorkerSecurity", "EC2::SecurityGroup", {"GroupDescription":"Workers; no inbound access","VpcId":ref("VpcId")})
resource("Balancer", "ElasticLoadBalancingV2::LoadBalancer", {"Scheme":"internal","Type":"application","Subnets":ref("SubnetIds"),"SecurityGroups":[ref("BalancerSecurity")]})
resource("ApiTargets", "ElasticLoadBalancingV2::TargetGroup", {"VpcId":ref("VpcId"),"Protocol":"HTTP","Port":5000,"TargetType":"instance","HealthCheckPath":"/api/health",
    "HealthCheckIntervalSeconds":30,"HealthyThresholdCount":2,"TargetGroupAttributes":[{"Key":"deregistration_delay.timeout_seconds","Value":"30"}]})
resource("Listener", "ElasticLoadBalancingV2::Listener", {"LoadBalancerArn":ref("Balancer"),"Protocol":"HTTP","Port":80,"DefaultActions":[{"Type":"forward","TargetGroupArn":ref("ApiTargets")}]})
resource("HttpApi", "ApiGatewayV2::Api", {"ProtocolType":"HTTP","Name":sub("${AWS::StackName}-api")})
resource("VpcLink", "ApiGatewayV2::VpcLink", {"Name":sub("${AWS::StackName}-link"),"SubnetIds":ref("SubnetIds"),"SecurityGroupIds":[ref("VpcLinkSecurity")]})
resource("ApiIntegration", "ApiGatewayV2::Integration", {"ApiId":ref("HttpApi"),"IntegrationType":"HTTP_PROXY","IntegrationMethod":"ANY","IntegrationUri":ref("Listener"),
    "ConnectionType":"VPC_LINK","ConnectionId":ref("VpcLink"),"PayloadFormatVersion":"1.0","RequestParameters":{"overwrite:path":"$request.path"},"TimeoutInMillis":30000})
for name,route in [("DefaultRoute","$default"),("LoginRoute","POST /api/auth/login"),("RegisterRoute","POST /api/auth/register")]:
    resource(name,"ApiGatewayV2::Route",{"ApiId":ref("HttpApi"),"RouteKey":route,"Target":sub("integrations/${ApiIntegration}")})
resource("Stage","ApiGatewayV2::Stage",{"ApiId":ref("HttpApi"),"StageName":"$default","AutoDeploy":True,
    "DefaultRouteSettings":{"ThrottlingBurstLimit":40,"ThrottlingRateLimit":20},
    "RouteSettings":{route:{"ThrottlingBurstLimit":10,"ThrottlingRateLimit":1} for route in ["POST /api/auth/login","POST /api/auth/register"]},
    "AccessLogSettings":{"DestinationArn":sub("arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:${AccessLogs}"),"Format":'{"requestId":"$context.requestId","route":"$context.routeKey","status":"$context.status","latency":"$context.responseLatency"}'}}, DependsOn=["DefaultRoute","LoginRoute","RegisterRoute"])
resource("OriginAccess","CloudFront::OriginAccessControl",{"OriginAccessControlConfig":{"Name":sub("${AWS::StackName}-frontend"),"OriginAccessControlOriginType":"s3","SigningBehavior":"always","SigningProtocol":"sigv4"}})
resource("ApiOriginPolicy","CloudFront::OriginRequestPolicy",{"OriginRequestPolicyConfig":{"Name":sub("${AWS::StackName}-api-origin"),"CookiesConfig":{"CookieBehavior":"all"},"QueryStringsConfig":{"QueryStringBehavior":"all"},"HeadersConfig":{"HeaderBehavior":"allExcept","Headers":["Host"]}}})
resource("SpaRoutes","CloudFront::Function",{"Name":sub("${AWS::StackName}-spa"),"AutoPublish":True,"FunctionConfig":{"Comment":"Rewrite frontend routes without changing API error responses","Runtime":"cloudfront-js-2.0"},
    "FunctionCode":"function handler(event) { var r = event.request; if (r.uri.indexOf('.') < 0 || r.uri.endsWith('/')) r.uri = '/index.html'; return r; }"})
resource("Distribution","CloudFront::Distribution",{"DistributionConfig":{"Enabled":True,"HttpVersion":"http2and3","PriceClass":"PriceClass_100","ViewerCertificate":{"CloudFrontDefaultCertificate":True},
    "Origins":[{"Id":"frontend","DomainName":att("Frontend","RegionalDomainName"),"S3OriginConfig":{"OriginAccessIdentity":""},"OriginAccessControlId":ref("OriginAccess")},
      {"Id":"api","DomainName":sub("${HttpApi}.execute-api.${AWS::Region}.${AWS::URLSuffix}"),"CustomOriginConfig":{"OriginProtocolPolicy":"https-only","OriginSSLProtocols":["TLSv1.2"]}}],
    "DefaultCacheBehavior":{"TargetOriginId":"frontend","ViewerProtocolPolicy":"redirect-to-https","Compress":True,"CachePolicyId":"658327ea-f89d-4fab-a63d-7e88639e58f6","FunctionAssociations":[{"EventType":"viewer-request","FunctionARN":att("SpaRoutes","FunctionARN")}]},
    "CacheBehaviors":[{"PathPattern":"/api/*","TargetOriginId":"api","ViewerProtocolPolicy":"https-only","AllowedMethods":["GET","HEAD","OPTIONS","PUT","PATCH","POST","DELETE"],"CachedMethods":["GET","HEAD"],"CachePolicyId":"4135ea2d-6df8-44a3-9df3-4b5a84be39ad","OriginRequestPolicyId":ref("ApiOriginPolicy"),"Compress":True}]}}, DependsOn="Stage")
# Replace the TLS-only policy with a combined frontend policy including private OAC access.
resources["FrontendTlsPolicy"]["Properties"]["PolicyDocument"]["Statement"].append({"Effect":"Allow","Principal":{"Service":"cloudfront.amazonaws.com"},"Action":"s3:GetObject","Resource":sub("${Frontend.Arn}/*"),"Condition":{"StringEquals":{"AWS:SourceArn":sub("arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}")}}})

for role,entry,security in [("Api","server.js","ApiSecurity"),("Worker","worker.js","WorkerSecurity")]:
    statements = [
      {"Effect":"Allow","Action":["s3:GetObject"],"Resource":sub("arn:${AWS::Partition}:s3:::${ArtifactBucket}/${ArtifactKey}")},
      {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":sub("${Documents.Arn}/*")},
      {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":att("Documents","Arn")},
      {"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:ConditionCheckItem"],"Resource":[att("Data","Arn"),sub("${Data.Arn}/index/*")]},
      {"Effect":"Allow","Action":["sqs:SendMessage"] + (["sqs:ReceiveMessage","sqs:DeleteMessage","sqs:ChangeMessageVisibility"] if role=="Worker" else []),"Resource":att("Jobs","Arn")},
      {"Effect":"Allow","Action":["ssm:GetParameter"],"Resource":sub("arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter${JwtParameter}")},
      {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogStreams"],"Resource":att("ApplicationLogs","Arn")},
      {"Effect":"Allow","Action":["cloudwatch:PutMetricData"],"Resource":"*","Condition":{"StringEquals":{"cloudwatch:namespace":"Prashn"}}},
      {"Effect":"Allow","Action":["cloudformation:SignalResource","cloudformation:DescribeStacks"],"Resource":ref("AWS::StackId")},
    ]
    if role=="Worker":
        statements[1]["Resource"]=sub("${Documents.Arn}/results/*")
        statements.append({"Effect":"Allow","Action":["s3:GetObject","s3:DeleteObject"],"Resource":sub("${Documents.Arn}/originals/*")})
        statements.append({"Effect":"Allow","Action":["s3:DeleteObject"],"Resource":sub("${Documents.Arn}/staging/*")})
    resource(role+"Role","IAM::Role",{"AssumeRolePolicyDocument":{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]},
      "ManagedPolicyArns":[sub("arn:${AWS::Partition}:iam::aws:policy/AmazonSSMManagedInstanceCore")],"Policies":[{"PolicyName":"workload","PolicyDocument":{"Version":"2012-10-17","Statement":statements}}]})
    resource(role+"Profile","IAM::InstanceProfile",{"Roles":[ref(role+"Role")]})
    userdata = """#!/bin/bash
set -euo pipefail
mkdir -p /var/log/prashn
exec > >(tee -a /var/log/prashn/bootstrap.log) 2>&1
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl unzip ca-certificates
curl -fsS https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o /tmp/aws.zip
unzip -q /tmp/aws.zip -d /tmp
/tmp/aws/install
mkdir -p /opt/prashn
aws s3 cp 's3://${ArtifactBucket}/${ArtifactKey}' /tmp/prashn.tar.gz --region '${AWS::Region}' --only-show-errors
echo '${ArtifactDigest}  /tmp/prashn.tar.gz' | sha256sum -c -
tar -xzf /tmp/prashn.tar.gz -C /opt/prashn
export AWS_REGION='${AWS::Region}' DOCUMENT_BUCKET='${Documents}' DYNAMODB_TABLE='${Data}' PROCESSING_QUEUE_URL='${Jobs}'
export JWT_PARAMETER='${JwtParameter}' LOG_GROUP='${ApplicationLogs}' ENTRY='ENTRY_FILE' STACK_NAME='${AWS::StackName}' LOGICAL_RESOURCE='GROUP_NAME'
bash /opt/prashn/infra/bootstrap.sh
bash /opt/prashn/infra/signal-ready.sh
""".replace("ENTRY_FILE",entry).replace("GROUP_NAME",role+"Group")
    resource(role+"Launch","EC2::LaunchTemplate",{"LaunchTemplateData":{"ImageId":ref("UbuntuImage"),"InstanceType":ref("InstanceType"),"IamInstanceProfile":{"Arn":att(role+"Profile","Arn")},
      "MetadataOptions":{"HttpTokens":"required","HttpPutResponseHopLimit":1},"CreditSpecification":{"CpuCredits":"standard"},
      "BlockDeviceMappings":[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3","Encrypted":True,"DeleteOnTermination":True}}],
      "NetworkInterfaces":[{"DeviceIndex":0,"AssociatePublicIpAddress":True,"Groups":[ref(security)]}],"UserData":{"Fn::Base64":sub(userdata)}}})
    props={"MinSize":"1","MaxSize":ref("MaxInstances"),"DesiredCapacity":"1","VPCZoneIdentifier":ref("SubnetIds"),"DefaultInstanceWarmup":300,
      "LaunchTemplate":{"LaunchTemplateId":ref(role+"Launch"),"Version":att(role+"Launch","LatestVersionNumber")},"Tags":[{"Key":"Name","Value":sub("${AWS::StackName}-"+role.lower()),"PropagateAtLaunch":True}]}
    if role=="Api": props.update(TargetGroupARNs=[ref("ApiTargets")],HealthCheckType="ELB",HealthCheckGracePeriod=600)
    resource(role+"Group","AutoScaling::AutoScalingGroup",props, CreationPolicy={"ResourceSignal":{"Count":1,"Timeout":"PT20M"}}, UpdatePolicy={"AutoScalingRollingUpdate":{"MinInstancesInService":1,"MaxBatchSize":1,"PauseTime":"PT20M","WaitOnResourceSignals":True}})
    if role=="Api": resource(role+"RequestScaling","AutoScaling::ScalingPolicy",{"AutoScalingGroupName":ref(role+"Group"),"PolicyType":"TargetTrackingScaling","TargetTrackingConfiguration":{"TargetValue":100,"PredefinedMetricSpecification":{"PredefinedMetricType":"ALBRequestCountPerTarget","ResourceLabel":{"Fn::Join":["/",[att("Balancer","LoadBalancerFullName"),att("ApiTargets","TargetGroupFullName")]]}}}})
resource("QueueScaling","AutoScaling::ScalingPolicy",{"AutoScalingGroupName":ref("WorkerGroup"),"PolicyType":"StepScaling","AdjustmentType":"ChangeInCapacity","EstimatedInstanceWarmup":300,"StepAdjustments":[{"MetricIntervalLowerBound":0,"ScalingAdjustment":1}]})
resource("QueueBacklog","CloudWatch::Alarm",{"Namespace":"AWS/SQS","MetricName":"ApproximateNumberOfMessagesVisible","Dimensions":[{"Name":"QueueName","Value":att("Jobs","QueueName")}],"Statistic":"Average","Period":60,"EvaluationPeriods":2,"Threshold":3,"ComparisonOperator":"GreaterThanOrEqualToThreshold","TreatMissingData":"notBreaching","AlarmActions":[ref("QueueScaling")]})
resource("QueueIdleScaling","AutoScaling::ScalingPolicy",{"AutoScalingGroupName":ref("WorkerGroup"),"PolicyType":"StepScaling","AdjustmentType":"ChangeInCapacity","EstimatedInstanceWarmup":300,"StepAdjustments":[{"MetricIntervalUpperBound":0,"ScalingAdjustment":-1}]})
resource("QueueIdle","CloudWatch::Alarm",{"Metrics":[{"Id":"visible","MetricStat":{"Metric":{"Namespace":"AWS/SQS","MetricName":"ApproximateNumberOfMessagesVisible","Dimensions":[{"Name":"QueueName","Value":att("Jobs","QueueName")}]},"Period":60,"Stat":"Maximum"},"ReturnData":False},{"Id":"inflight","MetricStat":{"Metric":{"Namespace":"AWS/SQS","MetricName":"ApproximateNumberOfMessagesNotVisible","Dimensions":[{"Name":"QueueName","Value":att("Jobs","QueueName")}]},"Period":60,"Stat":"Maximum"},"ReturnData":False},{"Id":"backlog","Expression":"visible + inflight","ReturnData":True}],"EvaluationPeriods":10,"Threshold":1,"ComparisonOperator":"LessThanThreshold","TreatMissingData":"notBreaching","AlarmActions":[ref("QueueIdleScaling")]})
resource("DeadLetterAlarm","CloudWatch::Alarm",{"Namespace":"AWS/SQS","MetricName":"ApproximateNumberOfMessagesVisible","Dimensions":[{"Name":"QueueName","Value":att("DeadLetters","QueueName")}],"Statistic":"Maximum","Period":60,"EvaluationPeriods":1,"Threshold":1,"ComparisonOperator":"GreaterThanOrEqualToThreshold","TreatMissingData":"notBreaching"})
resource("ApiErrors","CloudWatch::Alarm",{"Namespace":"AWS/ApiGateway","MetricName":"5xx","Dimensions":[{"Name":"ApiId","Value":ref("HttpApi")},{"Name":"Stage","Value":"$default"}],"Statistic":"Sum","Period":60,"EvaluationPeriods":2,"Threshold":5,"ComparisonOperator":"GreaterThanOrEqualToThreshold","TreatMissingData":"notBreaching"})

parameters={"VpcId":{"Type":"AWS::EC2::VPC::Id"},"SubnetIds":{"Type":"List<AWS::EC2::Subnet::Id>"},
  "InstanceType":{"Type":"String","Default":"t3.small","AllowedValues":["t3.small","t3.medium"]},"MaxInstances":{"Type":"Number","Default":2,"MinValue":2,"MaxValue":4},
  "UbuntuImage":{"Type":"AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>","Default":"/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"},
  "ArtifactBucket":{"Type":"String","AllowedPattern":"[a-z0-9.-]+"},"ArtifactKey":{"Type":"String","AllowedPattern":"[a-f0-9]{64}\\.tar\\.gz"},"ArtifactDigest":{"Type":"String","AllowedPattern":"[a-f0-9]{64}"},
  "JwtParameter":{"Type":"String","AllowedPattern":"/prashn/[a-z0-9-]+/jwt"}}
outputs={name:{"Value":value} for name,value in {"WebsiteUrl":sub("https://${Distribution.DomainName}"),"DistributionId":ref("Distribution"),"DocumentBucket":ref("Documents"),"FrontendBucket":ref("Frontend"),"DataTable":ref("Data"),"QueueUrl":ref("Jobs"),"DeadLetterQueue":ref("DeadLetters"),"ApiGroup":ref("ApiGroup"),"WorkerGroup":ref("WorkerGroup"),"ApplicationLogGroup":ref("ApplicationLogs"),"ApiUrl":sub("https://${HttpApi}.execute-api.${AWS::Region}.${AWS::URLSuffix}")}.items()}
template={"AWSTemplateFormatVersion":"2010-09-09","Description":"Prashn S3, DynamoDB, SQS workers, scalable API, private routing and HTTPS frontend", "Parameters":parameters,"Resources":resources,"Outputs":outputs}
Path(__file__).with_name('template.json').write_text(json.dumps(template,indent=2)+'\n',encoding='utf-8')
