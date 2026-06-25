// Token + user storage for the Callecto Go API auth.
//
// Auth has moved off Supabase: the Go API (`/api/v1/auth/*`) issues its own
// HS256 JWT plus the user profile. We persist both in localStorage and notify
// subscribers (AuthContext, etc.) whenever the session changes — including
// cross-tab changes via the `storage` event.

const TOKEN_KEY = "callecto_token";
const USER_KEY = "callecto_user";

// Mirrors callecto-api `entities.UserDataModel` (the `json:"..."` tags).
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider?: string;
  email_verified?: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

/** Subscribe to session changes (login/logout, this tab or another). Returns an unsubscribe. */
export function subscribeAuth(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Keep tabs in sync: a login/logout in one tab updates the others.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === TOKEN_KEY || e.key === USER_KEY) emit();
  });
}

/** Decode a JWT payload without verifying the signature (client-side use only). */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const claims = decodeJwt(token);
  const exp = claims?.exp;
  if (typeof exp !== "number") return false; // no exp claim -> treat as non-expiring
  return Date.now() >= exp * 1000;
}

/** The current bearer token, or null if absent/expired (expired tokens are cleared). */
export function getToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  if (isExpired(token)) {
    clearSession();
    return null;
  }
  return token;
}

export function getStoredUser(): AuthUser | null {
  // A stored user without a valid token is a stale/expired session.
  if (!getToken()) return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emit();
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emit();
}
