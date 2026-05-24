import { SHEET_ID, TAB_INVITADOS, TAB_RESPUESTAS } from "../config";

export type Invitado = {
  rowIndex: number; // fila en el Sheet (1-based, incluye header)
  id: string;
  nombre: string;
  acompanantes: number;
  invitacionEnviada: boolean;
  contacto: string;
  notas: string;
};

export type Respuesta = {
  timestamp: string;
  id: string;
  respuesta: "acepto" | "no_puedo" | string;
  cantidadConfirmados: number;
  comentario: string;
};

type GvizCell = { v: unknown; f?: string } | null;
type GvizRow = { c: GvizCell[] };
type GvizTable = { cols: { label: string }[]; rows: GvizRow[] };
type GvizResponse = { table: GvizTable };

// El endpoint gviz devuelve un JSON envuelto en `google.visualization.Query.setResponse(...)`.
// Hay que limpiar ese wrapper antes de parsearlo.
async function fetchGviz(sheetTab: string): Promise<GvizTable> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetTab)}`;
  const res = await fetch(url);
  const text = await res.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Respuesta inesperada del Sheet");
  const json: GvizResponse = JSON.parse(text.slice(start, end + 1));
  return json.table;
}

function cellString(c: GvizCell): string {
  if (!c || c.v == null) return "";
  return String(c.v);
}

function cellNumber(c: GvizCell): number {
  if (!c || c.v == null || c.v === "") return 0;
  const n = Number(c.v);
  return Number.isFinite(n) ? n : 0;
}

function cellBool(c: GvizCell): boolean {
  if (!c) return false;
  const v = c.v;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true" || v.toLowerCase() === "sí" || v === "1";
  return Boolean(v);
}

export async function loadInvitados(): Promise<Invitado[]> {
  const table = await fetchGviz(TAB_INVITADOS);
  return table.rows.map((row, i) => ({
    rowIndex: i + 2, // +2: una por el header, otra porque gviz es 0-based
    id: cellString(row.c[0]),
    nombre: cellString(row.c[1]),
    acompanantes: cellNumber(row.c[2]),
    invitacionEnviada: cellBool(row.c[3]),
    contacto: cellString(row.c[4]),
    notas: cellString(row.c[5]),
  }));
}

export async function loadRespuestas(): Promise<Respuesta[]> {
  const table = await fetchGviz(TAB_RESPUESTAS);
  return table.rows.map((row) => ({
    timestamp: cellString(row.c[0]),
    id: cellString(row.c[1]),
    respuesta: cellString(row.c[2]),
    cantidadConfirmados: cellNumber(row.c[3]),
    comentario: cellString(row.c[4]),
  }));
}

// Para cada invitado se toma la última respuesta (por timestamp).
export function ultimaRespuestaPorId(respuestas: Respuesta[]): Map<string, Respuesta> {
  const m = new Map<string, Respuesta>();
  for (const r of respuestas) {
    if (!r.id) continue;
    const prev = m.get(r.id);
    if (!prev || prev.timestamp < r.timestamp) m.set(r.id, r);
  }
  return m;
}

// Escritura: actualizar una celda usando Sheets API v4 con el token OAuth del admin.
export async function updateCell(opts: {
  token: string;
  tab: string;
  rowIndex: number; // 1-based, incluye header
  column: string;  // letra de columna, ej "D"
  value: string | number | boolean;
}): Promise<void> {
  const range = `${opts.tab}!${opts.column}${opts.rowIndex}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values: [[opts.value]],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Error escribiendo al Sheet: ${res.status} ${txt}`);
  }
}
