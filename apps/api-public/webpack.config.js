/**
 * Webpack config for apps/api-public (Nx 22 convention — the @nx/webpack
 * executor requires this file; without it webpack falls back to the default
 * './src' entry and the build fails with "Module not found: './src'").
 * Paths are APP-RELATIVE — the plugin joins them with the project root.
 */
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');

module.exports = {
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      outputPath: '../../dist/apps/api-public',
      assets: ['./src/generated/openapi.json'],
      transformationLog: false,
    }),
  ],
};
