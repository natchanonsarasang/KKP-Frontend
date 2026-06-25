import { useEffect, useState } from "react";
import { getAudioProxyBlobUrl } from "@/api/audioProxy";

interface AudioProxyPlayerProps {
  audioUrl: string;
  className?: string;
}

/** <audio> player backed by the Go audio-proxy endpoint, which requires an
 *  Authorization header an <audio src> can't send — fetch the blob ourselves. */
export function AudioProxyPlayer({ audioUrl, className }: AudioProxyPlayerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    getAudioProxyBlobUrl(audioUrl)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setBlobUrl(u);
      })
      .catch((err) => console.error("Audio proxy load error:", err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioUrl]);

  if (!blobUrl) return null;
  return <audio controls src={blobUrl} className={className} />;
}
