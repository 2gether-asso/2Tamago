import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module.js';
import { ShopController } from './shop.controller.js';

@Module({
  imports: [PlayersModule],
  controllers: [ShopController],
})
export class ShopModule {}
