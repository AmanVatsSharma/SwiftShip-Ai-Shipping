import { Injectable, Logger } from '@nestjs/common';
import { Plugin } from './plugin.interface';
import * as path from 'path';
import * as fs from 'fs';

export interface PluginDependencyStatus {
  name: string;
  dependenciesMet: boolean;
  missingDependencies: string[];
}

@Injectable()
export class PluginManagerService {
  private readonly logger = new Logger(PluginManagerService.name);
  private plugins: Plugin[] = [];
  private pluginDir = path.join(__dirname, '');

  constructor() {
    this.discoverAndLoadPlugins();
  }

  /**
   * Discover and load all plugins from the plugins directory
   */
  discoverAndLoadPlugins() {
    // Prefer compiled JS plugins in production builds
    const candidates = [
      // When compiled, this file lives under dist/src/plugins
      path.join(__dirname),
      // Fallbacks depending on build layout
      path.join(process.cwd(), 'dist', 'src', 'plugins'),
      path.join(process.cwd(), 'dist', 'plugins'),
      // Last resort: source directory (useful in dev with ts-node)
      path.join(process.cwd(), 'src', 'plugins'),
    ];

    const pluginsPath = candidates.find((p) => fs.existsSync(p));
    if (!pluginsPath) {
      this.logger.warn(`Plugins directory not found in candidates: ${candidates.join(', ')}`);
      return;
    }

    const files = fs.readdirSync(pluginsPath);
    const isProd = process.env.NODE_ENV === 'production';

    for (const file of files) {
      // In production only load compiled JS; in dev allow TS as well
      const isPluginJs = file.endsWith('.plugin.js');
      const isPluginTs = file.endsWith('.plugin.ts');
      if (!(isPluginJs || (!isProd && isPluginTs))) continue;

      const pluginPath = path.join(pluginsPath, file);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pluginModule = require(pluginPath);
        const plugin: Plugin = pluginModule.default || pluginModule;
        if (plugin && plugin.name && plugin.version) {
          this.plugins.push(plugin);
          plugin.onRegister?.();
          this.logger.log(`Loaded plugin: ${plugin.name} v${plugin.version}`);
        } else {
          this.logger.warn(`Invalid plugin file: ${file}`);
        }
      } catch (err) {
        this.logger.error(`Failed to load plugin ${file}:`, err);
      }
    }
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Plugin[] {
    return this.plugins;
  }

  /**
   * Check if a plugin's dependencies are met
   */
  getPluginDependencyStatus(name: string): PluginDependencyStatus {
    const plugin = this.plugins.find(p => p.name === name);
    if (!plugin) {
      return { name, dependenciesMet: false, missingDependencies: [] };
    }
    const missing = (plugin.dependencies || []).filter(dep => !this.plugins.some(p => p.name === dep));
    return {
      name,
      dependenciesMet: missing.length === 0,
      missingDependencies: missing,
    };
  }

  /**
   * Enable a plugin by name, only if dependencies are met
   */
  async enablePlugin(name: string): Promise<boolean> {
    const depStatus = this.getPluginDependencyStatus(name);
    if (!depStatus.dependenciesMet) {
      this.logger.warn(`Cannot enable plugin ${name}: missing dependencies: ${depStatus.missingDependencies.join(', ')}`);
      return false;
    }
    const plugin = this.plugins.find(p => p.name === name);
    if (plugin && plugin.onEnable) {
      await plugin.onEnable();
      this.logger.log(`Enabled plugin: ${plugin.name}`);
      return true;
    }
    return false;
  }

  /**
   * Disable a plugin by name
   */
  async disablePlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.find(p => p.name === name);
    if (plugin && plugin.onDisable) {
      await plugin.onDisable();
      this.logger.log(`Disabled plugin: ${plugin.name}`);
      return true;
    }
    return false;
  }
} 