const STORAGE_KEY = "casamiento.adminPassphrase";

export function loadPassphrase(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function savePassphrase(value: string): void {
  localStorage.setItem(STORAGE_KEY, value);
}

export function clearPassphrase(): void {
  localStorage.removeItem(STORAGE_KEY);
}
