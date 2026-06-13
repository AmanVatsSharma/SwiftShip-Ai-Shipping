import { Module } from '@nestjs/common';
import { PluginManagerService } from './plugin-manager.service';
import { PluginsResolver } from './plugins.resolver';

@Module({
  providers: [PluginManagerService, PluginsResolver],
  exports: [PluginManagerService],
})
export class PluginsModule {}
