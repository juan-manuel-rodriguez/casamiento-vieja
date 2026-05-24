import { ADMIN_EMAILS, GOOGLE_CLIENT_ID } from "../config";

const OAUTH_SCOPES = "openid email profile";
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const SESSION_STORAGE_KEY = "casamiento.session";
const SESSION_GRACE_MS = 60_000;

type TokenResponse = { access_token: string; expires_in: number; error?: string };

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (response: TokenResponse) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export type Session = {
  token: string;
  email: string;
  expiresAt: number;
};

let gisLoadPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt < Date.now() + SESSION_GRACE_MS) return null;
    return session;
  } catch {
    return null;
  }
}

function persistSession(session: Session): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function signOut(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function fetchUserEmail(token: string): Promise<string> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("No se pudo leer el email del usuario");
  const json = (await response.json()) as { email?: string };
  if (!json.email) throw new Error("Google no devolvió email");
  return json.email;
}

export async function signIn(): Promise<Session> {
  await loadGoogleIdentityServices();
  const google = window.google!;
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: OAUTH_SCOPES,
      callback: async (response) => {
        if (response.error) return reject(new Error(response.error));
        try {
          const email = await fetchUserEmail(response.access_token);
          if (!ADMIN_EMAILS.includes(email)) {
            return reject(new Error(`Esta cuenta (${email}) no tiene acceso al admin`));
          }
          const session: Session = {
            token: response.access_token,
            email,
            expiresAt: Date.now() + response.expires_in * 1000,
          };
          persistSession(session);
          resolve(session);
        } catch (err) {
          reject(err);
        }
      },
    });
    client.requestAccessToken();
  });
}
