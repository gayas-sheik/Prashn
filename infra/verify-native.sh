#!/usr/bin/env bash
# Check installed native modules before tests or instance startup.
set -euo pipefail
cd "${1:-$(dirname "$0")/../backend}"

if ! node -e "require('sqlite3')"; then
  if [[ "$(uname -s)" != Linux ]]; then
    echo 'SQLite failed to load. Reinstall backend dependencies for this operating system.' >&2
    exit 1
  fi
  for executable in python3 make g++; do
    if ! command -v "$executable" >/dev/null; then
      echo "SQLite needs a source rebuild, but $executable is missing." >&2
      echo 'On CloudShell, install the build tools with: sudo dnf install -y gcc-c++ make python3' >&2
      exit 1
    fi
  done
  echo 'Rebuilding SQLite against the current Linux libraries before continuing.'
  npm_config_build_from_source=true npm rebuild sqlite3
fi

# Exercise the binary, including an actual in-memory database query.
node <<'NODE'
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { createCanvas } = require('@napi-rs/canvas');
const bcrypt = require('bcrypt');
assert.equal(createCanvas(2, 2).width, 2);
assert.equal(bcrypt.compareSync('native-check', bcrypt.hashSync('native-check', 4)), true);
const db = new sqlite3.Database(':memory:', error => {
  if (error) throw error;
  db.get('SELECT 1 AS value', (error, row) => {
    if (error) throw error;
    assert.equal(row.value, 1);
    db.close(error => {
      if (error) throw error;
      console.log('Native dependency checks passed (SQLite, canvas, bcrypt).');
    });
  });
});
NODE
