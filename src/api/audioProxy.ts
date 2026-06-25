import { getToken } from "./authToken";

// Base URL for the Callecto Go API, e.g. http://localhost:1818/api/v1
const BASE_URL = import.meta.env.VITE_CALLECTO_API_URL;

// GET /api/v1/audio-proxy?url=...&download=1&filename=... — replaces the
// Supabase `audio-proxy` Edge Function. Requires the Bearer token (unlike
// apiRequest, the response body is binary, so it can't go through client.ts).
async function fetchAudioProxy(audioUrl: string, opts: { download?: boolean; filename?: string } = {}): Promise<Blob> {
  const params = new URLSearchParams({ url: audioUrl });
  if (opts.download) params.set("download", "1");
  if (opts.filename) params.set("filename", opts.filename);

  const token = getToken();
  const res = await fetch(`${BASE_URL}/audio-proxy?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Audio proxy failed (${res.status})`);
  return res.blob();
}

/** Fetch the audio and return a blob: URL suitable for an <audio> element. Caller must revoke it. */
export async function getAudioProxyBlobUrl(audioUrl: string): Promise<string> {
  const blob = await fetchAudioProxy(audioUrl);
  return URL.createObjectURL(blob);
}

/** Fetch the audio and trigger a browser download with the given filename. */
export async function downloadAudioViaProxy(audioUrl: string, filename = "call_audio.mp3"): Promise<void> {
  const blob = await fetchAudioProxy(audioUrl, { download: true, filename });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
