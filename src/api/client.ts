import { APPS_SCRIPT_URL } from "../config";

// Apps Script Web App client. Conventions:
// - GET for public reads (params in the query string).
// - POST with Content-Type "text/plain" for writes and admin reads. The
//   text/plain content type sidesteps CORS preflight, and the script parses
//   the JSON body from e.postData.contents.

type RequestPayload = Record<string, unknown>;

function ensureConfigured(): void {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith("REEMPLAZAR")) {
    throw new Error("APPS_SCRIPT_URL no está configurado en src/config.ts");
  }
}

async function call<T>(payload: RequestPayload, method: "GET" | "POST"): Promise<T> {
  ensureConfigured();
  let url = APPS_SCRIPT_URL;
  let init: RequestInit = { method };
  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      params.set(key, value == null ? "" : String(value));
    }
    url = `${APPS_SCRIPT_URL}?${params.toString()}`;
  } else {
    init = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    };
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor: ${text.slice(0, 200)}`);
  }
  if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
    const error = (parsed as { error: unknown }).error;
    throw new Error(typeof error === "string" ? error : "Error desconocido");
  }
  return parsed as T;
}

export function getJson<T>(payload: RequestPayload): Promise<T> {
  return call<T>(payload, "GET");
}

export function postJson<T>(payload: RequestPayload): Promise<T> {
  return call<T>(payload, "POST");
}
