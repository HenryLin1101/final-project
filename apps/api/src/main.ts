import { NestFactory } from '@nestjs/core';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import * as basicAuth from 'express-basic-auth';
import { AppModule } from './app.module';
import { SAFETY_REPORTS_QUEUE } from './queues/queue-names';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });

  // BullMQ dashboard — only mounted when REDIS_URL is configured, otherwise the
  // injected token is a stub and BullMQAdapter would fail. Mounted as Express
  // middleware to bypass setGlobalPrefix and Nest pipes. Protected by Basic Auth.
  if (process.env.REDIS_URL) {
    try {
      const safetyQueue = app.get<Queue>(getQueueToken(SAFETY_REPORTS_QUEUE));
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');
      createBullBoard({
        queues: [new BullMQAdapter(safetyQueue)],
        serverAdapter,
      });
      app.use(
        '/admin/queues',
        basicAuth({
          users: { admin: process.env.QUEUE_DASHBOARD_PASSWORD ?? 'admin' },
          challenge: true,
          realm: 'safety-api-queues',
        }),
        serverAdapter.getRouter(),
      );
    } catch (err) {
      new Logger('Bootstrap').warn(
        `BullMQ dashboard not mounted: ${(err as Error).message}`,
      );
    }
  }

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
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}
bootstrap();
