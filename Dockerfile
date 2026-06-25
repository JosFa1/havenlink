# HavenLink container image (AWS App Runner / ECS / EB Docker platform).
# Multi-stage: build TypeScript, then ship a slim production runtime.

FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
# Reuse the already-built native modules (e.g. argon2) from the builder, then
# drop dev dependencies to slim the image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY public ./public
# tsc does not emit .sql; place the schema next to the compiled migrator.
COPY src/db/schema.sql ./dist/db/schema.sql
RUN npm prune --omit=dev

EXPOSE 3000
USER node
# Apply the (idempotent) schema, then start. Runs inside the VPC so it can reach RDS.
CMD ["sh", "-c", "npm run migrate:prod && node dist/app.js"]
