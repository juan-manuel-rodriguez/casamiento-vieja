import { APPS_SCRIPT_URL } from "../config";

// Llamadas al Web App de Apps Script. Convención:
// - GET para lecturas públicas (devuelve JSON).
// - POST con Content-Type "text/plain" para escrituras y lecturas admin.
//   El text/plain es a propósito: evita el preflight CORS, y el script
//   parsea el body como JSON en `e.postData.contents`.

type ApiPayload = Record<string, unknown>;

async function call<T>(payload: ApiPayload, method: "GET" | "POST"): Promise<T> {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith("REEMPLAZAR")) {
    throw new Error("Falta configurar APPS_SCRIPT_URL en src/config.ts");
  }
  let url = APPS_SCRIPT_URL;
  let init: RequestInit = { method };
  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) params.set(k, String(v ?? ""));
    url = `${APPS_SCRIPT_URL}?${params.toString()}`;
  } else {
    init = {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    };
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del backend: ${text.slice(0, 200)}`);
  }
  if (typeof parsed === "object" && parsed && "error" in parsed) {
    const err = (parsed as { error: unknown }).error;
    throw new Error(typeof err === "string" ? err : "Error del backend");
  }
  return parsed as T;
}

export function apiGet<T>(payload: ApiPayload): Promise<T> {
  return call<T>(payload, "GET");
}

export function apiPost<T>(payload: ApiPayload): Promise<T> {
  return call<T>(payload, "POST");
}
