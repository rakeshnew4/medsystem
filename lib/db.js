// CareFlow PostgreSQL database boundary.
// All application database traffic goes directly through the configured
// external PostgreSQL adapter. There is no Hatchable/native DB fallback.

const adapterUrlRaw = String(process.env.DB_ADAPTER_URL || "");
const adapterUrl = adapterUrlRaw.endsWith("/") ? adapterUrlRaw.slice(0, -1) : adapterUrlRaw;
const adapterKey = String(process.env.DB_ADAPTER_KEY || "");

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 150;
const MAX_DELAY_MS = 1000;

function retryDelay(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(MAX_DELAY_MS, retryAfter * 1000);
  }
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 75);
  return exponential + jitter;
}

function isTransient(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function adapterRequest(path, body) {
  if (!adapterUrl || !adapterKey) {
    throw new Error("External PostgreSQL adapter is not configured");
  }

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();

    try {
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
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { error: text || "Invalid adapter response" };
      }

      if (response.ok) {
        console.log("[db-adapter] request ok", {
          path,
          status: response.status,
          duration_ms: Date.now() - startedAt,
          rowCount: payload?.rowCount ?? null,
          retries: attempt
        });
        return payload;
      }

      const errorMessage = String(
        payload?.error ||
        text ||
        ("Database adapter HTTP " + response.status)
      ).slice(0, 500);

      if (!isTransient(response.status) || attempt >= MAX_RETRIES) {
        console.error("[db-adapter] request failed", {
          path,
          status: response.status,
          duration_ms: Date.now() - startedAt,
          retries: attempt,
          error: errorMessage
        });
        const err = new Error(errorMessage);
        err.status = response.status;
        throw err;
      }

      const delay = retryDelay(attempt, response.headers.get("Retry-After"));
      console.warn("[db-adapter] transient response; retrying", {
        path,
        status: response.status,
        attempt: attempt + 1,
        delay_ms: delay
      });
      lastError = new Error(errorMessage);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;

      // Network failures are transient, but only retry a small number of times.
      if (attempt >= MAX_RETRIES) {
        console.error("[db-adapter] network/request error", {
          path,
          duration_ms: Date.now() - startedAt,
          retries: attempt,
          error: String(error?.message || error).slice(0, 500)
        });
        throw error;
      }

      // SQL/application errors are thrown above after a non-transient HTTP
      // response (see err.status) and should not be retried.
      if (error?.status != null && !isTransient(error.status)) {
        throw error;
      }

      const message = String(error?.message || error);

      const delay = retryDelay(attempt, null);
      console.warn("[db-adapter] transient network error; retrying", {
        path,
        attempt: attempt + 1,
        delay_ms: delay,
        error: message.slice(0, 300)
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("Database adapter request failed");
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