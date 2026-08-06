// Microsoft Graph REST helpers.
//
// Called with the Graph access token obtained from the Microsoft sign-in flow
// (see oauth.ts `getMicrosoftAuth`). This is the "real" Graph usage: an
// authenticated `GET https://graph.microsoft.com/v1.0/me` — not just reading
// claims out of the ID token.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Basic profile returned by `GET /me` under the `User.Read` scope. */
export interface GraphProfile {
  id: string;
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
  preferredLanguage: string | null;
}

async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err?.error?.message || `Microsoft Graph ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Fetch the signed-in user's Microsoft Graph profile (`User.Read`). */
export function fetchGraphProfile(accessToken: string): Promise<GraphProfile> {
  return graphGet<GraphProfile>("/me", accessToken);
}
