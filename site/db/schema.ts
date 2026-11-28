import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  body: text("body").notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});
export const syncJobs = sqliteTable("sync_jobs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  detail: text("detail").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const ownerContent = sqliteTable("owner_content", {
  scope: text("scope").notNull(),
  target: text("target").notNull(),
  revision: integer("revision").notNull(),
  publishedRevision: integer("published_revision").notNull(),
  published: text("published").notNull(),
  drafts: text("drafts").notNull(),
}, table => [primaryKey({ columns: [table.scope, table.target] })]);
