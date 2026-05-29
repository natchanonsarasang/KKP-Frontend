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

type Intent = string;

function firstString(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function detectSuffix(policy: string): "" | "_ISAN" | "_EN" {
  const up = policy.toUpperCase();
  if (up.endsWith("_ISAN")) return "_ISAN";
  if (up.endsWith("_EN")) return "_EN";
  return "";
}

function suffixLabel(suffix: "" | "_ISAN" | "_EN"): string {
  if (suffix === "_EN") return "[ENG]";
  if (suffix === "_ISAN") return "[ภาษาถิ่นอีสาน]";
  return "";
}

function routeIntent(policyStatus: unknown, consentStatus: unknown): { intent: Intent; suffix: string } {
  const policyRaw = firstString(policyStatus);
  const consent = firstString(consentStatus).toLowerCase();
  const suffix = detectSuffix(policyRaw);
  const label = suffixLabel(suffix);
  const base = suffix ? policyRaw.slice(0, policyRaw.length - suffix.length) : policyRaw;
  const baseLower = base.toLowerCase();

  // Priority 1: Already received consent — no suffix label
  if (consent === "consent received") return { intent: "เคยได้รับconsentแล้ว", suffix };

  if (baseLower === "overdue") {
    if (consent === "consent given") return { intent: `campaign2${label}`, suffix };
    if (!consent) return { intent: `consent${label}`, suffix };
  }
  if (baseLower === "prospect") {
    if (consent === "consent given") return { intent: `campaign3${label}`, suffix };
    if (!consent) return { intent: `consent${label}`, suffix };
  }
  return { intent: `consent${label}`, suffix };
}



function emptyPayload(intent: Intent, extras: Record<string, unknown> = {}) {
  return {
    intent,
    customer_name: "",
    name: "",
    renewal_premium: "",
    expiry_date: "",
    condition: "",
    ...extras,
  };
}

// Convert various Gregorian date strings into Thai Buddhist-Era DD/MM/YYYY (BE).
function toThaiBEDate(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  let d: number | undefined, m: number | undefined, y: number | undefined;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]);
  } else {
    const parts = s.split(/[\/\-.]/).map((p) => p.trim());
    if (parts.length >= 3) {
      d = Number(parts[0]); m = Number(parts[1]); y = Number(parts[2]);
    }
  }
  if (!d || !m || !y) return s;
  if (y < 2500) y += 543;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}/${pad(m)}/${y}`;
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
      `AND(REGEX_REPLACE({Phone_Number1}&"",'[^0-9]','')='${normalized}',{CheckCall}='Y')`;
    const fields = [
      "Phone_Number1",
      "First_Name",
      "Last_Name",
      "Policy",
      "Policy_Status (from Policy)",
      "Consent_Status (from Consents)",
      "Renewal_Premium (from Policy)",
      "CheckCall",
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
    let expiryDateRaw = "";
    let planCode = "";
    const policyIds: string[] = Array.isArray(f["Policy"]) ? f["Policy"] : [];
    if (policyIds.length > 0) {
      try {
        const polRes = await fetch(
          `https://api.airtable.com/v0/${baseId}/Policy/${policyIds[0]}`,
          { headers: { Authorization: `Bearer ${pat}` } },
        );
        if (polRes.ok) {
          const polData = await polRes.json();
          expiryDateRaw = firstString(polData?.fields?.["Expiry_Date"]);
          planCode = firstString(polData?.fields?.["Plan_Code"]);
        } else {
          console.error("Policy lookup failed", polRes.status);
        }
      } catch (e) {
        console.error("Policy fetch error", e);
      }
    }

    const expiryDate = toThaiBEDate(expiryDateRaw);

    // Lookup Condition_TH from INSTALLMENT_KB by Plan_Code.
    // On the Policy table, Plan_Code is a linked-record array of INSTALLMENT_KB ids,
    // so we fetch the linked record directly when it looks like an Airtable record id.
    let condition = "";
    if (planCode) {
      try {
        const isRecordId = /^rec[A-Za-z0-9]{14}$/.test(planCode);
        const kbUrl = isRecordId
          ? `https://api.airtable.com/v0/${baseId}/INSTALLMENT_KB/${planCode}`
          : `https://api.airtable.com/v0/${baseId}/INSTALLMENT_KB` +
            `?filterByFormula=${encodeURIComponent(`{Plan_Code}='${planCode.replace(/'/g, "\\'")}'`)}` +
            `&maxRecords=1` +
            `&fields%5B%5D=${encodeURIComponent("Plan_Code")}` +
            `&fields%5B%5D=${encodeURIComponent("Condition_TH")}`;
        const kbRes = await fetch(kbUrl, {
          headers: { Authorization: `Bearer ${pat}` },
        });
        if (kbRes.ok) {
          const kbData = await kbRes.json();
          const fields = isRecordId ? kbData?.fields : kbData?.records?.[0]?.fields;
          condition = firstString(fields?.["Condition_TH"]);
        } else {
          console.error("INSTALLMENT_KB lookup failed", kbRes.status, await kbRes.text().catch(() => ""));
        }
      } catch (e) {
        console.error("INSTALLMENT_KB fetch error", e);
      }
    }
    console.log("dhipaya-check-intent Plan_Code:", planCode, "Condition_TH:", condition);

    console.log("dhipaya-check-intent Consent_Status:", firstString(consentStatus), "Policy_Status:", firstString(policyStatus));
    const { intent, suffix } = routeIntent(policyStatus, consentStatus);
    console.log("dhipaya-check-intent suffix:", suffix || "(none)", "selected intent:", intent);


    return json({
      intent,
      customer_name: [firstName, lastName].filter(Boolean).join(" "),
      name: firstName,
      renewal_premium: renewalPremium,
      expiry_date: expiryDate,
      condition,
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
