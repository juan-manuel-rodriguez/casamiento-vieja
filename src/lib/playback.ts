/** Estado que reporta el embed de Spotify en cada `playback_update`. */
export type PlaybackState = {
  /** Posición actual, en milisegundos. */
  position?: number;
  /** Largo del clip que está sonando, en milisegundos. */
  duration?: number;
  isPaused?: boolean;
};

/**
 * Margen para dar por terminado el clip: el embed no siempre reporta
 * `position === duration` exacto en el último evento.
 */
export const PLAYBACK_END_SLACK_MS = 1500;

/**
 * ¿Hay que rebobinar y volver a arrancar?
 *
 * Spotify le sirve al embed un preview de ~25 s en vez del tema completo,
 * porque reproducirlo entero exige que el oyente tenga sesión de Spotify
 * iniciada en su navegador. Sin rebobinar, la música se corta sola apenas
 * termina el preview.
 *
 * Solo devuelve true cuando el clip llegó al final. Si el invitado lo pausa a
 * mano en el medio se respeta, para no pelearle al botón de pausa.
 */
export function shouldRestartClip(state: PlaybackState | undefined): boolean {
  if (!state?.isPaused) return false;
  const position = state.position ?? 0;
  const duration = state.duration ?? 0;
  if (duration <= 0) return false;
  return position >= duration - PLAYBACK_END_SLACK_MS;
}
