#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need DATABASE_URL
need SESSION_SECRET
need GOOGLE_CLIENT_SECRET
need SMTP_PASSWORD
put_secret() {
  local name="$1"
  local value="$2"
  if aws secretsmanager describe-secret --secret-id "$name" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id "$name" --secret-string "$value" --region "$AWS_REGION" >/dev/null
  else
    aws secretsmanager create-secret --name "$name" --secret-string "$value" --region "$AWS_REGION" >/dev/null
  fi
  secret_arn "$name"
}
DATABASE_URL_SECRET_ARN="$(put_secret "/havenlink/prod/DATABASE_URL" "$DATABASE_URL")"
SESSION_SECRET_SECRET_ARN="$(put_secret "/havenlink/prod/SESSION_SECRET" "$SESSION_SECRET")"
GOOGLE_CLIENT_SECRET_SECRET_ARN="$(put_secret "/havenlink/prod/GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET")"
SMTP_PASSWORD_SECRET_ARN="$(put_secret "/havenlink/prod/SMTP_PASSWORD" "$SMTP_PASSWORD")"
upsert_generated DATABASE_URL_SECRET_ARN "$DATABASE_URL_SECRET_ARN"
upsert_generated SESSION_SECRET_SECRET_ARN "$SESSION_SECRET_SECRET_ARN"
upsert_generated GOOGLE_CLIENT_SECRET_SECRET_ARN "$GOOGLE_CLIENT_SECRET_SECRET_ARN"
upsert_generated SMTP_PASSWORD_SECRET_ARN "$SMTP_PASSWORD_SECRET_ARN"
echo "Secrets created or updated. ARNs saved to .env.generated."
