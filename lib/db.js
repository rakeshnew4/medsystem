// CareFlow portable PostgreSQL database boundary.
//
// Today Hatchable supplies the PostgreSQL implementation. Keeping all
// application DB imports behind this module lets the API move unchanged to
// any PostgreSQL runtime later (Supabase, RDS, Cloud SQL, self-hosted, etc.).
//
// The public surface intentionally mirrors the subset CareFlow already uses.
import { db as hatchableDb } from "hatchable";

export const db = {
  query(sql, params = []) {
    return hatchableDb.query(sql, params);
  },
  transaction(statements) {
    return hatchableDb.transaction(statements);
  }
};

export const databaseProvider = process.env.DATABASE_PROVIDER || "hatchable";