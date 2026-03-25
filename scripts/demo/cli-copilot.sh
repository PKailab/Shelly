#!/data/data/com.termux/files/usr/bin/bash
# cli-copilot.sh — Material 5: CLI Co-Pilot Real-time Translation (8s)
#
# Multi-pane: Terminal running claude → Chat overlay shows Japanese translation
# + permission prompt risk display.
#
# Prerequisites:
#   - Multi-pane mode (Chat + Terminal)
#   - Terminal about to run or already running `claude`
#   - Cerebras or Groq API key configured (for fast translation)
#   - Language: Japanese (translation target)

source "$(dirname "$0")/common.sh"

banner "Feature GIF — CLI Co-Pilot Translation (8s)"

echo "📋 Prerequisites:"
echo "   1. Multi-pane: Chat left, Terminal right"
echo "   2. Terminal ready to launch 'claude'"
echo "   3. Cerebras/Groq configured for fast translation"
echo "   4. Language: Japanese"
echo ""

wait_for "Multi-pane ready. Ready to start claude in Terminal?"
countdown 3

start_recording "cli-copilot"

# Step 1: Launch claude in terminal
wait_for "Type 'claude' in Terminal and press Enter. Wait for claude to respond with something."

# Step 2: Wait for translation overlay
wait_for "Translation overlay should appear on Chat side. Wait for it."

# Step 3: Wait for permission prompt
wait_for "Wait for claude to show an 'Allow editing?' prompt in Terminal.
         Chat side should show the ⚠️ risk alert."

# Step 4: Hold for 2 seconds
sleep 2
stop_recording "cli-copilot"

echo ""
echo "✅ Take complete! File: $DEMO_DIR/cli-copilot.mp4"
echo ""
echo "💡 Tip: If claude doesn't show a permission prompt naturally,"
echo "   ask it to edit a file: 'edit src/app.ts to add a comment'"
