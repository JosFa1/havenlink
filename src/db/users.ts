import crypto from "crypto";
import * as postgres from "./users-postgres";
import {
  EMAIL_INDEX, GOOGLE_INDEX, asDate, emailIndexKey, getItem, googleIndexKey, isoNow,
  key, queryIndex, transactWrite, updateItem,
} from "./dynamo";

export type HomeStudyPath = "completed" | "screener";
export type HomeStudyResult = "PASSED" | "NOT_YET_ELIGIBLE" | "INTERNATIONAL";

export interface User {
  id: string; email: string; email_verified: boolean; password_hash: string | null;
  google_sub: string | null; newsletter_prompt_pending: boolean;
  newsletter_subscribed: boolean; state: string | null; intake_completed: boolean;
  intake_completed_at: Date | null; home_study_path: HomeStudyPath | null;
  home_study_result: HomeStudyResult | null; home_study_completed_at: Date | null;
  matched_agency_id: string | null; match_score: number | null; matched_at: Date | null;
  created_at: Date; updated_at: Date;
}

type UserItem = Record<string, unknown> & { PK: string; SK: string; id: string; email: string; created_at: string; updated_at: string };
const profileKey = (id: string) => key(`USER#${id}`);

function fromItem(item: UserItem | null | undefined): User | null {
  if (!item) return null;
  return {
    id: item.id, email: item.email, email_verified: Boolean(item.email_verified),
    password_hash: (item.password_hash as string | null | undefined) ?? null,
    google_sub: (item.google_sub as string | null | undefined) ?? null,
    newsletter_prompt_pending: Boolean(item.newsletter_prompt_pending),
    newsletter_subscribed: Boolean(item.newsletter_subscribed),
    state: (item.state as string | null | undefined) ?? null,
    intake_completed: Boolean(item.intake_completed),
    intake_completed_at: asDate(item.intake_completed_at),
    home_study_path: (item.home_study_path as HomeStudyPath | null | undefined) ?? null,
    home_study_result: (item.home_study_result as HomeStudyResult | null | undefined) ?? null,
    home_study_completed_at: asDate(item.home_study_completed_at),
    matched_agency_id: (item.matched_agency_id as string | null | undefined) ?? null,
    match_score: item.match_score === undefined ? null : Number(item.match_score),
    matched_at: asDate(item.matched_at),
    created_at: asDate(item.created_at) ?? new Date(0),
    updated_at: asDate(item.updated_at) ?? new Date(0),
  };
}

function baseUser(id: string, email: string, fields: Record<string, unknown>): UserItem {
  const now = isoNow();
  return {
    PK: `USER#${id}`, SK: "PROFILE", EmailPK: emailIndexKey(email), EmailSK: `USER#${id}`,
    id, email: email.trim().toLowerCase(), email_verified: false, password_hash: null,
    google_sub: null, newsletter_prompt_pending: true, newsletter_subscribed: false,
    state: null, intake_completed: false, intake_completed_at: null,
    home_study_path: null, home_study_result: null, home_study_completed_at: null,
    matched_agency_id: null, match_score: null, matched_at: null,
    created_at: now, updated_at: now, ...fields,
  };
}

async function createUniqueUser(item: UserItem, googleSub?: string): Promise<User> {
  const table = process.env.DDB_TABLE ?? "havenlink-prod-data";
  const puts: any[] = [{ Put: { TableName: table, Item: { PK: `UNIQUE#${emailIndexKey(item.email)}`, SK: "LOCK" }, ConditionExpression: "attribute_not_exists(PK)" } },
    { Put: { TableName: table, Item: item, ConditionExpression: "attribute_not_exists(PK)" } }];
  if (googleSub) puts.push({ Put: { TableName: table, Item: { PK: `UNIQUE#${googleIndexKey(googleSub)}`, SK: "LOCK" }, ConditionExpression: "attribute_not_exists(PK)" } });
  await transactWrite(puts);
  return fromItem(item)!;
}

const useDynamo = () => process.env.DATA_BACKEND === "dynamodb" || !!process.env.DDB_TABLE;
async function dynamoFindById(id: string): Promise<User | null> { return fromItem(await getItem<UserItem>(profileKey(id))); }
async function dynamoFindByEmail(email: string): Promise<User | null> { return fromItem((await queryIndex<UserItem>(EMAIL_INDEX, emailIndexKey(email), "EmailPK", "EmailSK"))[0]); }
async function dynamoFindByGoogleSub(sub: string): Promise<User | null> { return fromItem((await queryIndex<UserItem>(GOOGLE_INDEX, googleIndexKey(sub), "GooglePK", "GoogleSK"))[0]); }
export const findById = (id: string) => useDynamo() ? dynamoFindById(id) : postgres.findById(id);
export const findByEmail = (email: string) => useDynamo() ? dynamoFindByEmail(email) : postgres.findByEmail(email);
export const findByGoogleSub = (sub: string) => useDynamo() ? dynamoFindByGoogleSub(sub) : postgres.findByGoogleSub(sub);

async function dynamoCreatePasswordUser(email: string, passwordHash: string): Promise<User> {
  return createUniqueUser(baseUser(crypto.randomUUID(), email, { password_hash: passwordHash }));
}
async function dynamoCreateGoogleUser(email: string, googleSub: string): Promise<User> {
  const id = crypto.randomUUID();
  return createUniqueUser(baseUser(id, email, { google_sub: googleSub, email_verified: true, GooglePK: googleIndexKey(googleSub), GoogleSK: `USER#${id}` }), googleSub);
}

async function dynamoLinkGoogleSub(userId: string, googleSub: string): Promise<User> {
  const table = process.env.DDB_TABLE ?? "havenlink-prod-data";
  await transactWrite([
    { Put: { TableName: table, Item: { PK: `UNIQUE#${googleIndexKey(googleSub)}`, SK: "LOCK" }, ConditionExpression: "attribute_not_exists(PK)" } },
    { Update: { TableName: table, Key: profileKey(userId), UpdateExpression: "SET google_sub = :sub, email_verified = :verified, updated_at = :now, GooglePK = :lookup, GoogleSK = :sort", ExpressionAttributeValues: { ":sub": googleSub, ":verified": true, ":now": isoNow(), ":lookup": googleIndexKey(googleSub), ":sort": `USER#${userId}` }, ConditionExpression: "attribute_exists(PK)" } },
  ]);
  return (await findById(userId))!;
}

async function dynamoMarkEmailVerified(userId: string): Promise<void> {
  await updateItem(profileKey(userId), "SET email_verified = :true, updated_at = :now", { ":true": true, ":now": isoNow() });
}
async function dynamoResolveNewsletterPrompt(userId: string, subscribe: boolean): Promise<void> {
  // DynamoDB has no boolean OR expression. A decline clears only the pending
  // prompt, while an opt-in explicitly sets the durable subscription flag.
  const values = { ":false": false, ":now": isoNow(), ...(subscribe ? { ":true": true } : {}) };
  const expression = subscribe
    ? "SET newsletter_prompt_pending = :false, newsletter_subscribed = :true, updated_at = :now"
    : "SET newsletter_prompt_pending = :false, updated_at = :now";
  await updateItem(profileKey(userId), expression, values);
}
async function dynamoRecordIntakeCompletion(userId: string, state: string | null): Promise<void> {
  await updateItem(profileKey(userId), "SET intake_completed = :true, intake_completed_at = :now, updated_at = :now", { ":true": true, ":now": isoNow() });
  if (state) await updateItem(profileKey(userId), "SET #state = :state, updated_at = :now", { ":state": state, ":now": isoNow() }, { "#state": "state" });
}
async function dynamoRecordHomeStudyCompletion(userId: string, data: { path: HomeStudyPath; result: HomeStudyResult | null; state: string | null }): Promise<void> {
  await updateItem(profileKey(userId), "SET home_study_path = :path, home_study_result = :result, home_study_completed_at = :now, updated_at = :now", { ":path": data.path, ":result": data.result, ":now": isoNow() });
  if (data.state) await updateItem(profileKey(userId), "SET #state = :state, updated_at = :now", { ":state": data.state, ":now": isoNow() }, { "#state": "state" });
}
async function dynamoRecordMatch(userId: string, agencyId: string, score: number): Promise<User | null> {
  try {
    const result = await updateItem(profileKey(userId), "SET matched_agency_id = :agency, match_score = :score, matched_at = :now, updated_at = :now", { ":agency": agencyId, ":score": score, ":now": isoNow() }, undefined, "attribute_exists(PK) AND attribute_not_exists(matched_agency_id)", "ALL_NEW");
    return fromItem(result.Attributes as UserItem | undefined);
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return null;
    throw error;
  }
}

export const createPasswordUser = (email: string, hash: string) => useDynamo() ? dynamoCreatePasswordUser(email, hash) : postgres.createPasswordUser(email, hash);
export const createGoogleUser = (email: string, sub: string) => useDynamo() ? dynamoCreateGoogleUser(email, sub) : postgres.createGoogleUser(email, sub);
export const linkGoogleSub = (id: string, sub: string) => useDynamo() ? dynamoLinkGoogleSub(id, sub) : postgres.linkGoogleSub(id, sub);
export const markEmailVerified = (id: string) => useDynamo() ? dynamoMarkEmailVerified(id) : postgres.markEmailVerified(id);
export const resolveNewsletterPrompt = (id: string, subscribe: boolean) => useDynamo() ? dynamoResolveNewsletterPrompt(id, subscribe) : postgres.resolveNewsletterPrompt(id, subscribe);
export const recordIntakeCompletion = (id: string, state: string | null) => useDynamo() ? dynamoRecordIntakeCompletion(id, state) : postgres.recordIntakeCompletion(id, state);
export const recordHomeStudyCompletion = (id: string, data: { path: HomeStudyPath; result: HomeStudyResult | null; state: string | null }) => useDynamo() ? dynamoRecordHomeStudyCompletion(id, data) : postgres.recordHomeStudyCompletion(id, data);
export const recordMatch = (id: string, agencyId: string, score: number) => useDynamo() ? dynamoRecordMatch(id, agencyId, score) : postgres.recordMatch(id, agencyId, score);
