// Dhipaya: Check intent by phone number
// Looks up Airtable Customer.Phone_Number1 and returns the next intent based on CheckCall.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeThaiPhone(input?: string | null): string | undefined {
  if (!input) return undefined;
  let digits = String(input).replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("66")) digits = "0" + digits.slice(2);
  if (digits.length === 9 && !digits.startsWith("0")) digits = "0" + digits;
  if (digits.length !== 10 || !digits.startsWith("0")) return undefined;
  return digits;
}

type Intent = "consent" | "campaign2" | "campaign3";

function firstString(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function routeIntent(policyStatus: unknown, consentStatus: unknown): Intent {
  const policy = firstString(policyStatus).toLowerCase();
  const consent = firstString(consentStatus).toLowerCase();

  // Priority 1: Policy_Status
  if (policy === "overdue") {
    if (consent === "consent given") return "campaign2";
    if (consent === "") return "consent";
    return "consent"; // Consent Denied or any other → fallback
  }
  if (policy === "prospect") {
    if (consent === "consent given") return "campaign3";
    if (consent === "") return "consent";
    return "consent";
  }
  return "consent";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let phoneRaw: string | undefined;
    if (req.method === "GET") {
      const url = new URL(req.url);
      phoneRaw = url.searchParams.get("phone") ?? undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      phoneRaw = body?.phone ?? body?.phone_number ?? body?.Phone_Number1;
    }

    if (!phoneRaw || typeof phoneRaw !== "string") {
      return json({ error: "Missing 'phone' in request" }, 400);
    }

    const normalized = normalizeThaiPhone(phoneRaw);
    if (!normalized) {
      return json({
        intent: "consent",
        fallback: true,
        reason: "invalid_phone",
        phone: phoneRaw,
        matched: false,
      });
    }

    const pat = Deno.env.get("AIRTABLE_PAT");
    const baseId = Deno.env.get("AIRTABLE_BASE_ID");
    if (!pat || !baseId) {
      console.error("Airtable credentials missing");
      return json({
        intent: "consent",
        fallback: true,
        reason: "airtable_not_configured",
        phone: normalized,
        matched: false,
      });
    }

    const formula =
      `REGEX_REPLACE({Phone_Number1}&"",'[^0-9]','')='${normalized}'`;
    const url =
      `https://api.airtable.com/v0/${baseId}/Customer` +
      `?filterByFormula=${encodeURIComponent(formula)}` +
      `&maxRecords=1` +
      `&fields%5B%5D=Phone_Number1` +
      `&fields%5B%5D=${encodeURIComponent("Policy_Status (from Policy)")}` +
      `&fields%5B%5D=${encodeURIComponent("Consent_Status (from Consents)")}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Airtable lookup failed", res.status, text);
      return json({
        intent: "consent",
        fallback: true,
        reason: "airtable_error",
        phone: normalized,
        matched: false,
      });
    }

    const data = await res.json();
    const record = data?.records?.[0];

    if (!record) {
      return json({
        intent: "consent",
        fallback: true,
        reason: "not_found",
        phone: normalized,
        matched: false,
      });
    }

    const policyStatus = record.fields?.["Policy_Status (from Policy)"];
    const consentStatus = record.fields?.["Consent_Status (from Consents)"];
    const intent = routeIntent(policyStatus, consentStatus);

    return json({
      intent,
      phone: normalized,
      policyStatus: policyStatus ?? null,
      consentStatus: consentStatus ?? null,
      matched: true,
    });
  } catch (err) {
    console.error("dhipaya-check-intent error", err);
    return json({
      intent: "consent",
      fallback: true,
      reason: "internal_error",
      matched: false,
    }, 200);
  }
});
