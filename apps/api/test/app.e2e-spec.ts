import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  RequestMethod,
} from '@nestjs/common';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** 無本機 Postgres/Redis 時仍可跑 smoke e2e（CI、同學電腦） */
function prismaTestDouble() {
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaTestDouble())
      .overrideProvider(RedisService)
      .useValue(redisTestDouble())
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
});
