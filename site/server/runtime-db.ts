import type { Client, InValue, ResultSet, Row } from "@libsql/client";
import { createClient as createHttpClient } from "@libsql/client/http";

let client: Promise<Client> | undefined;

export async function getDatabaseClient(): Promise<Client> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("站点数据库尚未配置 DATABASE_URL");
  if (url.startsWith("file:")) {
    client ??= import("@libsql/client").then(({ createClient }) => createClient({ url }));
  } else {
    const endpoint = new URL(url);
    if (!["https:", "libsql:"].includes(endpoint.protocol) || !endpoint.hostname ||
      endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
      throw new Error("远程数据库须使用不含凭据和查询参数的 HTTPS 或 libSQL 地址");
    const authToken = process.env.DATABASE_AUTH_TOKEN;
    if (!authToken) throw new Error("站点数据库尚未配置 DATABASE_AUTH_TOKEN");
    client ??= Promise.resolve(createHttpClient({ url: url.replace(/^libsql:/i, "https:"), authToken }));
  }
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
