#!/data/data/com.termux/files/usr/bin/bash
# savepoint.sh — Material 4: Auto-Savepoint + Undo (8s)
#
# SavepointBubble → View Changes (diff) → Undo.
# Shows the game-like auto-save UX.
#
# Prerequisites:
#   - Chat tab with a recent AI operation that modified files
#   - SavepointBubble visible: "📁 Modified N files" [Undo] [View changes]
#   - Language: English

source "$(dirname "$0")/common.sh"

banner "Feature GIF — Auto-Savepoint + Undo (8s)"

echo "📋 Prerequisites:"
echo "   1. Chat tab open"
echo "   2. SavepointBubble visible under a recent AI message"
echo "      (run an AI command that modifies files first)"
echo "   3. Language: English"
echo ""

wait_for "SavepointBubble is visible in chat. Ready?"
countdown 3

start_recording "savepoint"

# Step 1: Show the SavepointBubble for 1 second
sleep 1

# Step 2: View changes
wait_for "Tap [View changes] on the SavepointBubble"

# Step 3: Show diff modal
wait_for "DiffViewer modal is showing. Wait 2 seconds for viewer."
sleep 2

# Step 4: Close modal
wait_for "Close the DiffViewer modal (tap outside or back)"

# Step 5: Undo
wait_for "Tap [Undo] on the SavepointBubble"

# Step 6: Show revert result
sleep 1.5
stop_recording "savepoint"

echo ""
echo "✅ Take complete! File: $DEMO_DIR/savepoint.mp4"
