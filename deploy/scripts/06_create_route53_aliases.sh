#!/usr/bin/env bash
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
load_env
need AWS_REGION
need STACK_NAME
need DOMAIN_NAME
if [ -z "${HOSTED_ZONE_ID:-}" ]; then
  HOSTED_ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN_NAME" --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')"
fi
if [ -z "$HOSTED_ZONE_ID" ] || [ "$HOSTED_ZONE_ID" = "None" ]; then
  echo "Missing HOSTED_ZONE_ID."
  exit 1
fi
ALB_DNS="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text)"
ALB_ZONE="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerCanonicalHostedZoneId'].OutputValue" --output text)"
EXISTING="$(aws route53 list-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --query "ResourceRecordSets[?Name=='${DOMAIN_NAME}.' || Name=='www.${DOMAIN_NAME}.']" \
  --output json)"
"$PYTHON_BIN" - "$DOMAIN_NAME" "$ALB_DNS" "$ALB_ZONE" "$EXISTING" > "$ROOT_DIR/deploy/tmp-route53-alias.json" <<'PY'
import json, sys
domain, dns, zone = sys.argv[1:4]
existing = json.loads(sys.argv[4])
changes = []

# A CNAME cannot coexist with an A alias at the same name. Delete only those
# exact conflicting records before atomically upserting the ALB aliases.
for record in existing:
    if record["Type"] == "CNAME" and record["Name"].rstrip(".") in {
        domain,
        "www." + domain,
    }:
        changes.append({"Action": "DELETE", "ResourceRecordSet": record})

for name in [domain, 'www.' + domain]:
    changes.append({"Action":"UPSERT","ResourceRecordSet":{"Name":name,"Type":"A","AliasTarget":{"HostedZoneId":zone,"DNSName":dns,"EvaluateTargetHealth":False}}})
print(json.dumps({"Changes": changes}))
PY
aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch "$(aws_file_uri "$ROOT_DIR/deploy/tmp-route53-alias.json")" >/dev/null
upsert_generated HOSTED_ZONE_ID "$HOSTED_ZONE_ID"
echo "Route 53 aliases updated for $DOMAIN_NAME and www.$DOMAIN_NAME"
