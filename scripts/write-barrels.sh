#!/usr/bin/env bash
# Writes index.ts barrel files for each domain lib that re-exports from src/.
# Each lib gets a small `*LibModule` alias so consumers can use a stable
# Nx-style name.
set -e
write_barrel() {
  local lib="$1"
  local module_class="$2"
  local service_class="$3"
  local resolver_class="$4"
  local extra_exports="$5"
  local lib_dir="libs/domains/$lib"
  cat > "$lib_dir/src/index.ts" <<EOF
// Re-export barrel for the $lib lib.
// Until Plan 3 ships a full TypeORM implementation, the src/ implementation
// runs against PrismaCompat (TypeORM-backed). New consumers should import
// from \`@swiftship/domains-$lib\` rather than the relative \`../$lib\` paths.

export { ${module_class}, ${module_class} as ${module_class%Module}LibModule } from '../../../../src/$lib/${module_class,}.ts';
EOF
  if [ -n "$service_class" ]; then
    local fn="${service_class,,}"
    cat >> "$lib_dir/src/index.ts" <<EOF
export { ${service_class}, ${service_class} as ${module_class%Module}LibService } from '../../../../src/$lib/${fn}.service.ts';
EOF
  fi
  if [ -n "$resolver_class" ]; then
    local fn="${resolver_class,,}"
    cat >> "$lib_dir/src/index.ts" <<EOF
export { ${resolver_class}, ${resolver_class} as ${module_class%Module}LibResolver } from '../../../../src/$lib/${fn}.resolver.ts';
EOF
  fi
  if [ -n "$extra_exports" ]; then
    echo "$extra_exports" >> "$lib_dir/src/index.ts"
  fi
  echo "[barrel] $lib"
}
