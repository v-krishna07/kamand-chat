import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { authRateLimiter } from '../src/security/rateLimit.js';

const app = createApp();

function extractSessionCookie(setCookieHeader: string[] | string | undefined): string {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const match = list.find((c) => c.startsWith('kamand_sid='));
  return match ? match.split(';')[0]! : '';
}

async function registerTestUser(username: string, role = 'member') {
  const res = await request(app).post('/api/auth/register').send({
    username,
    email: `${username}@students.iitmandi.ac.in`,
    displayName: username.toUpperCase(),
    password: 'Password123',
  });
  if (role !== 'member') {
    await prisma.user.update({ where: { id: res.body.user.id }, data: { role } });
  }
  return {
    user: res.body.user,
    csrfToken: res.body.csrfToken as string,
    cookie: extractSessionCookie(res.headers['set-cookie']),
  };
}

beforeEach(async () => {
  authRateLimiter.reset();
  await prisma.place.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Phase 8 Server Map Bundle, Admin Map Editor & Location Privacy Suite', () => {
  it('1. Serves the Campus Map Bundle (Places, Walkable Edges & GeoJSON) without accepting or storing user GPS coordinates, and restricts Map Editor to admins/moderators', async () => {
    const student = await registerTestUser('map_student', 'member');
    const admin = await registerTestUser('map_admin', 'admin');

    const bundleRes = await request(app)
      .get('/api/map/bundle')
      .set('Cookie', student.cookie);
    expect(bundleRes.status).toBe(200);
    expect(bundleRes.body.places.length).toBeGreaterThanOrEqual(10);
    expect(bundleRes.body.edges.length).toBeGreaterThan(0);
    expect(bundleRes.body.geojson.type).toBe('FeatureCollection');

    // Confirm placeholder coordinates are explicitly flagged
    const b19 = bundleRes.body.places.find((p: { code: string }) => p.code === 'B-19');
    expect(b19).toBeDefined();
    expect(b19.isPlaceholderCoord).toBe(true);

    // Regular student cannot modify map pins (403)
    const studentEdit = await request(app)
      .put('/api/map/places')
      .set('Cookie', student.cookie)
      .set('X-CSRF-Token', student.csrfToken)
      .send({
        code: 'B-21',
        canonicalName: 'Hostel B-21',
        aliases: ['B-21', 'B21'],
        category: 'hostel',
        hostel: 'B',
        block: '21',
        lat: 31.7776,
        lng: 76.9871,
      });
    expect(studentEdit.status).toBe(403);

    // Admin adds/updates a map pin -> 200 OK and marks isPlaceholderCoord: false
    const adminEdit = await request(app)
      .put('/api/map/places')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrfToken)
      .send({
        code: 'B-21',
        canonicalName: 'Hostel B-21 (North Campus)',
        aliases: ['B-21', 'B21', 'b 21'],
        category: 'hostel',
        hostel: 'B',
        block: '21',
        lat: 31.7776,
        lng: 76.9871,
      });
    expect(adminEdit.status).toBe(200);
    expect(adminEdit.body.place.code).toBe('B-21');
    expect(adminEdit.body.place.isPlaceholderCoord).toBe(false);
  });
});
