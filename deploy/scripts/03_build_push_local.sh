#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need ECR_REPOSITORY
need IMAGE_TAG
ACCOUNT_ID="$(aws_account_id)"
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY"
IMAGE_URI="$ECR_URI:$IMAGE_TAG"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build -t "$IMAGE_URI" "$ROOT_DIR"
docker push "$IMAGE_URI"
upsert_generated AWS_ACCOUNT_ID "$ACCOUNT_ID"
upsert_generated ECR_URI "$ECR_URI"
upsert_generated IMAGE_URI "$IMAGE_URI"
echo "Image pushed: $IMAGE_URI"
