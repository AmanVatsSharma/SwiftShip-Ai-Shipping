import { Plugin } from './plugin.interface';

const ExamplePlugin: Plugin = {
  name: 'example-plugin',
  version: '1.0.0',
  author: 'SwiftShip AI',
  description: 'A sample plugin to demonstrate the plugin system.',
  requiredPermissions: ['admin'],
  uiComponents: [
    {
      id: 'example-widget',
      name: 'Example Widget',
      description: 'A sample UI widget for the owner panel.',
      route: '/admin/example-widget',
    },
  ],
  onRegister() {
    // Initialization logic
    console.log('[ExamplePlugin] Registered!');
  },
  onEnable() {
    // Enable logic
    console.log('[ExamplePlugin] Enabled!');
  },
  onDisable() {
    // Disable logic
    console.log('[ExamplePlugin] Disabled!');
  },
};

export default ExamplePlugin;