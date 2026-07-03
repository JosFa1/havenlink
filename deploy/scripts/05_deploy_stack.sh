#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need STACK_NAME
need APP_NAME
need DOMAIN_NAME
need VPC_ID
need PUBLIC_SUBNETS
need ECS_SECURITY_GROUP_ID
need CONTAINER_PORT
need DESIRED_COUNT
need TASK_CPU
need TASK_MEMORY
need GOOGLE_CLIENT_ID
need GOOGLE_CALLBACK_URL
need EMAIL_FROM
need SMTP_HOST
need SMTP_PORT
need SMTP_SECURE
need SMTP_USER
need DATABASE_URL_SECRET_ARN
need SESSION_SECRET_SECRET_ARN
need GOOGLE_CLIENT_SECRET_SECRET_ARN
need SMTP_PASSWORD_SECRET_ARN
if [ -z "${IMAGE_URI:-}" ]; then
  ACCOUNT_ID="$(aws_account_id)"
  IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
fi
CERT="${CERTIFICATE_ARN:-}"
aws cloudformation deploy \
  --stack-name "$STACK_NAME" \
  --template-file "$ROOT_DIR/deploy/cloudformation/havenlink-ecs-fargate.yml" \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AppName="$APP_NAME" \
    DomainName="$DOMAIN_NAME" \
    VpcId="$VPC_ID" \
    PublicSubnets="$PUBLIC_SUBNETS" \
    EcsSecurityGroupId="$ECS_SECURITY_GROUP_ID" \
    ImageUri="$IMAGE_URI" \
    ContainerPort="$CONTAINER_PORT" \
    DesiredCount="$DESIRED_COUNT" \
    TaskCpu="$TASK_CPU" \
    TaskMemory="$TASK_MEMORY" \
    CertificateArn="$CERT" \
    DatabaseUrlSecretArn="$DATABASE_URL_SECRET_ARN" \
    SessionSecretSecretArn="$SESSION_SECRET_SECRET_ARN" \
    GoogleClientSecretSecretArn="$GOOGLE_CLIENT_SECRET_SECRET_ARN" \
    SmtpPasswordSecretArn="$SMTP_PASSWORD_SECRET_ARN" \
    GoogleClientId="$GOOGLE_CLIENT_ID" \
    GoogleCallbackUrl="$GOOGLE_CALLBACK_URL" \
    EmailFrom="$EMAIL_FROM" \
    SmtpHost="$SMTP_HOST" \
    SmtpPort="$SMTP_PORT" \
    SmtpSecure="$SMTP_SECURE" \
    SmtpUser="$SMTP_USER"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs' --output table
