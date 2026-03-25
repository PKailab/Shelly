#!/data/data/com.termux/files/usr/bin/bash
# team.sh — Material 3: @team Multi-AI Consensus (8s)
#
# One prompt → multiple AIs respond in parallel → facilitator summary.
#
# Prerequisites:
#   - Chat tab open (single-pane is fine)
#   - At least 2 AI providers configured (e.g. Cerebras + Gemini)
#   - Language: English

source "$(dirname "$0")/common.sh"

banner "Feature GIF — @team Multi-AI (8s)"

echo "📋 Prerequisites:"
echo "   1. Chat tab open"
echo "   2. Multiple AI providers configured"
echo "   3. Language: English"
echo ""

wait_for "Chat tab open, input field visible. Ready?"
countdown 3

start_recording "team"

# Step 1: Type @team prompt
wait_for "Tap the Chat input field"
echo "⌨️  Typing: @team What architecture should I use for a REST API?"
type_text "@team" 0.05
sleep 0.3
type_text " What architecture should I use for a REST API?" 0.04
sleep 0.5

# Step 2: Send
wait_for "Tap Send"

# Step 3: Wait for multiple AI responses
wait_for "Wait for multiple AI responses to appear (Claude, Gemini, etc.) + facilitator summary"

# Step 4: Done
sleep 1
stop_recording "team"

echo ""
echo "✅ Take complete! File: $DEMO_DIR/team.mp4"
