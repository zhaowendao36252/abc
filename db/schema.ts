import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["expense", "income"] }).notNull().default("expense"),
  merchant: text("merchant").notNull(),
  amountCents: integer("amount_cents").notNull(),
  category: text("category").notNull(),
  transactionDate: text("transaction_date").notNull(),
  note: text("note").notNull().default(""),
  sourceText: text("source_text").notNull().default(""),
  personId: integer("person_id"),
  reimbursedAt: text("reimbursed_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},(table)=>[index("transactions_date_idx").on(table.transactionDate)]);

export const persons = sqliteTable("persons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},(table)=>[index("persons_name_idx").on(table.name)]);

export const transactionVersions = sqliteTable("transaction_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id").notNull(),
  versionKind: text("version_kind").notNull().default("saved"),
  kind: text("kind", { enum: ["expense", "income"] }).notNull(),
  merchant: text("merchant").notNull(),
  amountCents: integer("amount_cents").notNull(),
  category: text("category").notNull(),
  transactionDate: text("transaction_date").notNull(),
  note: text("note").notNull().default(""),
  sourceText: text("source_text").notNull().default(""),
  personId: integer("person_id"),
  reimbursedAt: text("reimbursed_at"),
  recordedAt: text("recorded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},(table)=>[index("transaction_versions_transaction_idx").on(table.transactionId),index("transaction_versions_recorded_idx").on(table.recordedAt)]);
