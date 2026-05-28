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
  let raw = String(input).trim();

  // Step 1: If it starts with "+66", strip "+66" and prepend "0"
  if (raw.startsWith("+66")) {
    raw = "0" + raw.slice(3);
  } else if (raw.startsWith("66") && raw.length >= 11) {
    // Bare "66..." (no plus) — also normalize to "0..."
    raw = "0" + raw.slice(2);
  }

  // Step 2: Strip any remaining non-digit chars (spaces, dashes, parens)
  const digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;

  // Step 3: Validate Thai mobile/landline format (10 digits starting with 0)
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
      phoneRaw = url.searchParams.get("phone") ?? undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      phoneRaw = body?.phone;
    }

    if (!phoneRaw || typeof phoneRaw !== "string") {
      return json({ error: "Missing 'phone' in request" }, 400);
    }

    const normalized = normalizeThaiPhone(phoneRaw);
    console.log("dhipaya-check-intent phone:", phoneRaw, "→", normalized);
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
      "Policy",
      "Policy_Status (from Policy)",
      "Consent_Status (from Consents)",
      "Renewal_Premium (from Policy)",
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

    // Expiry_Date isn't exposed as a lookup on Customer — fetch from linked Policy record
    let expiryDate = "";
    const policyIds: string[] = Array.isArray(f["Policy"]) ? f["Policy"] : [];
    if (policyIds.length > 0) {
      try {
        const polRes = await fetch(
          `https://api.airtable.com/v0/${baseId}/Policy/${policyIds[0]}`,
          { headers: { Authorization: `Bearer ${pat}` } },
        );
        if (polRes.ok) {
          const polData = await polRes.json();
          expiryDate = firstString(polData?.fields?.["Expiry_Date"]);
        } else {
          console.error("Policy lookup failed", polRes.status);
        }
      } catch (e) {
        console.error("Policy fetch error", e);
      }
    }

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
