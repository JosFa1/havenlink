# Enabling the "Ask Haven" chatbot in production

The chatbot works locally (via the developer's `gcloud` Application Default
Credentials) but **returns an error in prod** because the ECS task has no Google
credentials. Prod uses **Vertex AI** (`GEMINI_USE_VERTEX=true`, project
`havenlink-500500`), which needs a **service-account key** delivered to the
container as the `GEMINI_SA_KEY` env var.

Everything in code and infrastructure is already wired for this. The only thing
missing is the secret itself. Once the two steps below are done, the next deploy
turns the chatbot on automatically — the CloudFormation template includes
`GEMINI_SA_KEY` only when its ARN is non-empty (the `HasGeminiSaKey` condition in
`deploy/cloudformation/havenlink-ecs-fargate.yml`).

## Prerequisites (already true per prior setup — verify if unsure)
- GCP project `havenlink-500500`, **Vertex AI API enabled**, billing linked.
- Service account `havenlink-vertex@havenlink-500500.iam.gserviceaccount.com`
  with role `roles/aiplatform.user`.

---

## Step 1 — Mint the service-account key (needs GCP access to `havenlink-500500`)

```bash
gcloud iam service-accounts keys create havenlink-vertex-key.json \
  --iam-account=havenlink-vertex@havenlink-500500.iam.gserviceaccount.com \
  --project=havenlink-500500
```

`havenlink-vertex-key.json` is now a long-lived credential — **never commit it**.
The app expects the *entire JSON* as the value of `GEMINI_SA_KEY`
(`src/chat/routes.ts` does `JSON.parse(GEMINI_SA_KEY)`).

## Step 2 — Store it in AWS Secrets Manager (needs owner access to account 930218373857)

Store the file's **raw JSON as the plaintext secret value** (not key/value pairs),
in **us-east-1**:

```bash
aws secretsmanager create-secret \
  --name havenlink/gemini-sa-key \
  --description "Vertex AI service-account key JSON for Ask Haven" \
  --secret-string file://havenlink-vertex-key.json \
  --region us-east-1 \
  --query ARN --output text
```

Copy the printed ARN, e.g.
`arn:aws:secretsmanager:us-east-1:930218373857:secret:havenlink/gemini-sa-key-AbCdEf`.
Then delete the local `havenlink-vertex-key.json`.

> The task-execution role is already granted `secretsmanager:GetSecretValue` on
> this ARN by the template once it's wired (Step 3).

## Step 3 — Wire the ARN into the deploy (repo access is enough — no admin needed)

Pick **one**:

- **Option A (simplest, push access only):** paste the ARN directly into
  `.github/workflows/deploy-havenlink.yml`, replacing
  `GeminiSaKeySecretArn="${{ secrets.GEMINI_SA_KEY_SECRET_ARN }}"` with
  `GeminiSaKeySecretArn="arn:aws:secretsmanager:us-east-1:930218373857:secret:havenlink/gemini-sa-key-AbCdEf"`.
  The ARN is not sensitive.

- **Option B (needs repo admin):** set a repository **Actions secret** named
  `GEMINI_SA_KEY_SECRET_ARN` to that ARN. The workflow already references it, so
  no code change is required.

## Step 4 — Deploy and verify

Push to `prod` (or re-run the Deploy workflow). After it succeeds:

```bash
curl -sS -X POST https://havenlink.org/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is HavenLink?"}'
```

A real answer in `{"reply":"…"}` means it's live. A 500 means the key/permission
is wrong; a 503 means `GEMINI_SA_KEY` still isn't reaching the container (re-check
Steps 2–3).

## Security notes
- The SA key is long-lived. Keep it only in Secrets Manager; rotate periodically
  (`gcloud iam service-accounts keys create` a new one, update the secret, delete
  the old key id).
- Keep the SA scoped to `roles/aiplatform.user` only.
