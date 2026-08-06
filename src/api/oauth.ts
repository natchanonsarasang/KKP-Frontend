// Browser-side helpers to sign in with Google / Microsoft.
//
// Google uses the OpenID implicit flow (`response_type=id_token`): we only need
// an identity token to exchange for a Callecto session.
//
// Microsoft uses the Authorization Code + PKCE flow (`response_type=code`) so we
// receive BOTH an `id_token` (exchanged for a Callecto session) AND an
// `access_token` scoped for Microsoft Graph (`User.Read`), which is used to call
// `https://graph.microsoft.com/v1.0/me` (see graph.ts). PKCE lets a public SPA
// redeem the code at the token endpoint without a client secret.
//
// Both open the provider's authorize endpoint in a popup that redirects back to
// OAUTH_CALLBACK_PATH, which postMessages the URL fragment to this window
// (see pages/OAuthCallback.tsx).
//
// Required env (frontend .env):
//   VITE_GOOGLE_CLIENT_ID       - Google OAuth client ID (type: Web application)
//   VITE_MICROSOFT_CLIENT_ID    - Microsoft (Entra) app client ID
//   VITE_MICROSOFT_TENANT       - tenant id, or "common"/"organizations" (default "common")
//
// Provider config required for the redirect to be accepted:
//   Google:    add `<origin>/auth/callback` to the client's Authorized redirect URIs
//   Microsoft: add `<origin>/auth/callback` as a **SPA** redirect URI (SPA type is
//              what enables the CORS-allowed, secretless PKCE token exchange)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const MS_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
const MS_TENANT = (import.meta.env.VITE_MICROSOFT_TENANT as string | undefined) || "common";

const OAUTH_CALLBACK_PATH = "/auth/callback";

// Graph scopes requested for Microsoft sign-in. `User.Read` grants the basic
// profile read at `/me`; add more (e.g. "Mail.Read") here when the corresponding
// Azure API permission is added.
const MS_SCOPES = "openid profile email User.Read";

interface CallbackData {
  type: "oauth-callback";
  id_token?: string | null;
  code?: string | null;
  state?: string | null;
  error?: string | null;
  error_description?: string | null;
}

export interface MicrosoftAuth {
  /** OpenID identity token — exchanged for a Callecto session. */
  idToken: string;
  /** Microsoft Graph access token — used for `Authorization: Bearer` calls to Graph. */
  accessToken: string;
}

/**
 * Opens `authUrl` in a popup and resolves with the callback data relayed back
 * from the OAuth callback page. Rejects on provider error or a state mismatch;
 * callers assert the specific field (`id_token` / `code`) they expect.
 */
function openOAuthPopup(authUrl: string, expectedState: string): Promise<CallbackData> {
  const popup = window.open(authUrl, "callecto-oauth", "width=500,height=650");
  if (!popup) {
    return Promise.reject(
      new Error("Popup blocked. Please allow popups for this site and try again."),
    );
  }

  return new Promise<CallbackData>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as CallbackData | undefined;
      if (!data || data.type !== "oauth-callback") return;
      settled = true;
      cleanup();
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      if (data.error) {
        reject(new Error(String(data.error_description || data.error)));
      } else if (data.state !== expectedState) {
        reject(new Error("Sign-in state mismatch. Please try again."));
      } else {
        resolve(data);
      }
    };

    window.addEventListener("message", onMessage);

    const closedTimer = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error("Sign-in was cancelled."));
      }
    }, 500);
  });
}

/** URL-safe base64 with no padding — the encoding PKCE requires. */
function base64UrlEncode(bytes: ArrayBuffer): string {
  let str = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a PKCE verifier + its S256 challenge. */
async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64UrlEncode(random.buffer);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(digest) };
}

export async function getGoogleIdToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured (set VITE_GOOGLE_CLIENT_ID).");
  }
  const redirectUri = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: "id_token",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    response_mode: "fragment",
    nonce,
    state,
    prompt: "select_account",
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const data = await openOAuthPopup(authUrl, state);
  if (!data.id_token) throw new Error("Provider did not return an id_token.");
  return data.id_token;
}

/**
 * Sign in with Microsoft and return both tokens. The `idToken` is exchanged for a
 * Callecto session; the `accessToken` calls Microsoft Graph (`User.Read`).
 */
export async function getMicrosoftAuth(): Promise<MicrosoftAuth> {
  if (!MS_CLIENT_ID) {
    throw new Error("Microsoft sign-in is not configured (set VITE_MICROSOFT_CLIENT_ID).");
  }
  const redirectUri = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const { verifier, challenge } = await createPkcePair();

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: MS_SCOPES,
    response_mode: "fragment",
    code_challenge: challenge,
    code_challenge_method: "S256",
    nonce,
    state,
    prompt: "select_account",
  });
  const authUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${params.toString()}`;

  const data = await openOAuthPopup(authUrl, state);
  if (!data.code) throw new Error("Microsoft did not return an authorization code.");
  return exchangeMicrosoftCode(data.code, verifier, redirectUri);
}

/** Redeem the PKCE authorization code for id + access tokens at the token endpoint. */
async function exchangeMicrosoftCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<MicrosoftAuth> {
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID as string,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    scope: MS_SCOPES,
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );

  const json = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      json.error_description || json.error || "Failed to exchange Microsoft authorization code.",
    );
  }
  if (!json.id_token) throw new Error("Microsoft token response is missing id_token.");
  if (!json.access_token) throw new Error("Microsoft token response is missing access_token.");
  return { idToken: json.id_token, accessToken: json.access_token };
}
