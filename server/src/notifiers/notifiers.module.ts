import { Module } from '@nestjs/common';
import { NotifiersController } from './notifiers.controller';
import { NotifiersService } from './notifiers.service';

@Module({
  controllers: [NotifiersController],
  providers: [NotifiersService],
  exports: [NotifiersService],
})
export class NotifiersModule {}
