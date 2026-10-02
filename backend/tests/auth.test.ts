import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { RefreshToken } from '../src/modules/auth/refresh-token.model';
import { User } from '../src/modules/users/user.model';
import { PASSWORD, createTenant, loginAs, resetDb, testServer } from './helpers';

beforeEach(resetDb);

function cookieMap(res: request.Response) {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return Object.fromEntries(raw.map((c) => [c.split('=')[0], c]));
}

describe('authentication', () => {
  it('login sets httpOnly cookies and never returns tokens in the body', async () => {
    await createTenant('acme');
    const res = await request(testServer()).post('/api/auth/login').send({ email: 'org_admin@acme.test', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ email: 'org_admin@acme.test', role: 'ORG_ADMIN' });
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    const cookies = cookieMap(res);
    expect(cookies.opshub_at).toMatch(/HttpOnly/);
    expect(cookies.opshub_rt).toMatch(/HttpOnly/);
    expect(cookies.opshub_rt).toMatch(/Path=\/api\/auth/);
    expect(cookies.opshub_rt).toMatch(/SameSite=Strict/);
  });

  it('rejects bad credentials with the same message for unknown email and wrong password', async () => {
    await createTenant('acme');
    const wrong = await request(testServer()).post('/api/auth/login').send({ email: 'org_admin@acme.test', password: 'nope' });
    const unknown = await request(testServer()).post('/api/auth/login').send({ email: 'ghost@acme.test', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks the account after 5 failed attempts', async () => {
    await createTenant('acme');
    const attempt = (password: string) =>
      request(testServer()).post('/api/auth/login').send({ email: 'viewer@acme.test', password });
    for (let i = 0; i < 5; i++) expect((await attempt('wrong')).status).toBe(401);
    const locked = await attempt(PASSWORD);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('protects routes and serves /me', async () => {
    await createTenant('acme');
    expect((await request(testServer()).get('/api/orders')).status).toBe(401);
    const agent = await loginAs('manager@acme.test');
    const me = await agent.get('/api/auth/me');
    expect(me.body.data.user.role).toBe('MANAGER');
  });

  it('rejects disabled users', async () => {
    const { users } = await createTenant('acme');
    await User.updateOne({ _id: users.VIEWER._id }, { $set: { status: 'DISABLED' } });
    const res = await request(testServer()).post('/api/auth/login').send({ email: 'viewer@acme.test', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('rotates refresh tokens and revokes the family when an old token is replayed', async () => {
    await createTenant('acme');
    const login = await request(testServer()).post('/api/auth/login').send({ email: 'org_admin@acme.test', password: PASSWORD });
    const rt1 = cookieMap(login).opshub_rt!.split(';')[0]!;

    const refreshed = await request(testServer()).post('/api/auth/refresh').set('Cookie', rt1);
    expect(refreshed.status).toBe(200);
    const rt2 = cookieMap(refreshed).opshub_rt!.split(';')[0]!;
    expect(rt2).not.toBe(rt1);

    // An attacker replays the stolen, already-rotated token...
    const replay = await request(testServer()).post('/api/auth/refresh').set('Cookie', rt1);
    expect(replay.status).toBe(401);
    // ...and the legitimate user's newer token is revoked as well.
    const afterReplay = await request(testServer()).post('/api/auth/refresh').set('Cookie', rt2);
    expect(afterReplay.status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('logout revokes the refresh token', async () => {
    await createTenant('acme');
    const login = await request(testServer()).post('/api/auth/login').send({ email: 'org_admin@acme.test', password: PASSWORD });
    const rt = cookieMap(login).opshub_rt!.split(';')[0]!;
    await request(testServer()).post('/api/auth/logout').set('Cookie', rt);
    expect((await request(testServer()).post('/api/auth/refresh').set('Cookie', rt)).status).toBe(401);
  });

  it('rejects a forged access token', async () => {
    await createTenant('acme');
    const res = await request(testServer()).get('/api/orders').set('Cookie', 'opshub_at=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.');
    expect(res.status).toBe(401);
  });

  it('blocks cross-origin state-changing requests', async () => {
    await createTenant('acme');
    const res = await request(testServer())
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'org_admin@acme.test', password: PASSWORD });
    expect(res.status).toBe(403);
  });
});
