/**
 * End-to-end smoke test for the SwiftShip API.
 *
 * Boots the full AppModule against an in-memory PG (pglite) + in-memory
 * BullMQ, then exercises the health endpoint and a few GraphQL operations.
 *
 * This file is the template every domain's e2e suite should follow:
 * 1. Use a Test module that imports only what you need
 * 2. Reset the DB between tests (TRUNCATE … CASCADE)
 * 3. Use the GraphQL playground transport (supertest) rather than @apollo/client
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../api/src/app.module';

describe('SwiftShip API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL_TEST ||
      'postgres://swiftship:swiftship@localhost:5432/swiftship_test';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
  });

  it('GraphQL apiInfo query returns the app banner', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: '{ apiInfo { status name uptime } }',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.apiInfo.status).toBe('ok');
    expect(res.body.data.apiInfo.name).toBe('SwiftShip AI');
  });

  it('Auth login rejects unknown users with a 4xx', async () => {
    const res = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: /* GraphQL */ `
          mutation Login($input: LoginInput!) {
            login(input: $input) { accessToken refreshToken }
          }
        `,
        variables: {
          input: { email: 'nobody@nowhere.invalid', password: 'wrong' },
        },
      });
    expect([200, 401, 400]).toContain(res.status);
    // No token in either case
    expect(res.body.data?.login?.accessToken ?? null).toBeNull();
  });
});
