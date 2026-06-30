#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created .env.local from .env.example. Fill it in, then rerun this script."
  exit 1
fi
load_env
need AWS_REGION
need APP_NAME
need STACK_NAME
need VPC_ID
need PUBLIC_SUBNETS
need ECS_SECURITY_GROUP_ID
need RDS_SECURITY_GROUP_ID
need ECR_REPOSITORY
need DOMAIN_NAME
aws sts get-caller-identity --region "$AWS_REGION" >/dev/null
aws --version
echo "AWS account: $(aws_account_id)"
echo "Region: $AWS_REGION"
echo "Stack: $STACK_NAME"
echo "VPC: $VPC_ID"
echo "Subnets: $PUBLIC_SUBNETS"
if command -v docker >/dev/null 2>&1; then
  docker --version
else
  echo "Docker not found. Local image build will be skipped unless you install Docker or use GitHub Actions."
fi
if command -v openssl >/dev/null 2>&1; then
  true
else
  echo "OpenSSL not found. Generate SESSION_SECRET another way."
fi
