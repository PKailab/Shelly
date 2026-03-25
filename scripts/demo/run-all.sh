#!/data/data/com.termux/files/usr/bin/bash
# run-all.sh — Run all demo recording scripts in sequence.
#
# Recommended order: multi-pane first (1, 5), then single-pane (2, 3, 4, 6).
# After recording, run post-process.sh to convert to GIF.

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Shelly Demo — Full Recording Session         ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  Checklist before starting:                          ║"
echo "║  □ Wireless ADB connected                           ║"
echo "║  □ Shelly running with Bridge connected             ║"
echo "║  □ Do Not Disturb ON                                ║"
echo "║  □ Battery > 80%                                    ║"
echo "║  □ GitHub PAT configured                            ║"
echo "║  □ AsyncStorage 'shelly_autocheck_offered' cleared  ║"
echo "║                                                      ║"
echo "║  Recording order (efficient for screen mode):        ║"
echo "║  1. hero.sh          (multi-pane)                    ║"
echo "║  2. cli-copilot.sh   (multi-pane)                   ║"
echo "║  3. cross-pane-single.sh (single-pane, Japanese)    ║"
echo "║  4. team.sh          (single-pane)                   ║"
echo "║  5. savepoint.sh     (single-pane)                   ║"
echo "║  6. github-sync.sh   (single-pane)                   ║"
echo "║  7. screenshots.sh   (mixed)                         ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

read -r -p "Ready to start the full session? [Enter to begin, Ctrl+C to cancel] "

# ── Multi-pane recordings ──
echo ""
echo "▶ Phase 1: Multi-pane recordings"
echo "  Switch to multi-pane mode (unfold Z Fold6)"
read -r -p "  [Enter when in multi-pane mode] "

bash "$SCRIPT_DIR/hero.sh"
echo ""
read -r -p "Continue to CLI Co-Pilot? [Enter] "
bash "$SCRIPT_DIR/cli-copilot.sh"

# ── Single-pane recordings ──
echo ""
echo "▶ Phase 2: Single-pane recordings"
echo "  Switch to single-pane mode (fold or resize)"
read -r -p "  [Enter when in single-pane mode] "

echo "  Switching language to Japanese for cross-pane-single..."
read -r -p "  [Enter when language is Japanese] "
bash "$SCRIPT_DIR/cross-pane-single.sh"

echo ""
echo "  Switching language back to English..."
read -r -p "  [Enter when language is English] "

bash "$SCRIPT_DIR/team.sh"
echo ""
read -r -p "Continue to Savepoint? [Enter] "
bash "$SCRIPT_DIR/savepoint.sh"
echo ""
read -r -p "Continue to GitHub Sync? [Enter] "
bash "$SCRIPT_DIR/github-sync.sh"

# ── Screenshots ──
echo ""
echo "▶ Phase 3: Screenshots"
bash "$SCRIPT_DIR/screenshots.sh"

# ── Post-processing ──
echo ""
echo "▶ Phase 4: Post-processing (MP4 → GIF + subtitles)"
read -r -p "Run post-processing now? [Enter to proceed, Ctrl+C to skip] "
bash "$SCRIPT_DIR/post-process.sh"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           All done! Review your assets:             ║"
echo "║           ~/shelly-demo/                            ║"
echo "║           docs/images/                              ║"
echo "╚══════════════════════════════════════════════════════╝"
