import type { Client, InValue, ResultSet, Row } from "@libsql/client";
import { createClient as createHttpClient } from "@libsql/client/http";

const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS `settings` (`key` text PRIMARY KEY NOT NULL, `value` text NOT NULL)",
  "CREATE TABLE IF NOT EXISTS `snapshots` (`id` text PRIMARY KEY NOT NULL, `body` text NOT NULL, `created_at` text NOT NULL)",
  "CREATE TABLE IF NOT EXISTS `sync_jobs` (`id` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `status` text NOT NULL, `detail` text NOT NULL, `updated_at` text NOT NULL)",
  "CREATE TABLE IF NOT EXISTS `teams` (`id` text PRIMARY KEY NOT NULL, `owner_id` text NOT NULL, `body` text NOT NULL, `revision` integer DEFAULT 1 NOT NULL, `updated_at` text NOT NULL)",
  "CREATE TABLE IF NOT EXISTS owner_content (scope text NOT NULL, target text NOT NULL, revision integer NOT NULL, published_revision integer NOT NULL, published text NOT NULL, drafts text NOT NULL, PRIMARY KEY (scope,target))",
];

let cachedKey: string | undefined;
let client: Promise<Client> | undefined;

async function ensureSchema(db: Client): Promise<Client> {
  await db.batch(SCHEMA_STATEMENTS, "write");
  return db;
}

export async function getDatabaseClient(): Promise<Client> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("站点数据库尚未配置 DATABASE_URL");
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const cacheKey = `${url}\0${authToken ?? ""}`;
  if (client && cachedKey === cacheKey) return client;
  cachedKey = cacheKey;
  if (url.startsWith("file:")) {
    client = import("@libsql/client").then(({ createClient }) => ensureSchema(createClient({ url })));
  } else {
    const endpoint = new URL(url);
    if (!["https:", "libsql:"].includes(endpoint.protocol) || !endpoint.hostname ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
      throw new Error("远程数据库须使用不含凭据和查询参数的 HTTPS 或 libSQL 地址");
    if (!authToken) throw new Error("站点数据库尚未配置 DATABASE_AUTH_TOKEN");
    client = ensureSchema(createHttpClient({ url: url.replace(/^libsql:/i, "https:"), authToken }));
  }
  client = client.catch(error => {
    if (cachedKey === cacheKey) {
      cachedKey = undefined;
      client = undefined;
    }
    throw error;
  });
  return client;
}

function writeResult(result: ResultSet) {
  return { meta: { changes: result.rowsAffected } };
}

interface PreparedStatement {
  query: { sql: string; args: InValue[] };
  bind(...params: InValue[]): PreparedStatement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

function statement(sql: string, args: InValue[] = []): PreparedStatement {
  const query = { sql, args };
  const execute = async () => (await getDatabaseClient()).execute(query);
  return {
    query,
    bind: (...params: InValue[]) => statement(sql, params),
    async first<T = Row>(): Promise<T | null> {
      return ((await execute()).rows[0] as T | undefined) ?? null;
    },
    async all<T = Row>(): Promise<{ results: T[] }> {
      return { results: (await execute()).rows as T[] };
    },
    async run() {
      return writeResult(await execute());
    },
  };
}

const db = {
  prepare: statement,
  async batch(statements: PreparedStatement[]) {
    const results = await (await getDatabaseClient()).batch(
      statements.map(({ query }) => query),
      "write",
    );
    return results.map(writeResult);
  },
};

export function database() {
  return db;
}
