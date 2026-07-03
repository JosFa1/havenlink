#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need DOMAIN_NAME
if [ -n "${CERTIFICATE_ARN:-}" ]; then
  upsert_generated CERTIFICATE_ARN "$CERTIFICATE_ARN"
  echo "Using existing certificate: $CERTIFICATE_ARN"
  exit 0
fi
if [ -z "${HOSTED_ZONE_ID:-}" ]; then
  HOSTED_ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN_NAME" --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')"
fi
if [ -z "$HOSTED_ZONE_ID" ] || [ "$HOSTED_ZONE_ID" = "None" ]; then
  echo "Missing HOSTED_ZONE_ID. Create or find the Route 53 hosted zone first."
  exit 1
fi
TOKEN="$(printf '%s' "$DOMAIN_NAME" | tr -cd '[:alnum:]' | cut -c1-20)$(date +%s)"
CERT_ARN="$(aws acm request-certificate --domain-name "$DOMAIN_NAME" --subject-alternative-names "www.$DOMAIN_NAME" --validation-method DNS --idempotency-token "$TOKEN" --query CertificateArn --output text --region "$AWS_REGION")"
sleep 10
for i in 1 2 3 4 5 6; do
  RECORDS="$(aws acm describe-certificate --certificate-arn "$CERT_ARN" --region "$AWS_REGION" --query 'Certificate.DomainValidationOptions[].ResourceRecord.[Name,Type,Value]' --output text || true)"
  if [ -n "$RECORDS" ]; then
    break
  fi
  sleep 10
done
"$PYTHON_BIN" - "$RECORDS" > "$ROOT_DIR/deploy/tmp-acm-change.json" <<'PY'
import json, sys
text = sys.argv[1]
changes = []
seen = set()
parts = [line.split('\t') for line in text.splitlines() if line.strip()]
for row in parts:
    if len(row) != 3:
        continue
    name, typ, value = row
    key = (name, typ, value)
    if key in seen:
        continue
    seen.add(key)
    changes.append({"Action":"UPSERT","ResourceRecordSet":{"Name":name,"Type":typ,"TTL":300,"ResourceRecords":[{"Value":value}]}})
print(json.dumps({"Changes": changes}))
PY
aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch "$(aws_file_uri "$ROOT_DIR/deploy/tmp-acm-change.json")" >/dev/null
aws acm wait certificate-validated --certificate-arn "$CERT_ARN" --region "$AWS_REGION"
upsert_generated HOSTED_ZONE_ID "$HOSTED_ZONE_ID"
upsert_generated CERTIFICATE_ARN "$CERT_ARN"
echo "Certificate issued: $CERT_ARN"
