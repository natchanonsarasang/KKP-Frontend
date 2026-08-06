import { useEffect } from "react";

// Lightweight relay for the Google (implicit) and Microsoft (auth code + PKCE)
// popup flows. The provider redirects here with the result in the URL fragment;
// we forward it to the window that opened the popup (see api/oauth.ts) and close.
// Google returns `id_token`; Microsoft returns `code` (redeemed by the opener).
const OAuthCallback = () => {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);

    const payload = {
      type: "oauth-callback",
      id_token: params.get("id_token"),
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
      error_description: params.get("error_description"),
    };

    if (window.opener) {
      window.opener.postMessage(payload, window.location.origin);
      window.close();
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Completing sign-in…</div>
    </div>
  );
};

export default OAuthCallback;
