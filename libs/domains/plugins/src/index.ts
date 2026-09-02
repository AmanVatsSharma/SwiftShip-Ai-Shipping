// Re-export barrel for the Plugins lib.
// SS-101: points at the local implementation only — the legacy root
// `src/plugins` re-exports are gone (see STATUS.md §3).

export {
  PluginsModule,
  PluginsModule as PluginsLibModule,
} from './lib/plugins.module';
export {
  PluginsResolver,
  PluginsResolver as PluginsLibResolver,
} from './lib/plugins.resolver';
export {
  PluginManagerService,
  PluginManagerService as PluginManagerLibService,
} from './lib/plugin-manager.service';
export type { PluginDependencyStatus } from './lib/plugin-manager.service';
export type { Plugin } from './lib/plugin.interface';
