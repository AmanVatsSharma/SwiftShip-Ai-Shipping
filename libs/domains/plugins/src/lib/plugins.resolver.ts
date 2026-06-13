import { Resolver, Query, Mutation, Args, ObjectType, Field } from '@nestjs/graphql';
import { PluginManagerService } from './plugin-manager.service';
import { Plugin } from './plugin.interface';
import { PluginDependencyStatus } from './plugin-manager.service';

@ObjectType()
class PluginInfo {
  @Field()
  name: string;

  @Field()
  version: string;

  @Field()
  author: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [String], { nullable: true })
  requiredPermissions?: string[];

  @Field(() => [String], { nullable: true })
  dependencies?: string[];

  @Field(() => [PluginUIComponent], { nullable: true })
  uiComponents?: PluginUIComponent[];

  @Field({ defaultValue: false })
  enabled?: boolean;
}

@ObjectType()
class PluginUIComponent {
  @Field()
  id: string;
  @Field()
  name: string;
  @Field({ nullable: true })
  description?: string;
  @Field()
  route: string;
}

@ObjectType()
class PluginDependencyStatusType {
  @Field()
  name: string;
  @Field()
  dependenciesMet: boolean;
  @Field(() => [String])
  missingDependencies: string[];
}

@Resolver(() => PluginInfo)
export class PluginsResolver {
  private enabledPlugins = new Set<string>();

  constructor(private readonly pluginManager: PluginManagerService) {}

  @Query(() => [PluginInfo], { name: 'plugins', description: 'List all loaded plugins' })
  getPlugins(): (Plugin & { enabled?: boolean })[] {
    return this.pluginManager.getPlugins().map(p => ({ ...p, enabled: this.enabledPlugins.has(p.name) }));
  }

  @Query(() => [PluginInfo], { name: 'enabledPlugins', description: 'List all enabled plugins' })
  getEnabledPlugins(): (Plugin & { enabled?: boolean })[] {
    return this.pluginManager.getPlugins()
      .filter(p => this.enabledPlugins.has(p.name))
      .map(p => ({ ...p, enabled: true }));
  }

  @Mutation(() => Boolean, { description: 'Enable a plugin by name' })
  async enablePlugin(@Args('name') name: string): Promise<boolean> {
    const result = await this.pluginManager.enablePlugin(name);
    if (result) this.enabledPlugins.add(name);
    return result;
  }

  @Mutation(() => Boolean, { description: 'Disable a plugin by name' })
  async disablePlugin(@Args('name') name: string): Promise<boolean> {
    const result = await this.pluginManager.disablePlugin(name);
    if (result) this.enabledPlugins.delete(name);
    return result;
  }

  @Query(() => [PluginUIComponent], { name: 'uiPluginComponents', description: 'List all UI plugin components from enabled plugins' })
  getUIPluginComponents(): PluginUIComponent[] {
    return this.pluginManager.getPlugins()
      .filter(p => this.enabledPlugins.has(p.name) && Array.isArray(p.uiComponents))
      .flatMap(p => p.uiComponents || []);
  }

  @Query(() => PluginDependencyStatusType, { name: 'pluginDependencyStatus', description: 'Get dependency status for a plugin' })
  getPluginDependencyStatus(@Args('name') name: string): PluginDependencyStatus {
    return this.pluginManager.getPluginDependencyStatus(name);
  }
} 