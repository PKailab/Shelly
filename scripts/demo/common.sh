#!/data/data/com.termux/files/usr/bin/bash
# common.sh — Shared helpers for Shelly demo recording (semi-auto mode).
#
# Source this file from each demo script:
#   source "$(dirname "$0")/common.sh"
#
# All text input is automated. Taps and AI-wait are manual (human).
# Each step pauses with read -p "Press Enter when ready..."

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────

DEMO_DIR="$HOME/shelly-demo"
SCREEN_W=1812
SCREEN_H=2176
RECORD_PID=""
CURRENT_RECORDING=""

mkdir -p "$DEMO_DIR"

# ─── Recording ─────────────────────────────────────────────────────────────────

start_recording() {
  local name="${1:?Usage: start_recording <name>}"
  CURRENT_RECORDING="$DEMO_DIR/${name}.mp4"
  echo "🎬 Recording → $CURRENT_RECORDING"
  adb shell screenrecord --size "${SCREEN_W}x${SCREEN_H}" --time-limit 120 "/sdcard/shelly_${name}.mp4" &
  RECORD_PID=$!
  sleep 1  # let recorder initialize
}

stop_recording() {
  local name="${1:?Usage: stop_recording <name>}"
  if [ -n "$RECORD_PID" ]; then
    kill "$RECORD_PID" 2>/dev/null || true
    wait "$RECORD_PID" 2>/dev/null || true
    RECORD_PID=""
  fi
  adb shell pkill -INT screenrecord 2>/dev/null || true
  sleep 2  # let file flush
  cp "/sdcard/shelly_${name}.mp4" "$DEMO_DIR/${name}.mp4" 2>/dev/null || \
    adb pull "/sdcard/shelly_${name}.mp4" "$DEMO_DIR/${name}.mp4" 2>/dev/null || true
  echo "✅ Saved → $DEMO_DIR/${name}.mp4"
}

# ─── Screenshot ────────────────────────────────────────────────────────────────

take_screenshot() {
  local name="${1:?Usage: take_screenshot <name>}"
  local out="$DEMO_DIR/${name}.png"
  adb shell screencap -p "/sdcard/shelly_ss_${name}.png"
  cp "/sdcard/shelly_ss_${name}.png" "$out" 2>/dev/null || \
    adb pull "/sdcard/shelly_ss_${name}.png" "$out" 2>/dev/null || true
  echo "📸 Screenshot → $out"
}

# ─── Text Input ────────────────────────────────────────────────────────────────

# Type text character by character with human-like delay.
# Usage: type_text "fix the error on the right"
# Note: adb shell input text doesn't support spaces well.
#       We use input keyevent for space (62) and special chars.
type_text() {
  local text="$1"
  local delay="${2:-0.05}"  # 50ms per char default

  for (( i=0; i<${#text}; i++ )); do
    local char="${text:$i:1}"
    case "$char" in
      " ")  adb shell input keyevent 62 ;;   # KEYCODE_SPACE
      "'")  adb shell input text "\\'" ;;
      '"')  adb shell input text '\\"' ;;
      "&")  adb shell input text "\\&" ;;
      "<")  adb shell input text "\\<" ;;
      ">")  adb shell input text "\\>" ;;
      "|")  adb shell input text "\\|" ;;
      ";")  adb shell input text "\\;" ;;
      "(")  adb shell input text "\\(" ;;
      ")")  adb shell input text "\\)" ;;
      *)    adb shell input text "$char" ;;
    esac
    sleep "$delay"
  done
}

# Paste text instantly (for longer strings where typing is too slow).
# Uses clipboard via adb broadcast — falls back to type_text if unavailable.
paste_text() {
  local text="$1"
  # Try Termux clipboard API first
  echo -n "$text" | termux-clipboard-set 2>/dev/null && \
    adb shell input keyevent 279 2>/dev/null && return  # KEYCODE_PASTE
  # Fallback: type it
  type_text "$text" 0.03
}

# ─── Timing ────────────────────────────────────────────────────────────────────

# Wait for human to perform action, then press Enter.
wait_for() {
  local msg="${1:-Press Enter when ready...}"
  echo ""
  echo "⏸️  $msg"
  read -r -p "   [Enter to continue] "
  echo ""
}

# Simple countdown display.
countdown() {
  local secs="${1:-3}"
  for (( i=secs; i>0; i-- )); do
    echo -ne "\r   Starting in ${i}..."
    sleep 1
  done
  echo -e "\r   Go!              "
}

# ─── Cleanup ───────────────────────────────────────────────────────────────────

cleanup_recording() {
  if [ -n "$RECORD_PID" ]; then
    kill "$RECORD_PID" 2>/dev/null || true
    wait "$RECORD_PID" 2>/dev/null || true
  fi
  adb shell pkill -INT screenrecord 2>/dev/null || true
}

trap cleanup_recording EXIT

# ─── Banner ────────────────────────────────────────────────────────────────────

banner() {
  local title="$1"
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  $title"
  echo "════════════════════════════════════════════════════"
  echo ""
}
