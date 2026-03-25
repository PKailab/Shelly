#!/data/data/com.termux/files/usr/bin/bash
# github-sync.sh — Material 6: GitHub Sync + Auto-Check (12s)
#
# AI suggests sync → user taps Sync → push completes
# → AutoCheckProposal appears → user taps "Turn on"
# → CI configured.
#
# Prerequisites:
#   - Chat tab open
#   - GitHub PAT configured
#   - Project has remote origin
#   - AsyncStorage 'shelly_autocheck_offered' DELETED (for fresh proposal)
#   - Multiple savepoints accumulated (5+)
#   - Language: English
#
# To reset auto-check flag before recording:
#   In Shelly chat, run: @local clear shelly_autocheck_offered
#   Or manually clear via adb / AsyncStorage debug

source "$(dirname "$0")/common.sh"

banner "Feature GIF — GitHub Sync + Auto-Check (12s)"

echo "📋 Prerequisites:"
echo "   1. Chat tab open"
echo "   2. GitHub PAT configured in Settings"
echo "   3. Project has git remote origin"
echo "   4. 5+ uncommitted/unpushed savepoints"
echo "   5. AsyncStorage 'shelly_autocheck_offered' must be CLEARED"
echo "   6. Language: English"
echo ""
echo "⚠️  To reset the auto-check flag:"
echo "   Open Shelly Settings → Clear Storage → or manually delete the key"
echo ""

wait_for "All prerequisites met. Ready?"
countdown 3

start_recording "github-sync"

# Step 1: The sync suggestion should already be visible
# If not, trigger it by running a command that creates a savepoint
wait_for "Git sync suggestion bubble should be visible:
         '💡 N savepoints not synced. Sync to GitHub?'
         If not visible, create more savepoints first."

# Step 2: Tap Sync
wait_for "Tap [Sync]"

# Step 3: Wait for push to complete
wait_for "Wait for 'Synced!' message to appear"

# Step 4: AutoCheckProposal should appear ~800ms later
wait_for "Wait for AutoCheckProposal bubble:
         '✓ Auto-check available'
         [Maybe later]  [⚡ Turn on]"

# Step 5: Tap Turn on
wait_for "Tap [⚡ Turn on]"

# Step 6: Wait for setup
wait_for "Wait for 'Auto-check is on!' confirmation"

# Step 7: Hold for 1 second
sleep 1
stop_recording "github-sync"

echo ""
echo "✅ Take complete! File: $DEMO_DIR/github-sync.mp4"
echo ""
echo "⚠️  Remember: The auto-check flag is now set."
echo "   To retake, clear 'shelly_autocheck_offered' from AsyncStorage."
