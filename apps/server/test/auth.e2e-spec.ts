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

describe('Auth flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const prisma = createInMemoryPrisma();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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

  const creds = {
    email: 'alice@example.com',
    username: 'alice',
    password: 'password123',
  };
  const http = () => request(app.getHttpServer());

  it('GET /api/healthz reports ok', async () => {
    const res = await http().get('/api/healthz').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('registers a new user and returns tokens', async () => {
    const res = await http().post('/api/v1/auth/register').send(creds).expect(201);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.isGuest).toBe(false);
    expect(res.body.tokens.accessToken).toBeTruthy();
    expect(res.body.tokens.tokenType).toBe('Bearer');
  });

  it('rejects a duplicate email with 409 CONFLICT envelope', async () => {
    await http()
      .post('/api/v1/auth/register')
      .send(creds)
      .expect(409)
      .expect((r) => {
        expect(r.body.error.code).toBe('EMAIL_TAKEN');
      });
  });

  it('rejects invalid registration input with 400 + error envelope', async () => {
    await http()
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', username: 'x', password: 'short' })
      .expect(400)
      .expect((r) => {
        expect(r.body.error.code).toBe('VALIDATION_ERROR');
        expect(r.body.error.correlationId).toBeTruthy();
      });
  });

  it('logs in and reads /me with the access token', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password })
      .expect(200);
    const access = login.body.tokens.accessToken as string;

    const me = await http()
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(me.body.email).toBe('alice@example.com');
    expect(me.body.username).toBe('alice');
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    await http()
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: 'wrong-password' })
      .expect(401)
      .expect((r) => {
        expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      });
  });

  it('rejects /me without a token (401)', async () => {
    await http().get('/api/v1/auth/me').expect(401);
  });

  it('refreshes tokens using the refresh cookie', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password })
      .expect(200);
    const cookie = login.headers['set-cookie'];
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    expect(refreshed.body.tokens.accessToken).toBeTruthy();
  });

  it('logs out, after which the session can no longer refresh', async () => {
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password })
      .expect(200);
    const access = login.body.tokens.accessToken as string;
    const cookie = login.headers['set-cookie'];

    await http()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .expect(204);

    await http().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
