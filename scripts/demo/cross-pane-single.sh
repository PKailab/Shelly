#!/data/data/com.termux/files/usr/bin/bash
# cross-pane-single.sh — Material 2: Single-Pane Cross-Pane Reference (10s)
#
# Shows cross-pane intelligence works even in single-pane mode:
#   Terminal tab: python error → Switch to Chat tab
#   → "さっきのエラー直して" (Japanese) → AI responds → ActionBlock → Run
#
# Prerequisites:
#   - Shelly in single-pane mode (phone or folded)
#   - Terminal tab showing a Python test error
#   - Language: Japanese (to demo i18n)

source "$(dirname "$0")/common.sh"

banner "Feature GIF — Single-Pane Cross-Pane (10s)"

echo "📋 Prerequisites:"
echo "   1. Single-pane mode (or folded Z Fold6)"
echo "   2. Currently on Terminal tab with an error visible:"
echo "      \$ python test.py"
echo "      AssertionError: expected 200, got 404"
echo "   3. Language: Japanese"
echo ""

wait_for "Terminal tab showing the error. Ready?"
countdown 3

start_recording "cross-pane-single"

# Step 1: Show the terminal error for 2 seconds
sleep 2

# Step 2: Switch to Chat tab
wait_for "Tap the Chat tab to switch"

# Step 3: Type Japanese prompt
sleep 0.5
wait_for "Tap the Chat input field"
echo "⌨️  Typing: さっきのエラー直して"
# Japanese text via paste (adb input text doesn't handle CJK well)
paste_text "さっきのエラー直して"
sleep 0.5

# Step 4: Send
wait_for "Tap Send"

# Step 5: Wait for AI response
wait_for "Wait for AI response with ActionBlock to appear"

# Step 6: Run
wait_for "Tap [▶ Run] on the ActionBlock"

# Step 7: Done
sleep 1
stop_recording "cross-pane-single"

echo ""
echo "✅ Take complete! File: $DEMO_DIR/cross-pane-single.mp4"
