#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need STACK_NAME
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query 'Stacks[0].Outputs' --output table
CLUSTER="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue" --output text)"
SERVICE="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue" --output text)"
aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$AWS_REGION" --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount,status:status}' --output table
ALB_DNS="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text)"
echo "Temporary endpoint: http://$ALB_DNS"
echo "Final endpoint: https://${DOMAIN_NAME:-havenlink.org}"
