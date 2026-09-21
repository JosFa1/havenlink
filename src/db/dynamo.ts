import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * The serverless data plane uses one on-demand DynamoDB table.  Keep all key
 * construction here so account isolation and index names cannot drift between
 * repositories.
 */
export const TABLE_NAME = process.env.DDB_TABLE ?? "havenlink-prod-data";
// One shared lookup index is sufficient: key prefixes keep email, Google
// subject, and token-owner namespaces separate.
export const EMAIL_INDEX = "EmailIndex";
export const GOOGLE_INDEX = "GoogleSubIndex";
export const TOKEN_USER_INDEX = "TokenUserIndex";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
});
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const key = (pk: string, sk = "PROFILE") => ({ PK: pk, SK: sk });
export const userKey = (id: string) => key(`USER#${id}`);
export const emailIndexKey = (email: string) => `EMAIL#${email.trim().toLowerCase()}`;
export const googleIndexKey = (sub: string) => `GOOGLE#${sub}`;

export function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export async function getItem<T>(itemKey: Record<string, string>): Promise<T | null> {
  const result = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: itemKey }));
  return (result.Item as T | undefined) ?? null;
}

export async function queryIndex<T>(
  indexName: string,
  indexValue: string,
  partitionAttribute: string,
  sortAttribute: string,
  options: { beginsWith?: string; limit?: number } = {}
): Promise<T[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: indexName,
      KeyConditionExpression: options.beginsWith
        ? `#pk = :value AND begins_with(#sk, :prefix)`
        : "#pk = :value",
      ExpressionAttributeNames: {
        "#pk": partitionAttribute,
        ...(options.beginsWith ? { "#sk": sortAttribute } : {}),
      },
      ExpressionAttributeValues: {
        ":value": indexValue,
        ...(options.beginsWith ? { ":prefix": options.beginsWith } : {}),
      },
      Limit: options.limit,
    })
  );
  return (result.Items as T[] | undefined) ?? [];
}

export async function queryPrimary<T>(pk: string, beginsWith?: string): Promise<T[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: beginsWith
      ? "PK = :pk AND begins_with(SK, :prefix)"
      : "PK = :pk",
    ExpressionAttributeValues: { ":pk": pk, ...(beginsWith ? { ":prefix": beginsWith } : {}) },
  }));
  return (result.Items as T[] | undefined) ?? [];
}

export async function putItem(item: Record<string, unknown>, condition?: string) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ...(condition ? { ConditionExpression: condition } : {}),
    })
  );
}

export async function updateItem(
  itemKey: Record<string, string>,
  updateExpression: string,
  values: Record<string, unknown>,
  names?: Record<string, string>,
  condition?: string,
  returnValues: "NONE" | "ALL_NEW" | "UPDATED_NEW" = "NONE"
) {
  return ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: itemKey,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
      ...(names ? { ExpressionAttributeNames: names } : {}),
      ...(condition ? { ConditionExpression: condition } : {}),
      ReturnValues: returnValues,
    })
  );
}

export async function deleteItem(itemKey: Record<string, string>) {
  await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: itemKey }));
}

export async function transactWrite(items: ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]) {
  await ddb.send(new TransactWriteCommand({ TransactItems: items }));
}
