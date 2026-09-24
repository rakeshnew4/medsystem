// CareFlow PostgreSQL database boundary.
// All application database traffic goes directly through the configured
// external PostgreSQL adapter. There is no Hatchable/native DB fallback.
const adapterUrlRaw = String(process.env.DB_ADAPTER_URL || "");
const adapterUrl = adapterUrlRaw.endsWith("/") ? adapterUrlRaw.slice(0, -1) : adapterUrlRaw;
const adapterKey = String(process.env.DB_ADAPTER_KEY || "");

async function adapterRequest(path, body) {
  if (!adapterUrl || !adapterKey) {
    throw new Error("External PostgreSQL adapter is not configured");
  }

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(adapterUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DB-Adapter-Key": adapterKey
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error("[db-adapter] network error", {
      path,
      duration_ms: Date.now() - startedAt,
      error: String(error?.message || error)
    });
    throw error;
  }

  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { error: text || "Invalid adapter response" }; }

  if (!response.ok) {
    console.error("[db-adapter] request failed", {
      path,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      error: String(payload?.error || text || ("Database adapter HTTP " + response.status)).slice(0, 500)
    });
    throw new Error(payload?.error || ("Database adapter HTTP " + response.status));
  }

  console.log("[db-adapter] request ok", {
    path,
    status: response.status,
    duration_ms: Date.now() - startedAt,
    rowCount: payload?.rowCount ?? null
  });
  return payload;
}

export const db = {
  query(sql, params = []) {
    return adapterRequest("/query", { sql, params });
  },
  transaction(statements) {
    return adapterRequest("/transaction", { statements });
  }
};

export const databaseProvider = "adapter";