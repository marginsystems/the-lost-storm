#!/bin/sh
set -eu
jar="${TLA2TOOLS:-$HOME/.cache/tla2tools/tla2tools.jar}"
if [ ! -f "$jar" ]; then
  echo "tla2tools.jar not found at $jar; set TLA2TOOLS or see spec/README.md" >&2
  exit 2
fi
cd "$(dirname "$0")"
config="${1:-Overlays.cfg}"
work="$(mktemp -d)"
exec java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -noGenerateSpecTE -workers auto -metadir "$work" -config "$config" Overlays.tla
