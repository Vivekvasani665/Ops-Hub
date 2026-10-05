import crypto from 'node:crypto';
import { env, payuEnabled, payuMissing, payuUrls } from '../../config/env';
import { AppError } from '../../utils/errors';

/**
 * PayU India Hosted Checkout (https://docs.payu.in/docs/prebuilt-checkout-page-integration) plus the
 * Verify Payment and Refund APIs. Server-side only: it is the only place PAYU_SALT is read.
 */

/** Fields posted to PayU's hosted checkout. Every value that enters the hash must be free of `|`. */
export interface PayuRequestFields {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  hash: string;
}

/** One transaction as reported by the Verify Payment API. */
export interface PayuTransaction {
  txnid: string;
  mihpayid: string;
  /** success | failure | pending | Not Found */
  status: string;
  unmappedstatus?: string;
  amt: string;
  mode?: string;
  bankcode?: string;
  card_no?: string;
  error_Message?: string;
}

/**
 * PayU is not configured. Outside production the error names the missing settings (names only, never
 * values) so a blank PAYU_MERCHANT_KEY / PAYU_SALT is obvious instead of a generic checkout failure.
 */
export const payuUnavailable = (message = 'Online payments are not available right now') =>
  new AppError(
    503,
    'PAYMENTS_UNAVAILABLE',
    message,
    env.NODE_ENV === 'production' ? undefined : { reason: 'PAYU_NOT_CONFIGURED', missing: payuMissing },
  );

const sha512 = (s: string) => crypto.createHash('sha512').update(s, 'utf8').digest('hex');

/** Order totals are integer paise; PayU takes rupees with two decimals. */
export const toPayuAmount = (paise: number) => (paise / 100).toFixed(2);
export const fromPayuAmount = (amount: string | undefined) => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** Values that go into a PayU hash: `|` would shift every later field. */
export const hashSafe = (v: string, max = 100) => v.replace(/[|\r\n]/g, ' ').trim().slice(0, max);

/** sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT) */
export function requestHash(f: Omit<PayuRequestFields, 'hash' | 'phone' | 'surl' | 'furl'>) {
  return sha512(
    [f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5, '', '', '', '', '', env.PAYU_SALT].join('|'),
  );
}

/**
 * Reverse hash of PayU's response:
 * sha512([additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export function responseHash(r: Record<string, string | undefined>) {
  const v = (k: string) => r[k] ?? '';
  const parts = [
    env.PAYU_SALT,
    v('status'),
    '', '', '', '', '',
    v('udf5'), v('udf4'), v('udf3'), v('udf2'), v('udf1'),
    v('email'), v('firstname'), v('productinfo'), v('amount'), v('txnid'), v('key'),
  ];
  if (r.additional_charges) parts.unshift(r.additional_charges);
  return sha512(parts.join('|'));
}

export function isValidResponseHash(r: Record<string, string | undefined>) {
  if (!env.PAYU_SALT || !r.hash) return false;
  const expected = Buffer.from(responseHash(r), 'utf8');
  const actual = Buffer.from(r.hash.toLowerCase(), 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Merchant postservice API: sha512(key|command|var1|SALT). */
async function command<T>(cmd: string, vars: Record<string, string>): Promise<T> {
  if (!payuEnabled) throw payuUnavailable();
  const body = new URLSearchParams({
    key: env.PAYU_MERCHANT_KEY!,
    command: cmd,
    ...vars,
    hash: sha512([env.PAYU_MERCHANT_KEY, cmd, vars.var1, env.PAYU_SALT].join('|')),
  });
  let res: Response;
  try {
    res = await fetch(payuUrls.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'Could not reach the payment gateway, please retry');
  }
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', `Payment gateway error (${res.status})`);
  return json;
}

export const payu = {
  /** What PayU recorded for each of our txnids; missing / "Not Found" entries are omitted. */
  async verifyPayments(txnids: string[]): Promise<PayuTransaction[]> {
    if (!txnids.length) return [];
    const res = await command<{ status: number; transaction_details?: Record<string, PayuTransaction> }>('verify_payment', {
      var1: txnids.join('|'),
    });
    return Object.values(res.transaction_details ?? {}).filter((t) => t && t.mihpayid && t.status !== 'Not Found');
  },

  /** Full refund of a captured transaction. `token` is our unique refund reference: PayU rejects a repeat. */
  async refund(mihpayid: string, amountPaise: number, token: string): Promise<{ requestId: string }> {
    const res = await command<{ status: number; msg?: string; request_id?: string | number }>('cancel_refund_transaction', {
      var1: mihpayid,
      var2: token,
      var3: toPayuAmount(amountPaise),
    });
    if (res.status !== 1) throw new AppError(502, 'REFUND_FAILED', res.msg ?? 'Refund was not accepted');
    return { requestId: String(res.request_id ?? token) };
  },
};

const MODE_INSTRUMENT: Record<string, string> = {
  UPI: 'upi',
  CC: 'card',
  DC: 'card',
  NB: 'netbanking',
  CASH: 'wallet',
  WALLET: 'wallet',
  EMI: 'emi',
  BNPL: 'paylater',
};

/** Instrument and a non-sensitive label (only the last 4 digits of a card) from a PayU response. */
export function describeInstrument(t: { mode?: string; bankcode?: string; cardnum?: string; card_no?: string }) {
  const mode = (t.mode ?? '').toUpperCase();
  const instrument = MODE_INSTRUMENT[mode] ?? (mode ? mode.toLowerCase() : null);
  let detail: string | null = null;
  if (instrument === 'card') {
    const last4 = (t.cardnum ?? t.card_no ?? '').replace(/\D/g, '').slice(-4);
    detail = [mode === 'CC' ? 'Credit card' : 'Debit card', last4 ? `•••• ${last4}` : null].filter(Boolean).join(' ');
  } else if (instrument === 'netbanking' || instrument === 'wallet') {
    detail = t.bankcode ?? null;
  }
  return { instrument, instrumentDetail: detail };
}
