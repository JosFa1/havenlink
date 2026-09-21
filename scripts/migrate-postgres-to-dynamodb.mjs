import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { Pool } = pg;
const region = process.env.AWS_REGION || "us-east-1";
const table = process.env.DDB_TABLE || "havenlink-prod-data";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });
const checkpointArg = process.argv.find((a) => a.startsWith("--checkpoint="))?.slice(13);
const mode = process.argv.find((a) => a.startsWith("--mode="))?.slice(7) || "backfill";
const failOnMismatch = process.argv.includes("--fail-on-mismatch");
const strictSessions = process.argv.includes("--strict-sessions");
const once = process.argv.includes("--once");
const batchSize = Number(process.argv.find((a) => a.startsWith("--batch-size="))?.slice(13) || 100);
const pollMs = Number(process.argv.find((a) => a.startsWith("--poll-ms="))?.slice(11) || 2000);
const s3 = new S3Client({ region });
function parseS3(uri) { const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri || ""); return m ? { Bucket: m[1], Key: m[2] } : null; }
async function loadCheckpoint() { const ref = parseS3(checkpointArg); if (!ref) return {}; try { const out = await s3.send(new GetObjectCommand(ref)); return JSON.parse(await out.Body.transformToString()); } catch (e) { if (e.name === "NoSuchKey") return {}; throw e; } }
async function saveCheckpoint(value) { const ref = parseS3(checkpointArg); if (!ref) return; await s3.send(new PutObjectCommand({ ...ref, Body: JSON.stringify(value), ContentType: "application/json", ServerSideEncryption: "AES256" })); }
const now = () => new Date().toISOString();
const userKey = (id) => ({ PK: `USER#${id}`, SK: "PROFILE" });
async function put(item, condition, values) {
  await ddb.send(new PutCommand({
    TableName: table,
    Item: item,
    ...(condition ? { ConditionExpression: condition, ExpressionAttributeValues: values } : {}),
  }));
}
function userItem(r) { return { ...userKey(r.id), EmailPK: `EMAIL#${String(r.email).toLowerCase()}`, EmailSK: `USER#${r.id}`, ...(r.google_sub ? { GooglePK: `GOOGLE#${r.google_sub}`, GoogleSK: `USER#${r.id}` } : {}), id: r.id, email: String(r.email).toLowerCase(), email_verified: r.email_verified, password_hash: r.password_hash, google_sub: r.google_sub, newsletter_prompt_pending: r.newsletter_prompt_pending, newsletter_subscribed: r.newsletter_subscribed, state: r.state, intake_completed: r.intake_completed, intake_completed_at: r.intake_completed_at?.toISOString?.() ?? r.intake_completed_at, home_study_path: r.home_study_path, home_study_result: r.home_study_result, home_study_completed_at: r.home_study_completed_at?.toISOString?.() ?? r.home_study_completed_at, matched_agency_id: r.matched_agency_id, match_score: r.match_score, matched_at: r.matched_at?.toISOString?.() ?? r.matched_at, created_at: r.created_at?.toISOString?.() ?? r.created_at, updated_at: r.updated_at?.toISOString?.() ?? r.updated_at } }
async function backfillUsers(cp) { let offset = cp.users || 0; for (;;) { const { rows } = await pool.query("SELECT * FROM users ORDER BY id LIMIT 250 OFFSET $1", [offset]); if (!rows.length) break; for (const r of rows) { await put(userItem(r)); await put({ PK: `UNIQUE#EMAIL#${String(r.email).toLowerCase()}`, SK: "LOCK" }); if (r.google_sub) await put({ PK: `UNIQUE#GOOGLE#${r.google_sub}`, SK: "LOCK" }); } offset += rows.length; cp.users = offset; await saveCheckpoint(cp); } }
async function backfillSessions(cp) { let offset = cp.sessions || 0; for (;;) { const { rows } = await pool.query('SELECT sid, sess, expire FROM "session" ORDER BY sid LIMIT 250 OFFSET $1', [offset]); if (!rows.length) break; for (const r of rows) { const expire = new Date(r.expire); await put({ PK: `SESSION#${r.sid}`, SK: "SESSION", session: typeof r.sess === "string" ? r.sess : JSON.stringify(r.sess), expiresAt: Math.floor(expire.getTime() / 1000) }); } offset += rows.length; cp.sessions = offset; await saveCheckpoint(cp); } }
async function backfillTokens(cp) { let offset = cp.tokens || 0; for (;;) { const { rows } = await pool.query("SELECT * FROM email_verification_tokens ORDER BY id LIMIT 250 OFFSET $1", [offset]); if (!rows.length) break; for (const r of rows) { const expiry = new Date(r.expires_at); await put({ PK: `TOKEN#${r.token_hash}`, SK: "TOKEN", TokenUserPK: `USER#${r.user_id}`, TokenUserSK: `${new Date(r.created_at).toISOString()}#${r.token_hash}`, user_id: r.user_id, token_hash: r.token_hash, expires_at: expiry.toISOString(), expiresAt: Math.floor(expiry.getTime() / 1000), used_at: r.used_at?.toISOString?.() ?? r.used_at }); } offset += rows.length; cp.tokens = offset; await saveCheckpoint(cp); } }
async function backfillResults(cp) { let offset = cp.results || 0; for (;;) { const { rows } = await pool.query("SELECT * FROM calculator_results ORDER BY id LIMIT 250 OFFSET $1", [offset]); if (!rows.length) break; for (const r of rows) await put({ PK: `USER#${r.user_id}`, SK: `CALC#${String(r.version).padStart(10, "0")}`, id: r.id, version: r.version, inputs: r.inputs, result: r.result, created_at: new Date(r.created_at).toISOString() }); offset += rows.length; cp.results = offset; await saveCheckpoint(cp); } }
async function syncSessions() {
  const { rows } = await pool.query('SELECT sid, sess, expire FROM "session" WHERE expire > now() ORDER BY sid');
  for (const r of rows) {
    const expire = new Date(r.expire);
    await put({ PK: `SESSION#${r.sid}`, SK: "SESSION", session: typeof r.sess === "string" ? r.sess : JSON.stringify(r.sess), expiresAt: Math.floor(expire.getTime() / 1000) });
  }
  return rows.length;
}
async function ensureOutbox() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS havenlink_outbox (
      id bigserial PRIMARY KEY,
      aggregate_type text NOT NULL,
      aggregate_id uuid NOT NULL,
      event_type text NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      processed_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      last_error text
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_havenlink_outbox_pending ON havenlink_outbox (id) WHERE processed_at IS NULL");
  console.log("outbox schema is ready");
}
function eventUserItem(event) {
  const r = event.payload;
  const item = userItem(r);
  // The outbox sequence is a monotonic entity version.  It makes replay safe
  // and prevents an older retry from overwriting a newer user projection.
  item.entity_version = Number(event.id);
  return item;
}
async function applyUserEvent(event) {
  if (!event.payload || !event.payload.id) throw new Error(`Outbox event ${event.id} has no user payload`);
  const item = eventUserItem(event);
  const version = Number(event.id);
  const existing = await ddb.send(new GetCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK }, ConsistentRead: true }));
  if (Number(existing.Item?.entity_version || 0) >= version) return;
  const writes = [{
    Put: {
      TableName: table,
      Item: item,
      ConditionExpression: "attribute_not_exists(entity_version) OR entity_version < :version",
      ExpressionAttributeValues: { ":version": version },
    },
  }, {
    Put: { TableName: table, Item: { PK: `UNIQUE#EMAIL#${item.email}`, SK: "LOCK" } },
  }];
  if (item.google_sub) writes.push({ Put: { TableName: table, Item: { PK: `UNIQUE#GOOGLE#${item.google_sub}`, SK: "LOCK" } } });
  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: writes }));
  } catch (error) {
    // Another worker may have won the race.  Re-read before deciding this is a
    // real failure, so an acknowledged DynamoDB write is never replayed forever.
    if (error?.name === "TransactionCanceledException") {
      const after = await ddb.send(new GetCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK }, ConsistentRead: true }));
      if (Number(after.Item?.entity_version || 0) >= version) return;
    }
    throw error;
  }
}
async function applyCalculatorEvent(event) {
  const r = event.payload;
  if (!r?.user_id || r.version === undefined || !r.id) throw new Error(`Outbox event ${event.id} has no calculator payload`);
  const item = {
    PK: `USER#${r.user_id}`,
    SK: `CALC#${String(r.version).padStart(10, "0")}`,
    id: r.id,
    version: Number(r.version),
    inputs: r.inputs,
    result: r.result,
    created_at: new Date(r.created_at).toISOString(),
    entity_version: Number(event.id),
  };
  const existing = await ddb.send(new GetCommand({ TableName: table, Key: { PK: item.PK, SK: item.SK }, ConsistentRead: true }));
  if (Number(existing.Item?.entity_version || 0) >= Number(event.id)) return;
  try {
    await put(item, "attribute_not_exists(entity_version) OR entity_version < :version", { ":version": Number(event.id) });
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return;
    throw error;
  }
}
async function applyEvent(event) {
  switch (event.event_type) {
    case "user.created":
    case "user.updated":
    case "user.google_linked":
      return applyUserEvent(event);
    case "calculator.saved":
      return applyCalculatorEvent(event);
    default:
      throw new Error(`Unsupported outbox event type: ${event.event_type}`);
  }
}
async function markProcessed(id) {
  await pool.query("UPDATE havenlink_outbox SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1 AND processed_at IS NULL", [id]);
}
async function markFailed(id, error) {
  await pool.query("UPDATE havenlink_outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1 AND processed_at IS NULL", [id, String(error?.message || error).slice(0, 2000)]);
}
async function replicateOnce() {
  const syncedSessions = await syncSessions();
  const { rows } = await pool.query("SELECT id, event_type, payload FROM havenlink_outbox WHERE processed_at IS NULL ORDER BY id LIMIT $1", [batchSize]);
  let processed = 0;
  for (const event of rows) {
    try {
      await applyEvent(event);
      await markProcessed(event.id);
      processed += 1;
    } catch (error) {
      await markFailed(event.id, error);
      console.error(`Outbox event ${event.id} failed:`, error?.message || error);
      throw error;
    }
  }
  console.log(`replication: sessions_synced=${syncedSessions} outbox_processed=${processed} outbox_pending=${rows.length - processed}`);
  return rows.length;
}
async function replicate() {
  do {
    const count = await replicateOnce();
    if (once || count === 0 && once) break;
    if (count === 0) await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (!once);
}
async function scanAll() {
  const items = [];
  let start;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey: start }));
    items.push(...(out.Items || []));
    start = out.LastEvaluatedKey;
  } while (start);
  return items;
}
async function verify() {
  const [target, users, sessions, tokens, results] = await Promise.all([
    scanAll(),
    pool.query("SELECT id FROM users"),
    pool.query('SELECT sid FROM "session" WHERE expire > now()'),
    pool.query("SELECT token_hash FROM email_verification_tokens WHERE expires_at > now()"),
    pool.query("SELECT user_id, version FROM calculator_results"),
  ]);
  const targetUsers = new Set(target.filter((r) => String(r.SK) === "PROFILE").map((r) => String(r.id)));
  const targetSessions = new Set(target.filter((r) => String(r.SK) === "SESSION" && Number(r.expiresAt) > Math.floor(Date.now() / 1000)).map((r) => String(r.PK).slice("SESSION#".length)));
  const targetTokens = new Set(target.filter((r) => String(r.SK) === "TOKEN" && Number(r.expiresAt) > Math.floor(Date.now() / 1000)).map((r) => String(r.token_hash)));
  const targetResults = new Set(target.filter((r) => String(r.SK).startsWith("CALC#")).map((r) => `${String(r.PK)}#${Number(r.version)}`));
  const checks = [
    ["users", users.rows.map((r) => String(r.id)), targetUsers],
    ["sessions", sessions.rows.map((r) => String(r.sid)), targetSessions],
    ["tokens", tokens.rows.map((r) => String(r.token_hash)), targetTokens],
    ["results", results.rows.map((r) => `${String(r.user_id)}#${Number(r.version)}`), targetResults],
  ];
  let bad = false;
  for (const [name, expected, actual] of checks) {
    const missing = expected.filter((key) => !actual.has(key));
    const extras = actual.size - expected.length + missing.length;
    console.log(`${name}: source=${expected.length} target=${actual.size} missing=${missing.length} extras=${Math.max(0, extras)}`);
    if (missing.length && (name !== "sessions" || strictSessions)) {
      console.error(`${name} missing keys: ${missing.slice(0, 10).join(",")}`);
      bad = true;
    }
  }
  if (bad && failOnMismatch) process.exitCode = 2;
}
try { const cp = await loadCheckpoint(); if (mode === "backfill") { await backfillUsers(cp); await backfillSessions(cp); await backfillTokens(cp); await backfillResults(cp); } else if (mode === "verify") await verify(); else if (mode === "replicate") await replicate(); else if (mode === "ensure-outbox") await ensureOutbox(); else throw new Error(`Unsupported mode: ${mode}`); } finally { await pool.end(); }
