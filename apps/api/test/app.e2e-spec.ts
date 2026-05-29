import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  RequestMethod,
} from '@nestjs/common';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import { getQueueToken } from '@nestjs/bullmq';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { SAFETY_REPORTS_QUEUE } from '../src/queues/queue-names';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** 無本機 Postgres/Redis 時仍可跑 smoke e2e（CI、同學電腦） */
function createPrismaTestDouble(validPasswordHash: string) {
  const adminUser = {
    id: 'admin-1',
    email: 'admin@demo.com',
    name: 'Admin',
    role: Role.ADMIN,
    departmentId: 'dept-1',
    managerId: null,
  };
  const employeeUser = {
    id: 'emp-1',
    email: 'employee1@demo.com',
    name: 'Employee One',
    role: Role.EMPLOYEE,
    departmentId: 'dept-1',
    managerId: 'mgr-1',
  };

  return {
    onModuleInit: async () => {},
    onModuleDestroy: async () => {},
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? arg({ auditLog: { findMany: jest.fn(), count: jest.fn() } })
        : Promise.resolve([]),
    ),
    user: {
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { id?: string; email?: string } }) => {
            if (where.id === 'admin-1' || where.email === 'admin@demo.com') {
              return Promise.resolve({
                ...adminUser,
                passwordHash: validPasswordHash,
              });
            }
            if (where.id === 'emp-1' || where.email === 'employee1@demo.com') {
              return Promise.resolve({
                ...employeeUser,
                passwordHash: validPasswordHash,
                department: { id: 'dept-1', name: 'Eng' },
              });
            }
            return Promise.resolve(null);
          },
        ),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'evt-1',
        title: 'Test Event',
        status: 'ACTIVE',
      }),
      create: jest.fn().mockResolvedValue({
        id: 'evt-new',
        title: 'New Event',
        status: 'DRAFT',
      }),
    },
    safetyReport: {
      upsert: jest.fn().mockResolvedValue({ id: 'rpt-1', status: 'SAFE' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    notification: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    department: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function redisTestDouble() {
  return {
    isEnabled: () => false,
    ping: jest.fn().mockResolvedValue('SKIPPED' as const),
    setNx: jest.fn().mockResolvedValue(true),
    incr: jest.fn().mockResolvedValue(0),
    pexpire: jest.fn().mockResolvedValue(undefined),
    incrPexpire: jest.fn().mockResolvedValue(0),
    pttl: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;
}

describe('API (e2e)', () => {
  let app: INestApplication;
  let prismaDouble: ReturnType<typeof createPrismaTestDouble>;
  let queueAdd: jest.Mock;

  beforeAll(async () => {
    const validPasswordHash = await bcrypt.hash('Password123!', 10);
    prismaDouble = createPrismaTestDouble(validPasswordHash);
    queueAdd = jest.fn().mockResolvedValue({ id: 'job-mock-1' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaDouble)
      .overrideProvider(RedisService)
      .useValue(redisTestDouble())
      .overrideProvider(getQueueToken(SAFETY_REPORTS_QUEUE))
      .useValue({ add: queueAdd })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'health', method: RequestMethod.ALL },
        { path: 'health/ready', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
      ],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /** 用 JwtService sign 一個測試用 token，bypass 需要 DB 的登入流程 */
  function signTestToken(payload: { sub: string; email: string; role: Role }) {
    const jwtService = app.get(JwtService);
    return jwtService.sign(payload);
  }

  // ── Health checks ──────────────────────────────────────────────────────────

  it('GET /health returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/ready returns ready (mocked data stores)', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.postgres).toBe(true);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('returns 401 on wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@demo.com', password: 'WrongPassword!' });

      expect(res.status).toBe(401);
    });

    it('returns 401 on non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@demo.com', password: 'Password123!' });

      expect(res.status).toBe(401);
    });

    it('returns 400 on invalid request body (no email)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: 'Password123!' });

      expect(res.status).toBe(400);
    });

    it('returns 201 with access_token on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'employee1@demo.com', password: 'Password123!' });

      expect(res.status).toBe(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        id: 'emp-1',
        email: 'employee1@demo.com',
        role: Role.EMPLOYEE,
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(prismaDouble.auditLog.create).toHaveBeenCalled();
    });
  });

  // ── Auth guard ─────────────────────────────────────────────────────────────

  it('GET /api/v1/events returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/events');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/events returns 200 with valid ADMIN token', async () => {
    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@demo.com',
      role: Role.ADMIN,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── RBAC enforcement ───────────────────────────────────────────────────────

  it('POST /api/v1/events returns 403 when EMPLOYEE tries to create event', async () => {
    const token = signTestToken({
      sub: 'emp-1',
      email: 'employee1@demo.com',
      role: Role.EMPLOYEE,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Unauthorized Event' });

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/events/evt-1/reports returns 403 when EMPLOYEE tries to view all reports', async () => {
    const token = signTestToken({
      sub: 'emp-1',
      email: 'employee1@demo.com',
      role: Role.EMPLOYEE,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/events/evt-1/reports')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('POST /api/v1/events/evt-1/reports returns 403 when ADMIN tries to submit safety report', async () => {
    const token = signTestToken({
      sub: 'admin-1',
      email: 'admin@demo.com',
      role: Role.ADMIN,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/events/evt-1/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SAFE' });

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/events/evt-1/reports/team returns 403 when EMPLOYEE tries to view team reports', async () => {
    const token = signTestToken({
      sub: 'emp-1',
      email: 'employee1@demo.com',
      role: Role.EMPLOYEE,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/events/evt-1/reports/team')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // ── Happy paths ────────────────────────────────────────────────────────────

  it('POST /api/v1/events/evt-1/reports returns 202 and enqueues a job when EMPLOYEE submits SAFE report', async () => {
    queueAdd.mockClear();
    const token = signTestToken({
      sub: 'emp-1',
      email: 'employee1@demo.com',
      role: Role.EMPLOYEE,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/events/evt-1/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SAFE' });

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      status: 'accepted',
      jobId: 'job-mock-1',
      eventId: 'evt-1',
      submitted: { status: 'SAFE' },
    });
    expect(queueAdd).toHaveBeenCalledWith(
      'submit',
      expect.objectContaining({
        eventId: 'evt-1',
        dto: { status: 'SAFE' },
      }),
      expect.any(Object),
    );
  });
});
