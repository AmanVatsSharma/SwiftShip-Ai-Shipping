export interface Plugin {
  /**
   * Unique plugin name (should be globally unique)
   */
  name: string;

  /**
   * Plugin version (semver)
   */
  version: string;

  /**
   * Plugin author or maintainer
   */
  author: string;

  /**
   * Short description of the plugin
   */
  description?: string;

  /**
   * List of permissions/roles required by this plugin
   */
  requiredPermissions?: string[];

  /**
   * List of plugin dependencies (by name)
   */
  dependencies?: string[];

  /**
   * Optional: UI components this plugin exposes for the owner panel
   */
  uiComponents?: Array<{
    id: string;
    name: string;
    description?: string;
    route: string;
  }>;

  /**
   * Called when the plugin is registered/initialized
   */
  onRegister?(): Promise<void> | void;

  /**
   * Called when the plugin is enabled
   */
  onEnable?(): Promise<void> | void;

  /**
   * Called when the plugin is disabled
   */
  onDisable?(): Promise<void> | void;
} 