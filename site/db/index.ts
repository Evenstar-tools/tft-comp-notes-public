import { drizzle } from "drizzle-orm/libsql";
import { getDatabaseClient } from "../server/runtime-db";
import * as schema from "./schema";

export async function getDb() {
  return drizzle(await getDatabaseClient(), { schema });
}
