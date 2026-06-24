// Browser-side helpers to obtain an OpenID `id_token` from Google / Microsoft,
// which is then exchanged for a Callecto session via the Go `/auth/{google,microsoft}`
// endpoints (see auth.ts).
//
// Both providers use the same approach: open the provider's authorize endpoint in
// a popup using the implicit flow (`response_type=id_token`), let it redirect back
// to OAUTH_CALLBACK_PATH, which postMessages the URL fragment to this window
// (see pages/OAuthCallback.tsx). This avoids the GIS One Tap / FedCM flow entirely.
//
// Required env (frontend .env):
//   VITE_GOOGLE_CLIENT_ID       - Google OAuth client ID (type: Web application)
//   VITE_MICROSOFT_CLIENT_ID    - Microsoft (Entra) app client ID
//   VITE_MICROSOFT_TENANT       - tenant id, or "common"/"organizations" (default "common")
//
// Provider config required for the redirect to be accepted:
//   Google:    add `<origin>/auth/callback` to the client's Authorized redirect URIs
//   Microsoft: add `<origin>/auth/callback` as a SPA redirect URI

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const MS_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
const MS_TENANT = (import.meta.env.VITE_MICROSOFT_TENANT as string | undefined) || "common";

const OAUTH_CALLBACK_PATH = "/auth/callback";

interface CallbackData {
  type: "oauth-callback";
  id_token?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * Opens `authUrl` in a popup and resolves with the `id_token` relayed back from
 * the OAuth callback page. `expectedState` guards against cross-window mix-ups.
 */
function popupIdToken(authUrl: string, expectedState: string): Promise<string> {
  const popup = window.open(authUrl, "callecto-oauth", "width=500,height=650");
  if (!popup) {
    return Promise.reject(
      new Error("Popup blocked. Please allow popups for this site and try again."),
    );
  }

  return new Promise<string>((resolve, reject) => {
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
      } else if (data.id_token) {
        resolve(String(data.id_token));
      } else {
        reject(new Error("Provider did not return an id_token."));
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
  return popupIdToken(authUrl, state);
}

export async function getMicrosoftIdToken(): Promise<string> {
  if (!MS_CLIENT_ID) {
    throw new Error("Microsoft sign-in is not configured (set VITE_MICROSOFT_CLIENT_ID).");
  }
  const redirectUri = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "id_token",
    redirect_uri: redirectUri,
    scope: "openid profile email",
    response_mode: "fragment",
    nonce,
    state,
  });
  const authUrl = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/authorize?${params.toString()}`;
  return popupIdToken(authUrl, state);
}
