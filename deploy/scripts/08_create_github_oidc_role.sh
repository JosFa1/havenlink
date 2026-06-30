#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need GITHUB_OWNER
need GITHUB_REPO
need GITHUB_BRANCH
need STACK_NAME
ACCOUNT_ID="$(aws_account_id)"
PROVIDER_ARN="arn:aws:iam::$ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  true
else
  aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
fi
cat > "$ROOT_DIR/deploy/tmp-github-trust.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"$PROVIDER_ARN"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},"StringLike":{"token.actions.githubusercontent.com:sub":"repo:$GITHUB_OWNER/$GITHUB_REPO:ref:refs/heads/$GITHUB_BRANCH"}}}]}
JSON
ROLE_NAME="github-actions-havenlink-deploy"
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "$(aws_file_uri "$ROOT_DIR/deploy/tmp-github-trust.json")" >/dev/null
else
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "$(aws_file_uri "$ROOT_DIR/deploy/tmp-github-trust.json")" >/dev/null
fi
cat > "$ROOT_DIR/deploy/tmp-github-policy.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":"*"},{"Effect":"Allow","Action":["ecr:BatchCheckLayerAvailability","ecr:BatchGetImage","ecr:CompleteLayerUpload","ecr:CreateRepository","ecr:DescribeRepositories","ecr:InitiateLayerUpload","ecr:PutImage","ecr:UploadLayerPart"],"Resource":"*"},{"Effect":"Allow","Action":["cloudformation:CreateStack","cloudformation:UpdateStack","cloudformation:DescribeStacks","cloudformation:DescribeStackEvents","cloudformation:DescribeChangeSet","cloudformation:CreateChangeSet","cloudformation:ExecuteChangeSet","cloudformation:DeleteChangeSet","cloudformation:GetTemplateSummary"],"Resource":"*"},{"Effect":"Allow","Action":["iam:CreateRole","iam:GetRole","iam:PassRole","iam:PutRolePolicy","iam:AttachRolePolicy","iam:TagRole","iam:UpdateAssumeRolePolicy"],"Resource":"*"},{"Effect":"Allow","Action":["ecs:*","elasticloadbalancing:*","ec2:Describe*","ec2:AuthorizeSecurityGroupIngress","ec2:CreateSecurityGroup","ec2:RevokeSecurityGroupIngress","logs:CreateLogGroup","logs:PutRetentionPolicy","application-autoscaling:*"],"Resource":"*"},{"Effect":"Allow","Action":["secretsmanager:DescribeSecret","secretsmanager:GetSecretValue","kms:Decrypt"],"Resource":"*"}]}
JSON
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name havenlink-github-deploy --policy-document "$(aws_file_uri "$ROOT_DIR/deploy/tmp-github-policy.json")" >/dev/null
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"
upsert_generated GITHUB_AWS_ROLE_ARN "$ROLE_ARN"
echo "GitHub AWS role ARN: $ROLE_ARN"
