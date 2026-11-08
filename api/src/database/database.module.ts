import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { AppConfig } from '../config/app-config.js';
import { openDatabase } from './database.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [AppConfig],
      useFactory: async (config: AppConfig) => ({
        db: await openDatabase(config.databaseUrl, { migrate: config.databaseAutoMigrate }),
      }),
    }),
  ],
})
export class DatabaseModule {}
