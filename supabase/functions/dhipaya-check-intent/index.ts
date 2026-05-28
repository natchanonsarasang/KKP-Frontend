// Dhipaya: Check intent by phone number
// Looks up Airtable Customer.Phone_Number1 and returns the next intent + customer info.

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
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function routeIntent(policyStatus: unknown, consentStatus: unknown): Intent {
  const policy = firstString(policyStatus).toLowerCase();
  const consent = firstString(consentStatus).toLowerCase();

  if (policy === "overdue") {
    if (consent === "consent given") return "campaign2";
    return "consent";
  }
  if (policy === "prospect") {
    if (consent === "consent given") return "campaign3";
    return "consent";
  }
  return "consent";
}

function emptyPayload(intent: Intent, extras: Record<string, unknown> = {}) {
  return {
    intent,
    customer_name: "",
    name: "",
    renewal_premium: "",
    expiry_date: "",
    ...extras,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let phoneRaw: string | undefined;
    if (req.method === "GET") {
      const url = new URL(req.url);
      phoneRaw =
        url.searchParams.get("customer_id") ??
        url.searchParams.get("phone") ??
        undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      phoneRaw =
        body?.customer_id ??
        body?.phone ??
        body?.phone_number ??
        body?.Phone_Number1;
    }

    if (!phoneRaw || typeof phoneRaw !== "string") {
      return json({ error: "Missing 'customer_id' in request" }, 400);
    }

    const normalized = normalizeThaiPhone(phoneRaw);
    if (!normalized) {
      return json(
        emptyPayload("consent", {
          fallback: true,
          reason: "invalid_phone",
          matched: false,
        }),
      );
    }

    const pat = Deno.env.get("AIRTABLE_PAT");
    const baseId = Deno.env.get("AIRTABLE_BASE_ID");
    if (!pat || !baseId) {
      console.error("Airtable credentials missing");
      return json(
        emptyPayload("consent", {
          fallback: true,
          reason: "airtable_not_configured",
          matched: false,
        }),
      );
    }

    const formula =
      `REGEX_REPLACE({Phone_Number1}&"",'[^0-9]','')='${normalized}'`;
    const fields = [
      "Phone_Number1",
      "First_Name",
      "Last_Name",
      "Policy_Status (from Policy)",
      "Consent_Status (from Consents)",
      "Renewal_Premium (from Policy)",
      "Expiry_Date (from Policy)",
    ];
    const url =
      `https://api.airtable.com/v0/${baseId}/Customer` +
      `?filterByFormula=${encodeURIComponent(formula)}` +
      `&maxRecords=1` +
      fields.map((f) => `&fields%5B%5D=${encodeURIComponent(f)}`).join("");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Airtable lookup failed", res.status, text);
      return json(
        emptyPayload("consent", {
          fallback: true,
          reason: "airtable_error",
          matched: false,
        }),
      );
    }

    const data = await res.json();
    const record = data?.records?.[0];

    if (!record) {
      return json(
        emptyPayload("consent", {
          fallback: true,
          reason: "not_found",
          matched: false,
        }),
      );
    }

    const f = record.fields ?? {};
    const policyStatus = f["Policy_Status (from Policy)"];
    const consentStatus = f["Consent_Status (from Consents)"];
    const firstName = firstString(f["First_Name"]);
    const lastName = firstString(f["Last_Name"]);
    const renewalPremium = firstString(f["Renewal_Premium (from Policy)"]);
    const expiryDate = firstString(f["Expiry_Date (from Policy)"]);
    const intent = routeIntent(policyStatus, consentStatus);

    return json({
      intent,
      customer_name: [firstName, lastName].filter(Boolean).join(" "),
      name: firstName,
      renewal_premium: renewalPremium,
      expiry_date: expiryDate,
    });
  } catch (err) {
    console.error("dhipaya-check-intent error", err);
    return json(
      emptyPayload("consent", {
        fallback: true,
        reason: "internal_error",
        matched: false,
      }),
    );
  }
});
