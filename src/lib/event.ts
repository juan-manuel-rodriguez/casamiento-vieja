import { useSyncExternalStore } from "react";
import { DEFAULT_EVENT, type EventConfig } from "../config";

/**
 * El contenido de la invitación en uso.
 *
 * Arranca con los valores de `config.ts` para que la página pinte de una, sin
 * esperar al backend, y se refresca cuando llega lo que hay guardado en el
 * Sheet. Si el backend no contesta, la invitación se sigue viendo entera con
 * los valores por defecto.
 *
 * Vive en un store propio y no en un contexto de React para que cualquier
 * componente lo lea sin tener que envolver el árbol ni pasarlo por props: la
 * invitación la consumen una decena de componentes sueltos.
 */
let current: EventConfig = DEFAULT_EVENT;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEvent(): EventConfig {
  return current;
}

/**
 * Pisa los campos que vengan definidos y deja el resto en su valor por
 * defecto. Un campo vacío en el Sheet NO borra el default: para eso hay que
 * escribir un valor, no dejarlo en blanco. Así una fila mal cargada no deja
 * la invitación sin fecha ni lugar.
 */
export function applyEventOverrides(overrides: Partial<EventConfig> | null | undefined): void {
  if (!overrides) return;
  const next: Record<string, unknown> = { ...current };
  let changed = false;

  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in DEFAULT_EVENT)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (JSON.stringify(next[key]) === JSON.stringify(value)) continue;
    next[key] = value;
    changed = true;
  }

  if (!changed) return;
  current = next as EventConfig;
  for (const listener of listeners) listener();
}

/** Vuelve a los valores de `config.ts`. Solo lo usan las pruebas. */
export function resetEvent(): void {
  current = DEFAULT_EVENT;
  for (const listener of listeners) listener();
}

export function useEvent(): EventConfig {
  return useSyncExternalStore(subscribe, getEvent, getEvent);
}
