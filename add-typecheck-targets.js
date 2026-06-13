const fs = require('fs');
const path = require('path');

const projectFiles = [
  'apps/admin-/project.json',
  'apps/api/project.json',
  'apps/web/project.json',
  'libs/domains/billing/project.json',
  'libs/domains/bulk-operations/project.json',
  'libs/domains/carriers/project.json',
  'libs/domains/cod/project.json',
  'libs/domains/dashboard/project.json',
  'libs/domains/manifests/project.json',
  'libs/domains/metrics/project.json',
  'libs/domains/ndr/project.json',
  'libs/domains/notifications/project.json',
  'libs/domains/onboarding/project.json',
  'libs/domains/orders/project.json',
  'libs/domains/payments/project.json',
  'libs/domains/pickups/project.json',
  'libs/domains/plugins/project.json',
  'libs/domains/rate-shop/project.json',
  'libs/domains/returns/project.json',
  'libs/domains/roles/project.json',
  'libs/domains/serviceability/project.json',
  'libs/domains/shipments/project.json',
  'libs/domains/shipping-rates/project.json',
  'libs/domains/storage/project.json',
  'libs/domains/surcharges/project.json',
  'libs/domains/users/project.json',
  'libs/domains/warehouses/project.json',
  'libs/domains/webhooks/project.json',
  'libs/platform/auth/project.json',
  'libs/platform/carriers/project.json',
  'libs/platform/config/project.json',
  'libs/platform/graphql/project.json',
  'libs/platform/queues/project.json',
  'libs/platform/typeorm/project.json'
];

projectFiles.forEach(projectFile => {
  const fullPath = path.join(__dirname, projectFile);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${fullPath}`);
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const json = JSON.parse(content);
  
  // Check if typecheck target already exists
  if (json.targets && json.targets.typecheck) {
    console.log(`Typecheck target already exists in: ${projectFile}`);
    return;
  }
  
  const fileName = path.basename(projectFile);
  const isLib = projectFile.includes('libs/');
  const tsConfig = isLib ? `.${fileName}/tsconfig.lib.json` : `.${fileName}/tsconfig.app.json`;
  
  // Add typecheck target
  if (!json.targets) {
    json.targets = {};
  }
  
  json.targets.typecheck = {
    executor: "@nx/js:tsc",
    outputs: ["{options.outputPath}"],
    options: {
      outputPath: `dist/${path.dirname(projectFile).replace(/(^apps\/|^libs\/)/, '')}/${fileName}`,
      tsConfig: tsConfig
    }
  };
  
  if (isLib) {
    // Add lint target if missing for domain libs
    if (!json.targets.lint) {
      json.targets.lint = {
        executor: "@nx/eslint:lint",
        outputs: ["{options.outputFile}"]
      };
    }
  }
  
  fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');
  console.log(`Added typecheck target to: ${projectFile}`);
});

console.log('Processing complete!');
