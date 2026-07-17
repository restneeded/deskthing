#!/usr/bin/env bash
#
# superbird-mic-probe.sh — figure out whether the Car Thing's microphones are
# reachable from a shell over ADB (they almost certainly are — the stock OS did
# "Hey Spotify" voice, and community firmware keeps the stock kernel).
#
# This does NOT need DeskThing to be closed; adb multiplexes. Run it with the
# Car Thing plugged in and ADB enabled (superbird-tool enables ADB).
#
# Usage:  ./tools/superbird-mic-probe.sh [adb-serial]
# Output: prints a report and saves it to ./superbird-mic-report.txt
#         plus pulls a test recording to ./superbird-mic-test.wav if capture works.

set -u
SERIAL="${1:-}"
ADB="adb"
[ -n "$SERIAL" ] && ADB="adb -s $SERIAL"
REPORT="superbird-mic-report.txt"
TESTWAV="superbird-mic-test.wav"

say() { printf '\n=== %s ===\n' "$1"; }
run() { echo "\$ $*"; $ADB shell "$*" 2>&1; echo; }

{
echo "Superbird microphone probe — $(date)"
echo "adb: $ADB"

say "0. Device reachable?"
$ADB devices -l 2>&1
if ! $ADB shell true >/dev/null 2>&1; then
  echo "!! No ADB device. Plug in the Car Thing and enable ADB (superbird-tool)."
  exit 1
fi

say "1. Kernel / board"
run "uname -a"
run "cat /proc/device-tree/model 2>/dev/null; echo"

say "2. ALSA sound cards (the key question)"
run "cat /proc/asound/cards 2>/dev/null"
run "cat /proc/asound/pcm 2>/dev/null"
run "ls -l /dev/snd 2>/dev/null"
run "ls /sys/class/sound 2>/dev/null"

say "3. Capture-capable PCM devices"
# a 'c' in /proc/asound/pcm or a pcmC?D?c node in /dev/snd == a capture device
run "cat /proc/asound/pcm 2>/dev/null | grep -i capture"
run "ls /dev/snd 2>/dev/null | grep c\$"

say "4. Which capture tools exist on the device?"
run "command -v arecord tinycap tinymix amixer 2>/dev/null; echo done"

say "5. Device-tree audio / PDM / mic nodes"
run "ls /proc/device-tree 2>/dev/null | grep -iE 'sound|audio|pdm|tdm|mic'"
run "find /proc/device-tree -maxdepth 2 -iname '*pdm*' -o -iname '*sound*' -o -iname '*audio*' -o -iname '*dmic*' 2>/dev/null"

say "6. dmesg audio lines"
run "dmesg 2>/dev/null | grep -iE 'pdm|tdm|dmic|asound|sound|codec|audio' | tail -40"

say "7. Mixer controls (mics often start muted / zero-gain)"
run "tinymix 2>/dev/null | head -60"
run "amixer controls 2>/dev/null | grep -iE 'capture|pdm|mic|adc' | head -40"

say "8. TEST CAPTURE (3 seconds)"
echo "Trying to actually record 3s of audio to /tmp/aura-mic-test.wav on the device..."
# Prefer arecord (writes a proper WAV + finalizes on exit); fall back to tinycap.
if $ADB shell 'command -v arecord >/dev/null 2>&1'; then
  echo "-> using arecord"
  run "arecord -d 3 -f S16_LE -r 16000 -c 2 /tmp/aura-mic-test.wav 2>&1"
elif $ADB shell 'command -v tinycap >/dev/null 2>&1'; then
  echo "-> using tinycap (card 0, dev 0; adjust from section 3 if needed)"
  run "timeout 3 tinycap /tmp/aura-mic-test.wav -D 0 -d 0 -c 2 -r 16000 -b 16 2>&1; echo captured"
else
  echo "!! Neither arecord nor tinycap on device. See docs/MICROPHONE.md to push a tinyalsa static binary."
fi
run "ls -l /tmp/aura-mic-test.wav 2>/dev/null"

} 2>&1 | tee "$REPORT"

# Pull the test recording if it exists and is non-trivial
if $ADB shell 'test -s /tmp/aura-mic-test.wav' 2>/dev/null; then
  $ADB pull /tmp/aura-mic-test.wav "$TESTWAV" >/dev/null 2>&1 && \
    echo -e "\n✅ Pulled test recording -> $TESTWAV — play it. If you hear yourself, the mic is CRACKED." || \
    echo -e "\n(could not pull test wav)"
  $ADB shell 'rm -f /tmp/aura-mic-test.wav' >/dev/null 2>&1
else
  echo -e "\n⚠️  No test recording produced. Read $REPORT sections 2–5: if there's no capture PCM, the PDM node may be disabled in the device tree (see docs/MICROPHONE.md, 'If ALSA shows no capture device')."
fi

echo -e "\nFull report: $REPORT"
