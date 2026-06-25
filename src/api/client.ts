import { getToken } from "./authToken";

// Base URL for the Callecto Go API (Fiber + MongoDB), e.g. http://localhost:1818/api/v1
const BASE_URL = import.meta.env.VITE_CALLECTO_API_URL;

if (!BASE_URL) {
  // Surface misconfiguration early rather than firing requests at `undefined/...`.
  console.warn("VITE_CALLECTO_API_URL is not set; Callecto API calls will fail.");
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
}

/**
 * The Go API issues and validates its own JWT (see api/auth.ts). Every request
 * carries the stored token as the bearer credential; public endpoints (the
 * `/auth/*` routes) simply receive no Authorization header when none is stored.
 */
function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiRequest<T = unknown>(
  path: string,
  { method = "GET", body, query }: RequestOptions = {},
): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `${method} ${path} failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.message) message = String(err.message);
      else if (err?.error) message = String(err.error);
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => apiRequest<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
