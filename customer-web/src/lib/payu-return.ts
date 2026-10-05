/**
 * PayU posts the transaction result (form-encoded) through the customer's browser to PAYU_SUCCESS_URL /
 * PAYU_FAILURE_URL, i.e. this app's /payment/success and /payment/failure. Nothing is decided here: the body
 * is forwarded unchanged to the backend, which verifies PayU's hash and re-reads the transaction from PayU,
 * and the customer is redirected by the verified outcome. Which URL PayU used is deliberately ignored.
 */

const apiUrl = process.env.API_URL || 'http://localhost:4500';

type Outcome = 'paid' | 'failed' | 'cancelled' | 'pending' | 'invalid';
interface Verified {
  outcome: Outcome;
  orderId: string | null;
}

function seeOther(location: string) {
  // Relative Location: correct behind any public hostname (tunnel, proxy) without knowing it.
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
}

export async function handlePayuReturn(req: Request): Promise<Response> {
  let result: Verified | null = null;
  try {
    const res = await fetch(`${apiUrl}/api/payments/payu/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: await req.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    result = ((await res.json().catch(() => null)) as { data?: Verified } | null)?.data ?? null;
  } catch {
    result = null;
  }

  if (!result?.orderId) return seeOther(`/orders?payment=${result ? result.outcome : 'pending'}`);
  const id = encodeURIComponent(result.orderId);
  return seeOther(result.outcome === 'paid' ? `/orders/${id}/success` : `/orders/${id}?payment=${result.outcome}`);
}

/** A refresh or bookmark of the return URL carries no PayU data. */
export function payuReturnGet() {
  return seeOther('/orders');
}
