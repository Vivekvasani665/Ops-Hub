import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../../config/env';
import { Errors } from '../../utils/errors';
import { generateRefreshToken, hashToken } from '../auth/token.service';
import { Customer, CustomerSession } from './customer.model';
import type { RegisterCustomerInput } from './storefront.schemas';

// Different cookie names from the staff app: both apps may run on the same host (cookies ignore ports).
export const CUSTOMER_ACCESS_COOKIE = 'opshub_cat';
export const CUSTOMER_REFRESH_COOKIE = 'opshub_crt';

// A separate audience means a customer token is rejected by the staff API and vice versa.
const AUDIENCE = 'opshub-storefront';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

export interface CustomerTokenPayload {
  sub: string;
  org: string;
  name: string;
  email: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

interface CustomerLike {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string | null;
}

export function toProfile(c: CustomerLike): CustomerProfile {
  return { id: String(c._id), name: c.name, email: c.email, phone: c.phone ?? null };
}

export function verifyCustomerToken(token: string): CustomerTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'opshub', audience: AUDIENCE }) as CustomerTokenPayload;
}

async function issueSession(c: CustomerLike, client: ClientInfo, familyId: string = crypto.randomUUID()) {
  const payload: CustomerTokenPayload = { sub: String(c._id), org: String(c.organizationId), name: c.name, email: c.email };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'opshub',
    audience: AUDIENCE,
  });
  const refreshToken = generateRefreshToken();
  await CustomerSession.create({
    customerId: c._id,
    organizationId: c.organizationId,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    ip: client.ip,
    userAgent: client.userAgent,
  });
  return { customer: toProfile(c), accessToken, refreshToken };
}

export async function register(orgId: Types.ObjectId, input: RegisterCustomerInput, client: ClientInfo) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    const customer = await Customer.create({
      organizationId: orgId,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      passwordHash,
      lastLoginAt: new Date(),
    });
    return issueSession(customer, client);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw Errors.conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

export async function login(orgId: Types.ObjectId, email: string, password: string, client: ClientInfo) {
  const customer = await Customer.findOne({ organizationId: orgId, email: email.toLowerCase() }).select('+passwordHash');
  if (!customer) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw Errors.unauthenticated('Invalid email or password');
  }
  if (customer.lockUntil && customer.lockUntil > new Date()) {
    const minutes = Math.ceil((customer.lockUntil.getTime() - Date.now()) / 60_000);
    throw Errors.locked(`Too many failed attempts. Try again in ${minutes} minute(s).`);
  }
  if (!(await bcrypt.compare(password, customer.passwordHash))) {
    const updated = await Customer.findOneAndUpdate({ _id: customer._id }, { $inc: { failedLoginAttempts: 1 } }, { new: true });
    if (updated && updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await Customer.updateOne(
        { _id: customer._id },
        { $set: { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginAttempts: 0 } },
      );
    }
    throw Errors.unauthenticated('Invalid email or password');
  }
  if (customer.status !== 'ACTIVE') throw Errors.forbidden('Account is disabled');

  await Customer.updateOne(
    { _id: customer._id },
    { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } },
  );
  return issueSession(customer, client);
}

/** Rotation with reuse detection, same policy as staff sessions. */
export async function refresh(orgId: Types.ObjectId, rawToken: string | undefined, client: ClientInfo) {
  if (!rawToken) throw Errors.unauthenticated('Missing refresh token');
  const existing = await CustomerSession.findOne({ tokenHash: hashToken(rawToken), organizationId: orgId });
  if (!existing || existing.expiresAt < new Date()) throw Errors.unauthenticated('Invalid refresh token');

  if (existing.revokedAt) {
    await CustomerSession.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw Errors.unauthenticated('Session expired; please sign in again');
  }
  const claimed = await CustomerSession.findOneAndUpdate(
    { _id: existing._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (!claimed) throw Errors.unauthenticated('Refresh token already used');

  const customer = await Customer.findById(existing.customerId).lean();
  if (!customer || customer.status !== 'ACTIVE') throw Errors.unauthenticated('Account unavailable');
  return issueSession(customer, client, existing.familyId);
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  const session = await CustomerSession.findOne({ tokenHash: hashToken(rawToken) });
  if (session) {
    await CustomerSession.updateMany({ familyId: session.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}

export async function getProfile(customerId: Types.ObjectId): Promise<CustomerProfile> {
  const customer = await Customer.findById(customerId).lean();
  if (!customer || customer.status !== 'ACTIVE') throw Errors.unauthenticated();
  return toProfile(customer);
}
