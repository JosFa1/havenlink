#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need ECR_REPOSITORY
need RDS_SECURITY_GROUP_ID
need ECS_SECURITY_GROUP_ID
ACCOUNT_ID="$(aws_account_id)"
if aws ecr describe-repositories --repository-names "$ECR_REPOSITORY" --region "$AWS_REGION" >/dev/null 2>&1; then
  true
else
  aws ecr create-repository --repository-name "$ECR_REPOSITORY" --image-scanning-configuration scanOnPush=true --region "$AWS_REGION" >/dev/null
fi
aws ec2 authorize-security-group-ingress --group-id "$RDS_SECURITY_GROUP_ID" --protocol tcp --port 5432 --source-group "$ECS_SECURITY_GROUP_ID" --region "$AWS_REGION" >/dev/null 2>&1 || true
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY"
upsert_generated AWS_ACCOUNT_ID "$ACCOUNT_ID"
upsert_generated ECR_URI "$ECR_URI"
echo "ECR repository ready: $ECR_URI"
echo "RDS security group ingress was checked."
