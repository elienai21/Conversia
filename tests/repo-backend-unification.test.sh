#!/usr/bin/env bash
set -euo pipefail

# Root documentation must exist and declare the TypeScript backend official
[ -f README.md ] || { echo 'README.md is missing'; exit 1; }
rg -q 'backend-ts' README.md || { echo 'README.md does not reference backend-ts as official backend'; exit 1; }
rg -q 'TypeScript backend is the official backend' README.md || { echo 'README.md does not declare the TypeScript backend as official'; exit 1; }

# Local compose stack must include the backend-ts service
python3 - <<'PY'
from pathlib import Path
text = Path('docker-compose.yml').read_text()
if '\n  backend:' not in text:
    raise SystemExit('docker-compose.yml is missing backend service')
if 'build:' not in text or 'backend-ts' not in text:
    raise SystemExit('docker-compose.yml backend service is not wired to backend-ts')
PY
