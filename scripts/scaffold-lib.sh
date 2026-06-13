#!/usr/bin/env bash
# Scaffolds a new domain lib at libs/domains/<name>/.
# Mirrors the structure of libs/domains/warehouses.
# Usage: ./scripts/scaffold-lib.sh <name> [scope-tag]
set -e
NAME="$1"
TAG="${2:-$NAME}"
TGT="libs/domains/$NAME"
TMPL="libs/domains/warehouses"
if [ -z "$NAME" ]; then
  echo "usage: ./scripts/scaffold-lib.sh <name> [scope-tag]"
  exit 1
fi
if [ -d "$TGT" ]; then
  echo "[scaffold] lib $NAME already exists at $TGT"
  exit 1
fi
mkdir -p "$TGT/src/lib"

# package.json: rename the package
sed "s/@swiftship\/domains-warehouses/@swiftship\/domains-$NAME/" \
  "$TMPL/package.json" > "$TGT/package.json"

# project.json: name, sourceRoot, output, scope
sed -e "s/\"name\": \"warehouses\"/\"name\": \"$NAME\"/" \
    -e "s|\"sourceRoot\": \"libs/domains/warehouses/src\"|\"sourceRoot\": \"libs/domains/$NAME/src\"|" \
    -e "s|\"outputPath\": \"dist/libs/domains/warehouses\"|\"outputPath\": \"dist/libs/domains/$NAME\"|" \
    -e "s|\"tsConfig\": \"libs/domains/warehouses/|\"tsConfig\": \"libs/domains/$NAME/|" \
    -e "s|\"packageJson\": \"libs/domains/warehouses/|\"packageJson\": \"libs/domains/$NAME/|" \
    -e "s|\"main\": \"libs/domains/warehouses/|\"main\": \"libs/domains/$NAME/|" \
    -e "s|\"libs/domains/warehouses/\\*\\.md\"|\"libs/domains/$NAME/\\*\\.md\"|" \
    -e "s/scope:warehouses/scope:$TAG/" \
    "$TMPL/project.json" > "$TGT/project.json"

# tsconfigs: rename the path
for f in tsconfig.json tsconfig.lib.json README.md; do
  sed "s/domains\/warehouses/domains\/$NAME/g" "$TMPL/$f" > "$TGT/$f"
done

# placeholder src/index.ts
UPPER=$(echo "$NAME" | tr '[:lower:]-' '[:upper:]_')
cat > "$TGT/src/index.ts" <<EOF
// Placeholder barrel for @swiftship/domains-$NAME.
// Implemented in Plan 3.
export const ${UPPER}_LIB_VERSION = '0.0.1-pilot';
EOF

echo "[scaffold] created libs/domains/$NAME"
