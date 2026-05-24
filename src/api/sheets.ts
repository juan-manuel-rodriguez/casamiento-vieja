import { apiGet, apiPost } from "./client";

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

// Lectura pública mínima para la vista del invitado.
export type InvitadoPublico = Pick<Invitado, "id" | "nombre" | "acompanantes">;

export async function loadInvitadoPublico(id: string): Promise<InvitadoPublico | null> {
  const res = await apiGet<{ found: boolean; invitado?: InvitadoPublico }>({
    action: "getInvitado",
    id,
  });
  return res.found && res.invitado ? res.invitado : null;
}

export async function loadInvitados(token: string): Promise<Invitado[]> {
  const res = await apiPost<{ invitados: Invitado[] }>({ action: "listInvitados", token });
  return res.invitados;
}

export async function loadRespuestas(token: string): Promise<Respuesta[]> {
  const res = await apiPost<{ respuestas: Respuesta[] }>({ action: "listRespuestas", token });
  return res.respuestas;
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

export async function upsertInvitado(token: string, invitado: Omit<Invitado, "rowIndex">): Promise<void> {
  await apiPost({ action: "upsertInvitado", token, invitado });
}

export async function deleteInvitado(token: string, id: string): Promise<void> {
  await apiPost({ action: "deleteInvitado", token, id });
}
