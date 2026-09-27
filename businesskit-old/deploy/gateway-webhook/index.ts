/**
 * Cloudflare Worker — Payment Gateway Webhook Receiver
 * Path: deploy/gateway-webhook/index.ts
 *
 * Receives webhooks from payment gateways (Razorpay, Stripe, UPI/PayU),
 * validates signatures, and writes directly to the user's Turso UserDB
 * via the /v2/pipeline HTTP API.
 *
 * Environment Variables / Secrets required:
 *   TURSO_DATABASE_URL    - https://[user-db].turso.io
 *   TURSO_AUTH_TOKEN      - UserDB auth token (from vault)
 *   PROFILE_ID            - Active profile ID
 *   CONNECTION_ID         - Linked connection ID in connections table
 *   WEBHOOK_SECRET        - Gateway webhook signing secret (e.g. whsec_... or Razorpay secret)
 */

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  PROFILE_ID: string;
  CONNECTION_ID?: string;
  WEBHOOK_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const url = new URL(request.url);
      const provider = url.searchParams.get("provider") || "razorpay";
      const rawBody = await request.text();

      // Signature Verification (Stripe / Razorpay)
      const signatureHeader =
        request.headers.get("x-razorpay-signature") ||
        request.headers.get("stripe-signature") ||
        request.headers.get("x-webhook-signature");

      if (env.WEBHOOK_SECRET && signatureHeader) {
        const isValid = await verifyHmacSignature(rawBody, signatureHeader, env.WEBHOOK_SECRET);
        if (!isValid) {
          return new Response("Invalid webhook signature", { status: 401 });
        }
      }

      const payload = JSON.parse(rawBody);
      let providerTxnId = "";
      let amount = 0;
      let currency = "INR";
      let status = "success";

      // Parse gateway-specific payload
      if (provider === "razorpay") {
        const payment = payload?.payload?.payment?.entity;
        providerTxnId = payment?.id || payload?.id || "";
        amount = (payment?.amount || 0) / 100; // Razorpay amounts in paise
        currency = payment?.currency || "INR";
        status = payment?.status === "captured" || payment?.status === "authorized" ? "success" : payment?.status || "success";
      } else if (provider === "stripe") {
        const obj = payload?.data?.object;
        providerTxnId = obj?.id || payload?.id || "";
        amount = (obj?.amount || 0) / 100; // Stripe amounts in cents
        currency = (obj?.currency || "inr").toUpperCase();
        status = payload?.type === "payment_intent.succeeded" || payload?.type === "charge.succeeded" ? "success" : "pending";
      } else {
        // Generic / UPI / PayU
        providerTxnId = payload?.txn_id || payload?.txnid || payload?.id || "";
        amount = Number(payload?.amount || 0);
        currency = payload?.currency || "INR";
        status = payload?.status || "success";
      }

      if (!providerTxnId || amount <= 0) {
        return new Response("Invalid transaction payload", { status: 400 });
      }

      const id = `gtxn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Math.floor(Date.now() / 1000);
      const connectionId = env.CONNECTION_ID || "default";

      // Write directly to user's Turso DB via /v2/pipeline
      const pipelineUrl = `${env.TURSO_DATABASE_URL.replace(/\/$/, "")}/v2/pipeline`;
      const sql = `
        INSERT INTO fin_gateway_transactions
        (id, profile_id, connection_id, provider, provider_txn_id, amount, currency, status, match_status, received_at, raw_payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unmatched', ?, ?)
        ON CONFLICT(profile_id, provider, provider_txn_id) DO UPDATE SET
          amount = excluded.amount,
          status = excluded.status,
          raw_payload = excluded.raw_payload;
      `;

      const pipelineBody = {
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: [
                { type: "text", value: id },
                { type: "text", value: env.PROFILE_ID },
                { type: "text", value: connectionId },
                { type: "text", value: provider },
                { type: "text", value: providerTxnId },
                { type: "float", value: amount },
                { type: "text", value: currency },
                { type: "text", value: status },
                { type: "integer", value: now.toString() },
                { type: "text", value: rawBody },
              ],
            },
          },
          { type: "close" },
        ],
      };

      const tursoRes = await fetch(pipelineUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pipelineBody),
      });

      if (!tursoRes.ok) {
        const errText = await tursoRes.text();
        return new Response(`Turso write failed: ${errText}`, { status: 500 });
      }

      return new Response(JSON.stringify({ ok: true, id, providerTxnId, amount }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (err: any) {
      return new Response(`Webhook handler error: ${err?.message || err}`, { status: 500 });
    }
  },
};

/**
 * Validates HMAC SHA-256 webhook signatures using Web Crypto API.
 */
async function verifyHmacSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    const expectedSigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expectedSigHex = Array.from(new Uint8Array(expectedSigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return signature.toLowerCase() === expectedSigHex.toLowerCase();
  } catch {
    return false;
  }
}
