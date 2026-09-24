// CareFlow portable PostgreSQL database boundary.
// DATABASE_PROVIDER=adapter routes SQL through the generic PostgreSQL adapter.
import { db as hatchableDb } from "hatchable";

const databaseProvider = String(process.env.DATABASE_PROVIDER || "hatchable").toLowerCase();
const adapterUrlRaw = String(process.env.DB_ADAPTER_URL || "");
const adapterUrl = adapterUrlRaw.endsWith("/") ? adapterUrlRaw.slice(0, -1) : adapterUrlRaw;
const adapterKey = String(process.env.DB_ADAPTER_KEY || "");

async function adapterRequest(path, body) {
  if (!adapterUrl || !adapterKey) {
    throw new Error("External PostgreSQL adapter is not configured");
  }

  const response = await fetch(adapterUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-DB-Adapter-Key": adapterKey
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { error: text || "Invalid adapter response" }; }

  if (!response.ok) {
    throw new Error(payload?.error || ("Database adapter HTTP " + response.status));
  }

  return payload;
}

export const db = databaseProvider === "adapter"
  ? {
      query(sql, params = []) {
        return adapterRequest("/query", { sql, params });
      },
      transaction(statements) {
        return adapterRequest("/transaction", { statements });
      }
    }
  : {
      query(sql, params = []) {
        return hatchableDb.query(sql, params);
      },
      transaction(statements) {
        return hatchableDb.transaction(statements);
      }
    };

export { databaseProvider };