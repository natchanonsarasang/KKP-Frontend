// Vercel serverless function purely for logging what the frontend sends when a
// call starts. The real call still goes browser -> Go API directly; the frontend
// also fires a copy here so the payload shows up in the Vercel dashboard logs
// (Deployment -> Logs / Runtime Logs). Client console.log never reaches Vercel,
// so this server-side console.log is what makes it visible there.
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // req.body is auto-parsed for application/json by the Vercel Node runtime.
  console.log("[make-call] payload:", JSON.stringify(req.body ?? {}, null, 2));

  res.status(200).json({ ok: true });
}
