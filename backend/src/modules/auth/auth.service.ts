import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';
import type { AuthUser, Role } from '@shared';
import { env } from '../../config/env';
import { Errors } from '../../utils/errors';
import { User } from '../users/user.model';
import { Organization } from '../organizations/organization.model';
import { RefreshToken } from './refresh-token.model';
import { generateRefreshToken, hashToken, signAccessToken } from './token.service';
import { recordAudit } from '../audit/audit.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
// Used to keep timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

async function toAuthUser(user: {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  organizationId: Types.ObjectId;
}): Promise<AuthUser> {
  const org = await Organization.findById(user.organizationId).lean();
  if (!org) throw Errors.unauthenticated();
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    organization: { id: String(org._id), name: org.name, slug: org.slug },
  };
}

async function issueSession(
  user: { _id: Types.ObjectId; name: string; email: string; role: Role; organizationId: Types.ObjectId },
  client: ClientInfo,
  familyId: string = crypto.randomUUID(),
): Promise<IssuedSession & { refreshHash: string }> {
  const accessToken = signAccessToken({
    sub: String(user._id),
    org: String(user.organizationId),
    role: user.role,
    name: user.name,
  });
  const refreshToken = generateRefreshToken();
  const refreshHash = hashToken(refreshToken);
  await RefreshToken.create({
    userId: user._id,
    organizationId: user.organizationId,
    tokenHash: refreshHash,
    familyId,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    ip: client.ip,
    userAgent: client.userAgent,
  });
  return { user: await toAuthUser(user), accessToken, refreshToken, refreshHash };
}

export async function login(email: string, password: string, client: ClientInfo): Promise<IssuedSession> {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw Errors.unauthenticated('Invalid email or password');
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60_000);
    throw Errors.locked(`Too many failed attempts. Try again in ${minutes} minute(s).`);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    // Atomic increment so parallel brute-force attempts are all counted.
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true },
    );
    if (updated && updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await User.updateOne(
        { _id: user._id },
        { $set: { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginAttempts: 0 } },
      );
    }
    await recordAudit({
      organizationId: user.organizationId,
      actor: { id: user._id, name: user.name },
      action: 'USER_LOGIN_FAILED',
      entityType: 'USER',
      entityId: user._id,
      metadata: { ip: client.ip },
      ip: client.ip,
    });
    throw Errors.unauthenticated('Invalid email or password');
  }

  if (user.status !== 'ACTIVE') throw Errors.forbidden('Account is disabled');
  const org = await Organization.findById(user.organizationId).lean();
  if (!org || org.status !== 'ACTIVE') throw Errors.forbidden('Organization is suspended');

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } },
  );
  await recordAudit({
    organizationId: user.organizationId,
    actor: { id: user._id, name: user.name },
    action: 'USER_LOGGED_IN',
    entityType: 'USER',
    entityId: user._id,
    metadata: { email: user.email },
    ip: client.ip,
  });

  const { refreshHash: _, ...session } = await issueSession(user, client);
  return session;
}

/**
 * Refresh-token rotation with reuse detection:
 *  - a valid token is atomically revoked and replaced by a new one (same family);
 *  - presenting an already-revoked token means it was stolen/replayed, so the whole family is revoked.
 */
export async function refresh(rawToken: string | undefined, client: ClientInfo): Promise<IssuedSession> {
  if (!rawToken) throw Errors.unauthenticated('Missing refresh token');
  const tokenHash = hashToken(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing || existing.expiresAt < new Date()) throw Errors.unauthenticated('Invalid refresh token');

  if (existing.revokedAt) {
    await RefreshToken.updateMany(
      { familyId: existing.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw Errors.unauthenticated('Refresh token reuse detected; please sign in again');
  }

  // Claim the token atomically so two concurrent refreshes cannot both succeed.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: existing._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );
  if (!claimed) throw Errors.unauthenticated('Refresh token already used');

  const user = await User.findById(existing.userId);
  if (!user || user.status !== 'ACTIVE') throw Errors.unauthenticated('Account unavailable');

  const { refreshHash, ...session } = await issueSession(user, client, existing.familyId);
  await RefreshToken.updateOne({ _id: claimed._id }, { $set: { replacedByHash: refreshHash } });
  return session;
}

export async function logout(rawToken: string | undefined, actor?: { userId: Types.ObjectId; orgId: Types.ObjectId; name: string }) {
  if (rawToken) {
    const token = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
    if (token) {
      await RefreshToken.updateMany({ familyId: token.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
  }
  if (actor) {
    await recordAudit({
      organizationId: actor.orgId,
      actor: { id: actor.userId, name: actor.name },
      action: 'USER_LOGGED_OUT',
      entityType: 'USER',
      entityId: actor.userId,
    });
  }
}

export async function getMe(userId: Types.ObjectId): Promise<AuthUser> {
  const user = await User.findById(userId).lean();
  if (!user || user.status !== 'ACTIVE') throw Errors.unauthenticated();
  return toAuthUser(user);
}
