import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ErrorReportingFilter } from './common/error-reporter.js';
import { GameErrorFilter } from './common/game-error.filter.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { GameModule } from './game/game.module.js';
import { HealthController } from './health/health.controller.js';
import { PetsModule } from './pets/pets.module.js';
import { ShopModule } from './shop/shop.module.js';
import { SocialModule } from './social/social.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    GameModule,
    AuthModule,
    ActivityModule,
    FeedbackModule,
    PetsModule,
    ShopModule,
    SocialModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Nest tries the filters last-registered first: the specific one must come after the catch-all.
    { provide: APP_FILTER, useClass: ErrorReportingFilter },
    { provide: APP_FILTER, useClass: GameErrorFilter },
  ],
})
export class AppModule {}
