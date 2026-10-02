import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import * as authService from './auth.service';
import { ACCESS_COOKIE, REFRESH_COOKIE, verifyAccessToken } from './token.service';
import { Types } from 'mongoose';

const secure = env.NODE_ENV === 'production';

const accessCookie: CookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/',
  maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
};
// Refresh cookie is only ever sent to the auth endpoints.
const refreshCookie: CookieOptions = {
  httpOnly: true,
  secure,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

function client(req: Request) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function setSessionCookies(res: Response, s: { accessToken: string; refreshToken: string }) {
  res.cookie(ACCESS_COOKIE, s.accessToken, accessCookie);
  res.cookie(REFRESH_COOKIE, s.refreshToken, refreshCookie);
}

function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...accessCookie, maxAge: undefined });
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined });
}

export async function loginController(req: Request, res: Response) {
  const session = await authService.login(req.body.email, req.body.password, client(req));
  setSessionCookies(res, session);
  res.json({ data: { user: session.user } });
}

export async function refreshController(req: Request, res: Response) {
  try {
    const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE], client(req));
    setSessionCookies(res, session);
    res.json({ data: { user: session.user } });
  } catch (err) {
    clearSessionCookies(res);
    throw err;
  }
}

export async function logoutController(req: Request, res: Response) {
  let actor: Parameters<typeof authService.logout>[1];
  try {
    const p = verifyAccessToken(req.cookies?.[ACCESS_COOKIE] ?? '');
    actor = { userId: new Types.ObjectId(p.sub), orgId: new Types.ObjectId(p.org), name: p.name };
  } catch {
    actor = undefined;
  }
  await authService.logout(req.cookies?.[REFRESH_COOKIE], actor);
  clearSessionCookies(res);
  res.json({ data: { ok: true } });
}

export async function meController(req: Request, res: Response) {
  res.json({ data: { user: await authService.getMe(req.auth!.userId) } });
}
