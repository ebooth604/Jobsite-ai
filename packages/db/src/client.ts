/**
 * The database client — a thin layer over the RDS Data API.
 *
 * There is no connection pool and no persistent socket here, because the Data
 * API has neither: every statement is an HTTPS call authenticated with SigV4.
 * That is precisely why this architecture needs no VPC, no NAT gateway and no
 * subnet plumbing (see `infra/terraform/modules/database`).
 *
 * **Parameters are always bound, never interpolated.** The Data API takes named
 * parameters with explicit types, and `params()` below does that conversion.
 * Nothing in this package builds SQL by string concatenation with a caller's
 * value, and nothing should start.
 */

import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  type Field,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

const CLUSTER_ARN = process.env.SITEWIREAI_DB_CLUSTER_ARN ?? "";
const SECRET_ARN = process.env.SITEWIREAI_DB_SECRET_ARN ?? "";
const DATABASE = process.env.SITEWIREAI_DB_NAME ?? "sitewire";

export function databaseConfigured(): boolean {
  return Boolean(CLUSTER_ARN && SECRET_ARN);
}

let client: RDSDataClient | null = null;

function rds(): RDSDataClient {
  if (!CLUSTER_ARN || !SECRET_ARN) {
    throw new Error(
      "Database is not configured. Set SITEWIREAI_DB_CLUSTER_ARN and SITEWIREAI_DB_SECRET_ARN.",
    );
  }
  if (!client) client = new RDSDataClient({});
  return client;
}

/** A value this layer knows how to bind. Anything else is a bug at the call site. */
export type Param = string | number | boolean | null | string[];

function toField(value: Param): Field {
  if (value === null) return { isNull: true };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  }
  // Postgres arrays. The Data API wants them as a typed arrayValue rather than
  // a serialised literal.
  return { arrayValue: { stringValues: value } };
}

function params(values: Record<string, Param>): SqlParameter[] {
  return Object.entries(values).map(([name, value]) => {
    const field = toField(value);
    // text[] columns need the cast declared or Postgres receives unknown[].
    return Array.isArray(value)
      ? { name, value: field, typeHint: undefined }
      : { name, value: field };
  });
}

/** Unwraps one Data API field into a plain JS value. */
function fromField(field: Field): unknown {
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.arrayValue?.stringValues !== undefined) return field.arrayValue.stringValues;
  return null;
}

/**
 * Runs a statement and returns rows as objects keyed by column name.
 *
 * `formatRecordsAs: "JSON"` would be terser, but it silently coerces numerics to
 * strings and drops the column metadata this mapping relies on, so records are
 * unwrapped by hand.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  values: Record<string, Param> = {},
  transactionId?: string,
): Promise<T[]> {
  const result = await rds().send(
    new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DATABASE,
      sql,
      parameters: params(values),
      includeResultMetadata: true,
      ...(transactionId ? { transactionId } : {}),
    }),
  );

  const columns = (result.columnMetadata ?? []).map((c) => c.name ?? "");
  return (result.records ?? []).map((record) => {
    const row: Record<string, unknown> = {};
    record.forEach((field, index) => {
      const name = columns[index];
      if (name) row[name] = fromField(field);
    });
    return row as T;
  });
}

/** Runs a statement for its effect. Same binding rules as `query`. */
export async function execute(
  sql: string,
  values: Record<string, Param> = {},
  transactionId?: string,
): Promise<number> {
  const result = await rds().send(
    new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DATABASE,
      sql,
      parameters: params(values),
      ...(transactionId ? { transactionId } : {}),
    }),
  );
  return result.numberOfRecordsUpdated ?? 0;
}

/**
 * Runs `fn` inside a transaction, committing on return and rolling back on throw.
 *
 * The Data API's transactions are explicit ids passed per statement rather than
 * a held connection, which is why the callback receives one to thread through.
 */
export async function transaction<T>(fn: (transactionId: string) => Promise<T>): Promise<T> {
  const begun = await rds().send(
    new BeginTransactionCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DATABASE,
    }),
  );
  const transactionId = begun.transactionId;
  if (!transactionId) throw new Error("could not begin a transaction");

  try {
    const result = await fn(transactionId);
    await rds().send(
      new CommitTransactionCommand({
        resourceArn: CLUSTER_ARN,
        secretArn: SECRET_ARN,
        transactionId,
      }),
    );
    return result;
  } catch (err) {
    // A rollback failure must not mask the error that caused it.
    await rds()
      .send(
        new RollbackTransactionCommand({
          resourceArn: CLUSTER_ARN,
          secretArn: SECRET_ARN,
          transactionId,
        }),
      )
      .catch(() => {});
    throw err;
  }
}
