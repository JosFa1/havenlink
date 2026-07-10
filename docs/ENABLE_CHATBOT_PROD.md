# "Ask Haven" chatbot — production credentials

The chatbot uses **Vertex AI** in prod (`GEMINI_USE_VERTEX=true`, project
`havenlink-500500`), authenticated with a GCP **service-account key** delivered to
the ECS task as the `GEMINI_SA_KEY` env var (see `src/chat/routes.ts`).

## Current wiring (2026-07-10)

The key JSON is stored in AWS Secrets Manager in the deploy account
(`930218373857`) as:

```
arn:aws:secretsmanager:us-east-1:930218373857:secret:havenlink/gemini-sa-key-IMpmoT
```

The deploy workflow passes this ARN as `GeminiSaKeySecretArn`. It prefers the
`GEMINI_SA_KEY_SECRET_ARN` GitHub Actions secret if set, and otherwise falls back
to the literal ARN above:

```yaml
GeminiSaKeySecretArn="${{ secrets.GEMINI_SA_KEY_SECRET_ARN || 'arn:aws:secretsmanager:us-east-1:930218373857:secret:havenlink/gemini-sa-key-IMpmoT' }}"
```

The CloudFormation template only wires `GEMINI_SA_KEY` (and its
`secretsmanager:GetSecretValue` grant) when the ARN is non-empty — the
`HasGeminiSaKey` condition in `deploy/cloudformation/havenlink-ecs-fargate.yml`.

> A secret **ARN is not sensitive** (it's an identifier; the key value is
> protected by IAM), so keeping it literal in the workflow is fine on a private
> repo. To avoid the literal, set a repo Actions secret `GEMINI_SA_KEY_SECRET_ARN`
> to the same ARN and the `||` fallback above becomes moot.

## Verify

After a deploy:

```bash
curl -sS -X POST https://havenlink.org/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is HavenLink?"}'
```

A real answer in `{"reply":"…"}` means it's live. `503` means `GEMINI_SA_KEY`
isn't reaching the container (ARN empty / condition false). `500` means the key
or its GCP permissions are invalid — mint a fresh key and update the secret:

```bash
# GCP (project havenlink-500500)
gcloud iam service-accounts keys create key.json \
  --iam-account=havenlink-vertex@havenlink-500500.iam.gserviceaccount.com \
  --project=havenlink-500500
# AWS (account 930218373857, us-east-1) — update the existing secret in place
aws secretsmanager put-secret-value \
  --secret-id havenlink/gemini-sa-key \
  --secret-string file://key.json --region us-east-1
rm key.json
```

Keep the service account scoped to `roles/aiplatform.user`; rotate keys periodically.
