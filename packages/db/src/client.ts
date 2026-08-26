/**
 * The domain store — DynamoDB, keyed so that tenancy is structural.
 *
 * **The org id is the partition key.** Every item lives at
 * `pk = "ORG#<orgId>"`, and DynamoDB will not return an item from a partition
 * you did not name. That is a stronger guarantee than a SQL `WHERE org_id`,
 * which is a filter a query can forget: here there is no query shape that
 * reaches another tenant's data by omission. The failure mode of forgetting
 * scope is an error, not a silent cross-tenant read.
 *
 * The sort key is `"<TYPE>#<id>"`, so one Query with `begins_with` returns all
 * of a tenant's projects, or all of its captures, in a single call.
 *
 * Organizations themselves live in one shared partition (`pk = "ORGS"`) because
 * the list of tenants is not itself tenant-scoped — it is administrative data,
 * and the only caller that should read it is the org resolver.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.SITEWIREAI_DOMAIN_TABLE ?? "";

export function databaseConfigured(): boolean {
  return Boolean(TABLE);
}

let docClient: DynamoDBDocumentClient | null = null;

function documents(): DynamoDBDocumentClient {
  if (!TABLE) {
    throw new Error("Domain store is not configured. Set SITEWIREAI_DOMAIN_TABLE.");
  }
  if (!docClient) {
    docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      // Undefined is how this codebase spells "no value"; without this every
      // optional field would need stripping by hand before every write.
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

/** Item types, which become the sort-key prefix. */
export type EntityType =
  | "PROJECT"
  | "SCOPE"
  | "CAPTURE"
  | "ESTIMATE"
  | "HOURS"
  | "CONDITION";

export const ORG_PARTITION = "ORGS";

export function orgKey(orgId: string): string {
  return `ORG#${orgId}`;
}

export function sortKey(type: EntityType, id: string): string {
  return `${type}#${id}`;
}

/**
 * Every item a tenant owns of one type.
 *
 * Paginated properly rather than assuming one page: a tenant with a few hundred
 * captures exceeds DynamoDB's 1 MB response limit, and a silently truncated
 * list would understate a project's work without erroring.
 */
export async function queryType<T>(orgId: string, type: EntityType): Promise<T[]> {
  const items: T[] = [];
  let cursor: Record<string, unknown> | undefined;

  do {
    const page = await documents().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": orgKey(orgId), ":prefix": `${type}#` },
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of page.Items ?? []) items.push(item as T);
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  return items;
}

/** One item, or null. A wrong org id is a miss, not a leak. */
export async function getItem<T>(
  orgId: string,
  type: EntityType,
  id: string,
): Promise<T | null> {
  const result = await documents().send(
    new GetCommand({ TableName: TABLE, Key: { pk: orgKey(orgId), sk: sortKey(type, id) } }),
  );
  return (result.Item as T | undefined) ?? null;
}

export async function putItem(
  orgId: string,
  type: EntityType,
  id: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  await documents().send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...attributes, pk: orgKey(orgId), sk: sortKey(type, id), id, orgId },
    }),
  );
}

export async function deleteItem(orgId: string, type: EntityType, id: string): Promise<void> {
  await documents().send(
    new DeleteCommand({ TableName: TABLE, Key: { pk: orgKey(orgId), sk: sortKey(type, id) } }),
  );
}

/** Writes many items in batches of 25, which is DynamoDB's per-request ceiling. */
export async function putMany(
  items: { orgId: string; type: EntityType; id: string; attributes: Record<string, unknown> }[],
): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await documents().send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: batch.map(({ orgId, type, id, attributes }) => ({
            PutRequest: {
              Item: { ...attributes, pk: orgKey(orgId), sk: sortKey(type, id), id, orgId },
            },
          })),
        },
      }),
    );
  }
}

// ---- organizations ---------------------------------------------------------
//
// Administrative data, not tenant data, so it sits in its own partition.

export interface OrgItem {
  id: string;
  name: string;
  slug: string;
}

export async function putOrg(org: OrgItem): Promise<void> {
  await documents().send(
    new PutCommand({
      TableName: TABLE,
      Item: { ...org, pk: ORG_PARTITION, sk: `ORG#${org.id}` },
    }),
  );
}

export async function queryOrgs(): Promise<OrgItem[]> {
  const page = await documents().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": ORG_PARTITION },
    }),
  );
  return (page.Items ?? []) as OrgItem[];
}
