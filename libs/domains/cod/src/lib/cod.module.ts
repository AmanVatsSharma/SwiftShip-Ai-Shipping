import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodRemittanceEntity, OrderEntity } from '@swiftship/platform-typeorm';
import { CodService } from './cod.service';
import { CodResolver } from './cod.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, CodRemittanceEntity])],
  providers: [CodService, CodResolver],
  exports: [CodService],
})
export class CodModule {}
