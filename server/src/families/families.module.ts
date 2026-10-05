import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { InvitesController } from './invites.controller';

@Module({
  controllers: [FamiliesController, InvitesController],
  providers: [FamiliesService],
  exports: [FamiliesService],
})
export class FamiliesModule {}
