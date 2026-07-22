import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAudioProxyBlobUrl } from "@/api/audioProxy";

interface ProxyAudioPlayerProps {
  url: string;
  className?: string;
}

// Plays call-recording audio through the backend audio-proxy instead of pointing
// <audio src> at the raw presigned S3 URL. Those URLs use temporary credentials
// (ASIA.../x-amz-security-token) and the S3 bucket sends no CORS headers, so the
// browser refuses to play them directly. The proxy fetches the bytes server-side
// and streams them back; we wrap the response in a blob: URL for the element.
export function ProxyAudioPlayer({ url, className }: ProxyAudioPlayerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let created: string | null = null;

    setLoading(true);
    setError(false);
    setBlobUrl(null);

    getAudioProxyBlobUrl(url)
      .then((objectUrl) => {
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        กำลังโหลดไฟล์เสียง...
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <p className="text-xs text-muted-foreground">
        ไม่สามารถเล่นไฟล์เสียงได้ (ลิงก์อาจหมดอายุ)
      </p>
    );
  }

  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio controls src={blobUrl} className={className ?? "w-full"} />;
}
