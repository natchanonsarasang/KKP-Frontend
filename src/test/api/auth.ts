// Callecto Go API authentication.
//
// Replaces Supabase Auth: these call the Go `/api/v1/auth/*` endpoints, which
// return `{ message, data: { token, expires_in, user } }`. On success we persist
// the token + user (see authToken.ts), which is then sent as the bearer token on
// every subsequent API request (see client.ts).

import { apiRequest } from "./client";
import { setSession, clearSession, type AuthUser } from "./authToken";

interface AuthResponse {
  token: string;
  expires_in: number;
  user: AuthUser;
}

async function authenticate(path: string, body: unknown): Promise<AuthUser> {
  // Auth endpoints are public; apiRequest sends no bearer token when none is stored.
  const res = await apiRequest<{ data: AuthResponse }>(path, { method: "POST", body });
  const auth = res.data;
  if (!auth?.token) {
    throw new Error("Authentication failed: no token returned");
  }
  setSession(auth.token, auth.user);
  return auth.user;
}

export function loginWithPassword(email: string, password: string): Promise<AuthUser> {
  return authenticate("/auth/login", { email, password });
}

export function registerAccount(
  email: string,
  password: string,
  name: string,
): Promise<AuthUser> {
  return authenticate("/auth/register", { email, password, name });
}

/** Exchange a Google ID token (credential) for a Callecto session. */
export function loginWithGoogle(idToken: string): Promise<AuthUser> {
  return authenticate("/auth/google", { id_token: idToken });
}

/** Exchange a Microsoft ID token for a Callecto session. */
export function loginWithMicrosoft(idToken: string): Promise<AuthUser> {
  return authenticate("/auth/microsoft", { id_token: idToken });
}

export function logout(): void {
  clearSession();
}
