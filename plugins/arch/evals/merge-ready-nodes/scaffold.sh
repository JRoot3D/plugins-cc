#!/usr/bin/env bash
# Seed the empty run workspace with this case's board (stored as fixture/arch so it is visible in the repo).
set -euo pipefail
cp -R "$(dirname "${BASH_SOURCE[0]}")/fixture/arch" .arch
