import { ADMIN_EMAILS, GOOGLE_CLIENT_ID } from "../config";

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const GSI_SRC = "https://accounts.google.com/gsi/client";

// Tipos mínimos del Google Identity Services. No usamos @types/google.accounts
// para no agregar otra dep.
type TokenResponse = { access_token: string; expires_in: number; error?: string };
type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (r: TokenResponse) => void;
};
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let gsiPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

export type Session = {
  token: string;
  email: string;
  expiresAt: number;
};

const SESSION_KEY = "casamiento.session";

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (s.expiresAt < Date.now() + 60_000) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

async function fetchEmail(token: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("No se pudo leer el email del usuario");
  const json = (await res.json()) as { email?: string };
  if (!json.email) throw new Error("Google no devolvió email");
  return json.email;
}

export async function signIn(): Promise<Session> {
  await loadGsi();
  const google = window.google!;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: `${SCOPES} email`,
      callback: async (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        try {
          const email = await fetchEmail(resp.access_token);
          if (!ADMIN_EMAILS.includes(email)) {
            return reject(new Error(`Esta cuenta (${email}) no tiene acceso al admin.`));
          }
          const session: Session = {
            token: resp.access_token,
            email,
            expiresAt: Date.now() + resp.expires_in * 1000,
          };
          saveSession(session);
          resolve(session);
        } catch (err) {
          reject(err);
        }
      },
    });
    client.requestAccessToken();
  });
}
