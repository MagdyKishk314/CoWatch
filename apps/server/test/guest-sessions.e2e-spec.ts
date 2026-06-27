import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createInMemoryPrisma } from './in-memory-prisma';

describe('Guest accounts + session management (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const prisma = createInMemoryPrisma();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const creds = { email: 'grad@example.com', password: 'password123' };
  let guestAccess = '';

  async function loginToken(): Promise<string> {
    const res = await http().post('/api/v1/auth/login').send(creds).expect(200);
    return res.body.tokens.accessToken as string;
  }

  it('creates a guest account and /me reports isGuest', async () => {
    const res = await http().post('/api/v1/auth/guest').expect(201);
    expect(res.body.user.isGuest).toBe(true);
    expect(res.body.user.username).toMatch(/^guest-/);
    guestAccess = res.body.tokens.accessToken;

    const me = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${guestAccess}`)
      .expect(200);
    expect(me.body.isGuest).toBe(true);
    expect(me.body.email).toBeNull();
  });

  it('upgrades the guest in place to a registered account', async () => {
    const up = await http()
      .post('/api/v1/auth/upgrade')
      .set('Authorization', `Bearer ${guestAccess}`)
      .send({ email: creds.email, username: 'graduate', password: creds.password })
      .expect(200);
    expect(up.body.isGuest).toBe(false);
    expect(up.body.email).toBe(creds.email);
    expect(up.body.username).toBe('graduate');
  });

  it('rejects a second upgrade of an already-registered account (409)', async () => {
    await http()
      .post('/api/v1/auth/upgrade')
      .set('Authorization', `Bearer ${guestAccess}`)
      .send({ email: 'other@example.com', username: 'other', password: 'password123' })
      .expect(409)
      .expect((r) => {
        expect(r.body.error.code).toBe('NOT_A_GUEST');
      });
  });

  it('lists sessions (one marked current) and revoke-others kills the rest', async () => {
    const access2 = await loginToken(); // a second device session

    const list = await http()
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${access2}`)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const revoked = await http()
      .post('/api/v1/auth/sessions/revoke-others')
      .set('Authorization', `Bearer ${access2}`)
      .expect(200);
    expect(revoked.body.revoked).toBeGreaterThanOrEqual(1);

    // The original guest/upgraded session is no longer usable.
    await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${guestAccess}`)
      .expect(401);
  });

  it('revokes a specific session by id, and 404s on an unknown id', async () => {
    const accessA = await loginToken();
    await loginToken(); // second active session (B)

    const list = await http()
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${accessA}`)
      .expect(200);
    const target = (
      list.body as Array<{ id: string; current: boolean; revoked: boolean }>
    ).find((s) => !s.current && !s.revoked);
    expect(target).toBeTruthy();

    await http()
      .delete(`/api/v1/auth/sessions/${target!.id}`)
      .set('Authorization', `Bearer ${accessA}`)
      .expect(204);

    await http()
      .delete('/api/v1/auth/sessions/0123456789abcdef01234567')
      .set('Authorization', `Bearer ${accessA}`)
      .expect(404);
  });
});
