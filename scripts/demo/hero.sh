#!/data/data/com.termux/files/usr/bin/bash
# hero.sh — Material 1: Hero GIF (12 seconds)
#
# Cross-Pane Intelligence demo:
#   Terminal has build error → Chat: "fix the error on the right"
#   → AI responds → ActionBlock [▶ Run] → Terminal executes → Auto-save
#
# Prerequisites:
#   - Shelly open in multi-pane mode (Chat + Terminal)
#   - Terminal showing a build error (run the failing command beforehand)
#   - Language: English

source "$(dirname "$0")/common.sh"

banner "Hero GIF — Cross-Pane Intelligence (12s)"

echo "📋 Prerequisites:"
echo "   1. Shelly in multi-pane (Chat left, Terminal right)"
echo "   2. Terminal showing an error, e.g.:"
echo "      \$ npm run build"
echo "      Error: Cannot find module './utils'"
echo "   3. Language set to English"
echo "   4. Chat input field visible"
echo ""

# ── Prepare the error ──
wait_for "Make sure Terminal has a visible error. Ready?"

# ── Take 1 (or 2 or 3) ──
echo "🎬 Starting take. 3 takes recommended."
countdown 3

# Step 1: Start recording
start_recording "hero"

# Step 2: Tap the chat input field
wait_for "Tap the Chat input field (Nacre keyboard should appear)"

# Step 3: Type the prompt
echo "⌨️  Typing: fix the error on the right"
type_text "fix the error on the right" 0.05
sleep 0.5

# Step 4: Send
wait_for "Tap the Send button"

# Step 5: Wait for AI response + ActionBlock
wait_for "Wait for AI response with ActionBlock [▶ Run] to appear"

# Step 6: Run the command
wait_for "Tap [▶ Run] on the ActionBlock"

# Step 7: Wait for execution + auto-save badge
wait_for "Wait for Terminal execution + 💾 save badge (about 2-3 seconds)"

# Step 8: Stop recording
sleep 1
stop_recording "hero"

echo ""
echo "✅ Take complete! File: $DEMO_DIR/hero.mp4"
echo "   Run this script again for additional takes."
echo "   Rename files to hero_take2.mp4, hero_take3.mp4 etc."
