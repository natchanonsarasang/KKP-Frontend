import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/botnoi-webhook`;

export function WebhookSettingsTab() {
  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Webhook URL</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <code className="flex-1 p-3 rounded-md bg-muted text-sm font-mono text-muted-foreground truncate">
            {webhookUrl}
          </code>
          <Button variant="outline" size="icon" onClick={copyWebhook}>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Configure this URL in Botnoi Voice dashboard to receive call results
        </p>
        <details className="mt-4">
          <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            📋 Expected JSON Format
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre">
{`{
  "outbound_id": "8333484597",
  "phone_number": "0655238453",
  "appointment_time": "",
  "appointment_date": "",
  "status": "completed",
  "outbound_start": "0001-01-01T00:00:00Z",
  "action": "Unknown",
  "conversation_log": "2026-03-27 17:21:21 Bot: สวัสดีค่ะ...\\n2026-03-27 17:21:41 User: ...",
  "audio_url": "https://voicebot-audiologs.s3.../.wav"
}`}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
