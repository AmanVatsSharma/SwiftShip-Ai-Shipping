#!/bin/sh
# SwiftShip API container entrypoint.
#
# Runs TypeORM migrations (registered in
# libs/platform/typeorm/src/lib/datasource.ts) before booting the API, then
# execs the CMD (`node dist/apps/api/main.js`).
#
# Env knobs:
#   MIGRATIONS_ENABLED - set to "false" to skip migrations entirely
#                        (e.g. when running them as a k8s Job/initContainer
#                        instead of per-pod).
#   DB_SYNCHRONIZE     - forced to "false" whenever this entrypoint runs the
#                        migrations; TypeORM synchronize must stay off in
#                        production so the schema is owned by migrations only.
set -e

if [ "${MIGRATIONS_ENABLED:-true}" != "false" ]; then
  echo ">> swiftship-api: running TypeORM migrations..."
  # dist/libs/platform/typeorm is the CommonJS build of the typeorm lib
  # (nx build typeorm); `require("./dist/...")` resolves from the cwd (/app).
  DB_SYNCHRONIZE=false node -e '
    require("reflect-metadata");
    const { dataSource } = require("./dist/libs/platform/typeorm");
    dataSource
      .initialize()
      .then(() => dataSource.runMigrations({ transaction: "each" }))
      .then(() => dataSource.destroy())
      .then(() => console.log(">> swiftship-api: migrations complete"))
      .catch((err) => {
        console.error(">> swiftship-api: migrations FAILED:", err);
        process.exit(1);
      });
  '
  export DB_SYNCHRONIZE=false
fi

exec "$@"
