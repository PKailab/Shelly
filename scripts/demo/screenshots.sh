#!/data/data/com.termux/files/usr/bin/bash
# screenshots.sh — Capture 7 screenshots for README / GitHub
#
# Semi-auto: script takes the screenshot, human sets up the screen state.

source "$(dirname "$0")/common.sh"

banner "Screenshots (7 shots)"

# ── SS1: Hero image ──
echo "📸 SS1: Hero image"
echo "   Multi-pane: Chat + Terminal"
echo "   Chat: AI response with ActionBlock ([▶ Run] visible)"
echo "   Terminal: command output"
echo "   Nacre keyboard visible at bottom"
wait_for "Screen is set up for SS1"
take_screenshot "hero"

# ── SS2: Setup Wizard ──
echo "📸 SS2: Setup Wizard"
echo "   Setup wizard completion screen"
echo "   Bridge ✓  Terminal ✓  AI ✓"
echo "   'Get Started' button visible"
wait_for "Screen is set up for SS2"
take_screenshot "setup-wizard"

# ── SS3: @team response ──
echo "📸 SS3: @team Multi-AI Response"
echo "   Facilitator summary at top"
echo "   Individual AI responses collapsed below"
echo "   Color badges visible (Claude=amber, Gemini=blue, etc.)"
wait_for "Screen is set up for SS3"
take_screenshot "team-response"

# ── SS4: DiffViewer ──
echo "📸 SS4: DiffViewer Modal"
echo "   DiffViewerModal open"
echo "   Green (added) / Red (removed) syntax highlights visible"
wait_for "Screen is set up for SS4"
take_screenshot "diff-viewer"

# ── SS5: GitHub suggest ──
echo "📸 SS5: GitHub Sync Suggestion"
echo "   AI proposal bubble: 'Sync to GitHub?'"
echo "   [Sync] [Later] buttons visible"
wait_for "Screen is set up for SS5"
take_screenshot "github-suggest"

# ── SS6: Themes ──
echo "📸 SS6: Theme Variations"
echo "   Option A: Settings theme selector with multiple themes visible"
echo "   Option B: Two screenshots side-by-side (compose later)"
echo "   Show at least 2 different themes"
wait_for "Screen is set up for SS6 (first theme)"
take_screenshot "themes-dark"
wait_for "Switch to a different theme for SS6 (second shot)"
take_screenshot "themes-alt"

# ── SS7: Actions Wizard ──
echo "📸 SS7: Auto-check Wizard (Step 1)"
echo "   Settings → Auto-check wizard modal open"
echo "   Step 1 visible: [✅ Build check] [✅ Run tests] [Deploy] [Release]"
wait_for "Screen is set up for SS7"
take_screenshot "actions-wizard"

echo ""
echo "════════════════════════════════════════════════════"
echo "  All 7 screenshots captured!"
echo "  Files in: $DEMO_DIR/"
echo "════════════════════════════════════════════════════"
echo ""
echo "📁 Files:"
ls -la "$DEMO_DIR"/*.png 2>/dev/null || echo "   (no PNG files found)"
