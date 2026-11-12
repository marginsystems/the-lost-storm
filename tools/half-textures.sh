#!/bin/sh
set -eu
source_dir="public/textures"
target_dir="public/textures/half"
work_dir="$(mktemp -d)"
mkdir -p "$target_dir"
for source in "$source_dir"/*.webp; do
  name="$(basename "$source" .webp)"
  width="$(sips -g pixelWidth "$source" | awk '/pixelWidth/ { print $2 }')"
  half=$((width / 2))
  sips -s format png --resampleWidth "$half" "$source" --out "$work_dir/$name.png" > /dev/null
  cwebp -quiet -q 86 -m 6 "$work_dir/$name.png" -o "$target_dir/$name.webp"
done
