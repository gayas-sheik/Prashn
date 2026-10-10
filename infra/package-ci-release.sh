#!/usr/bin/env bash
# Package only compiled source and explicit runtime dependencies, never private data.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -z "$(git status --porcelain)" ]] || { echo 'Release requires a clean tracked source tree'; exit 1; }
[[ ! -e .aws-build/ci-release ]] || { echo 'Release output already exists; use a fresh checkout to avoid stale frontend files'; exit 1; }
mkdir -p .aws-build/ci-release/frontend
python3 - <<'PY'
import datetime,json,subprocess
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
with open('.aws-build/release-manifest.json','w') as file:
    json.dump({'revision':revision,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},file)
PY
tar -czf .aws-build/ci-release/release.tar.gz \
  backend/dist backend/package.json backend/package-lock.json \
  infra/bootstrap.sh infra/verify-native.sh infra/signal-ready.sh .aws-build/release-manifest.json
cp -R dist/. .aws-build/ci-release/frontend/
python3 - <<'PY'
import hashlib,json,subprocess
from pathlib import Path
folder=Path('.aws-build/ci-release')
digest=hashlib.sha256((folder/'release.tar.gz').read_bytes()).hexdigest()
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files={p.relative_to(folder/'frontend').as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (folder/'frontend').rglob('*') if p.is_file()}
with (folder/'manifest.json').open('w') as file: json.dump({'revision':revision,'archiveSha256':digest,'frontendSha256':files},file,indent=2)
print('Packaged tested revision:',revision,'; archive SHA256:',digest)
PY
