import { Module } from '@nestjs/common';
import { NameFilterService } from './name-filter.service.js';

/** Just the filter: kept apart so that pets can use it without depending on the admin tools. */
@Module({ providers: [NameFilterService], exports: [NameFilterService] })
export class NamesModule {}
