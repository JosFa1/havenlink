# HavenLink container image (AWS App Runner / ECS / EB Docker platform).
# Multi-stage: build TypeScript, then ship a slim production runtime.

FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY knowledge-tools/buildKnowledge.js ./knowledge-tools/buildKnowledge.js
RUN mkdir -p knowledge-tools/output
RUN node knowledge-tools/buildKnowledge.js
RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
ENV PGSSLROOTCERT=/app/certs/us-east-1-bundle.pem
WORKDIR /app
COPY package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/certs \
  && curl -fsSL https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem -o /app/certs/us-east-1-bundle.pem
# Reuse the already-built native modules (e.g. argon2) from the builder, then
# drop dev dependencies to slim the image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY public ./public
# The chatbot reads knowledge-tools/output/site.json at runtime.
COPY --from=builder /app/knowledge-tools/output ./knowledge-tools/output
# tsc does not emit .sql; place the schema next to the compiled migrator.
COPY src/db/schema.sql ./dist/db/schema.sql
# Committed resource-finder data artifacts (read by dist/db/seedResources.js at boot).
# tsc does not copy src/data into dist, so ship the source-tree copy the seed resolves.
COPY src/data ./src/data
RUN npm prune --omit=dev

EXPOSE 3000
USER node
# Apply the (idempotent) schema, load the (change-gated) resource data, then start.
# Runs inside the VPC so it can reach RDS.
CMD ["sh", "-c", "npm run migrate:prod && npm run seed:prod && node dist/app.js"]
