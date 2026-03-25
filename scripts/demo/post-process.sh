#!/data/data/com.termux/files/usr/bin/bash
# post-process.sh — Convert recordings to GIF + add subtitles
#
# Requires: ffmpeg (pkg install ffmpeg)
#
# Input:  ~/shelly-demo/*.mp4
# Output: ~/shelly-demo/*.gif + docs/images/*.gif + docs/images/*.png

set -euo pipefail

DEMO_DIR="$HOME/shelly-demo"
DOCS_DIR="$(dirname "$0")/../../docs/images"
mkdir -p "$DOCS_DIR"

# Check ffmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "❌ ffmpeg not found. Install with: pkg install ffmpeg"
  exit 1
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "  Post-Processing: MP4 → GIF + Subtitles"
echo "════════════════════════════════════════════════════"
echo ""

# ─── GIF conversion function ──────────────────────────────────────────────────

to_gif() {
  local input="$1"
  local output="$2"
  local width="${3:-900}"

  if [ ! -f "$input" ]; then
    echo "⏭️  Skipping $input (not found)"
    return
  fi

  echo "🔄 Converting: $(basename "$input") → $(basename "$output")"
  ffmpeg -y -i "$input" \
    -vf "fps=15,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
    -loop 0 "$output" 2>/dev/null

  local size
  size=$(du -h "$output" | cut -f1)
  echo "   ✅ $(basename "$output") ($size)"
}

# ─── Subtitle function ────────────────────────────────────────────────────────

add_subtitles() {
  local input="$1"
  local output="$2"
  shift 2
  # Remaining args: "start:end:text" pairs
  local filters=""
  local sep=""

  for entry in "$@"; do
    local start end text
    IFS=':' read -r start end text <<< "$entry"
    filters="${filters}${sep}drawtext=text='${text}':x=(w-tw)/2:y=80:fontsize=42:fontcolor=white:borderw=2:bordercolor=black:enable='between(t,${start},${end})'"
    sep=","
  done

  if [ -n "$filters" ]; then
    echo "🔤 Adding subtitles to $(basename "$input")"
    ffmpeg -y -i "$input" -vf "$filters" -codec:a copy "$output" 2>/dev/null
    echo "   ✅ $(basename "$output")"
  fi
}

# ─── Process Hero GIF ─────────────────────────────────────────────────────────

if [ -f "$DEMO_DIR/hero.mp4" ]; then
  # Add subtitles first
  add_subtitles "$DEMO_DIR/hero.mp4" "$DEMO_DIR/hero_subtitled.mp4" \
    "0:3:The copy-paste problem ends here." \
    "4:8:Say it. AI reads the terminal. Suggests a fix." \
    "8:12:One tap. It runs. Auto-saved."

  # Convert to GIF
  to_gif "$DEMO_DIR/hero_subtitled.mp4" "$DEMO_DIR/cross-pane.gif" 900
fi

# ─── Process Feature GIFs ─────────────────────────────────────────────────────

to_gif "$DEMO_DIR/cross-pane-single.mp4" "$DEMO_DIR/cross-pane-single.gif" 900
to_gif "$DEMO_DIR/team.mp4"              "$DEMO_DIR/team.gif"              900
to_gif "$DEMO_DIR/savepoint.mp4"         "$DEMO_DIR/savepoint.gif"         900
to_gif "$DEMO_DIR/cli-copilot.mp4"       "$DEMO_DIR/cli-copilot.gif"      900
to_gif "$DEMO_DIR/github-sync.mp4"       "$DEMO_DIR/github-sync.gif"      900

# ─── Copy to docs/images/ ─────────────────────────────────────────────────────

echo ""
echo "📁 Copying to docs/images/..."

for f in cross-pane.gif cross-pane-single.gif team.gif savepoint.gif cli-copilot.gif github-sync.gif; do
  if [ -f "$DEMO_DIR/$f" ]; then
    cp "$DEMO_DIR/$f" "$DOCS_DIR/$f"
    echo "   ✅ $f"
  fi
done

# Copy screenshots
for f in hero setup-wizard team-response diff-viewer github-suggest themes-dark themes-alt actions-wizard; do
  if [ -f "$DEMO_DIR/${f}.png" ]; then
    cp "$DEMO_DIR/${f}.png" "$DOCS_DIR/${f}.png"
    echo "   ✅ ${f}.png"
  fi
done

echo ""
echo "════════════════════════════════════════════════════"
echo "  Post-processing complete!"
echo "════════════════════════════════════════════════════"
echo ""
echo "📁 Output directory: $DOCS_DIR/"
ls -la "$DOCS_DIR"/ 2>/dev/null
