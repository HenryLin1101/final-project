import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ScopeModule } from './scope/scope.module';
import { DepartmentsModule } from './departments/departments.module';
import { EventsModule } from './events/events.module';
import { SafetyReportsModule } from './safety-reports/safety-reports.module';
import { RemindersModule } from './reminders/reminders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      useFactory: (redis: RedisService) => ({
        throttlers: [{ name: 'global', ttl: 60000, limit: 60 }],
        storage: new RedisThrottlerStorage(redis),
      }),
      inject: [RedisService],
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    ScopeModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    EventsModule,
    SafetyReportsModule,
    RemindersModule,
    NotificationsModule,
    AuditLogsModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
