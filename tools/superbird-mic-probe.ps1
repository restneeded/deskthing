#Requires -Version 5.1
<#
.SYNOPSIS
  Superbird / Spotify Car Thing microphone probe (Windows walkthrough).

.DESCRIPTION
  Step-by-step check of whether the Car Thing's 4 far-field mics are reachable
  over ADB. Prints a guided report, writes superbird-mic-report.txt, and if
  capture works pulls superbird-mic-test.wav for you to play back.

.PARAMETER Serial
  Optional adb device serial (from `adb devices`) if more than one device is connected.

.EXAMPLE
  .\tools\superbird-mic-probe.ps1
  .\tools\superbird-mic-probe.ps1 -Serial 1234567890ABCDEF
#>
param(
  [string]$Serial = ""
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $Root) { $Root = Get-Location }
Set-Location $Root

$Report = Join-Path $Root "superbird-mic-report.txt"
$TestWav = Join-Path $Root "superbird-mic-test.wav"
$RemoteWav = "/tmp/aura-mic-test.wav"

function Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  if ($Serial) {
    & adb -s $Serial @Args
  } else {
    & adb @Args
  }
}

function Section([string]$Title) {
  $line = "`n=== $Title ==="
  Write-Host $line -ForegroundColor Cyan
  $script:Out.Add($line) | Out-Null
}

function RunShell([string]$Cmd) {
  Write-Host "  `$ adb shell $Cmd" -ForegroundColor DarkGray
  $script:Out.Add("`$ adb shell $Cmd") | Out-Null
  $r = Adb shell $Cmd 2>&1 | Out-String
  Write-Host $r
  $script:Out.Add($r) | Out-Null
  return $r
}

$script:Out = [System.Collections.Generic.List[string]]::new()
$script:Out.Add("Superbird microphone probe — $(Get-Date -Format o)") | Out-Null
$script:Out.Add("Host: $env:COMPUTERNAME  Serial: $(if($Serial){$Serial}else{'(default)'})") | Out-Null

Write-Host @"

============================================================
  AURA / CAR THING MIC PROBE — WALKTHROUGH
============================================================
  Goal: prove the device mics work over ADB so Aura can use
  them for wake word ""Lumen"" and voice commands.

  You need:
    1. Car Thing flashed with superbird / DeskThing ADB
    2. USB cable to this PC
    3. Android platform-tools (adb) on PATH

============================================================
"@ -ForegroundColor White

# --- Step 0: adb on PATH ---
Section "0. Is adb installed?"
$adbCmd = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbCmd) {
  Write-Host @"

  FAIL: `adb` not found on PATH.

  Fix:
    1. Install Android platform-tools
       https://developer.android.com/tools/releases/platform-tools
    2. Unzip and add the folder to PATH
    3. Open a NEW PowerShell and re-run this script

"@ -ForegroundColor Red
  $script:Out.Add("FAIL: adb missing") | Out-Null
  $script:Out | Set-Content -Path $Report -Encoding UTF8
  exit 1
}
Write-Host "  OK: $($adbCmd.Source)" -ForegroundColor Green
$script:Out.Add("adb: $($adbCmd.Source)") | Out-Null

# --- Step 1: device ---
Section "1. Is the Car Thing connected?"
$devices = Adb devices -l 2>&1 | Out-String
Write-Host $devices
$script:Out.Add($devices) | Out-Null

$lines = (Adb devices 2>&1 | Out-String) -split "`n" | Where-Object { $_ -match "`tdevice" }
if (-not $lines) {
  Write-Host @"

  FAIL: no authorized ADB device.

  Checklist:
    [ ] USB cable is data-capable (not charge-only)
    [ ] Car Thing is powered / booted into DeskThing or superbird
    [ ] ADB enabled (superbird-tool / DeskThing device setup)
    [ ] On first connect, accept the RSA prompt if you ever see one
    [ ] Try: adb kill-server; adb start-server; adb devices

"@ -ForegroundColor Red
  $script:Out.Add("FAIL: no device") | Out-Null
  $script:Out | Set-Content -Path $Report -Encoding UTF8
  exit 1
}
Write-Host "  OK: device listed as 'device'" -ForegroundColor Green

# shell smoke test
$ok = Adb shell true 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "  FAIL: adb shell does not work. Re-plug and re-enable ADB." -ForegroundColor Red
  $script:Out | Set-Content -Path $Report -Encoding UTF8
  exit 1
}

# --- Step 2: board ---
Section "2. Kernel / board model"
RunShell "uname -a" | Out-Null
RunShell "cat /proc/device-tree/model 2>/dev/null; echo" | Out-Null

# --- Step 3: ALSA ---
Section "3. ALSA sound cards (KEY)"
$cards = RunShell "cat /proc/asound/cards 2>/dev/null"
$pcm = RunShell "cat /proc/asound/pcm 2>/dev/null"
$snd = RunShell "ls -l /dev/snd 2>/dev/null"

Section "4. Capture-capable PCM (must exist for cracked mics)"
$capPcm = RunShell "cat /proc/asound/pcm 2>/dev/null | grep -i capture || true"
$capDev = RunShell "ls /dev/snd 2>/dev/null | grep 'c\$' || true"

$hasCapture = ($capPcm -match "capture") -or ($capDev -match "pcmC\d+D\d+c")
if ($hasCapture) {
  Write-Host "  OK: capture PCM present — mics are exposed at the OS level." -ForegroundColor Green
} else {
  Write-Host @"

  WARN: no capture PCM found.
  Stock firmware used these mics; if DeskThing/superbird DT disabled PDM,
  you need the device-tree path in docs/MICROPHONE.md (Step 3B).

"@ -ForegroundColor Yellow
}

# --- Step 5: tools ---
Section "5. Capture tools on device"
$tools = RunShell "command -v arecord; command -v tinycap; command -v tinymix; command -v amixer; echo done"
$hasArecord = $tools -match "/arecord"
$hasTinycap = $tools -match "/tinycap"
if (-not $hasArecord -and -not $hasTinycap) {
  Write-Host @"

  WARN: neither arecord nor tinycap on device.
  Push a static tinyalsa (tinycap/tinymix) — see docs/HARDWARE_PROBE.md

"@ -ForegroundColor Yellow
}

# --- Step 6: DT / dmesg ---
Section "6. Device-tree audio / PDM hints"
RunShell "ls /proc/device-tree 2>/dev/null | grep -iE 'sound|audio|pdm|tdm|mic' || true" | Out-Null
RunShell "find /proc/device-tree -maxdepth 3 \( -iname '*pdm*' -o -iname '*dmic*' -o -iname '*sound*' \) 2>/dev/null | head -40" | Out-Null

Section "7. dmesg audio lines"
RunShell "dmesg 2>/dev/null | grep -iE 'pdm|tdm|dmic|asound|sound|codec|audio' | tail -40 || true" | Out-Null

Section "8. Mixer (often muted / zero gain = silence)"
RunShell "tinymix 2>/dev/null | head -80 || true" | Out-Null
RunShell "amixer controls 2>/dev/null | grep -iE 'capture|pdm|mic|adc' | head -40 || true" | Out-Null

# --- Step 9: test record ---
Section "9. TEST CAPTURE (3 seconds) — stay quiet, then speak"
Write-Host "  Recording 3s on-device → $RemoteWav" -ForegroundColor White
Adb shell "rm -f $RemoteWav" 2>&1 | Out-Null

$recorded = $false
if ($hasArecord) {
  Write-Host "  using arecord…" -ForegroundColor DarkGray
  RunShell "arecord -d 3 -f S16_LE -r 16000 -c 2 $RemoteWav 2>&1" | Out-Null
  $recorded = $true
} elseif ($hasTinycap) {
  Write-Host "  using tinycap (card 0 device 0)…" -ForegroundColor DarkGray
  # tinycap runs until killed; use timeout if present, else background+sleep+kill
  RunShell "sh -c 'tinycap $RemoteWav -D 0 -d 0 -c 2 -r 16000 -b 16 >/dev/null 2>&1 & echo PID=`$!; sleep 3; kill -INT `$! 2>/dev/null; wait `$! 2>/dev/null; ls -l $RemoteWav'" | Out-Null
  $recorded = $true
} else {
  Write-Host "  SKIP: no recorder binary on device." -ForegroundColor Yellow
}

$remoteLs = RunShell "ls -l $RemoteWav 2>/dev/null || echo MISSING"

# --- Pull ---
Section "10. Pull test WAV to host"
if ($remoteLs -match "MISSING" -or $remoteLs -notmatch "aura-mic-test") {
  Write-Host "  No remote WAV to pull." -ForegroundColor Yellow
} else {
  if (Test-Path $TestWav) { Remove-Item $TestWav -Force }
  Adb pull $RemoteWav $TestWav 2>&1 | ForEach-Object { Write-Host "  $_"; $script:Out.Add("$_") }
  Adb shell "rm -f $RemoteWav" 2>&1 | Out-Null
  if (Test-Path $TestWav) {
    $len = (Get-Item $TestWav).Length
    Write-Host "  Saved: $TestWav ($len bytes)" -ForegroundColor Green
    $script:Out.Add("Pulled $TestWav ($len bytes)") | Out-Null
    if ($len -gt 1000) {
      Write-Host @"

  NEXT: play the file.
    start "" "$TestWav"

  Results:
    [A] You hear yourself clearly  → MIC CRACKED. Aura can use Car Thing mics.
        DeskThing → Aura settings → Microphone source = Car Thing mics (via ADB)
        Voice mode = Wake word · Wake words / model = Lumen

    [B] File is silent / hiss only → capture exists but muted.
        See docs/HARDWARE_PROBE.md section "Silence but file exists"
        (tinymix / amixer capture switches and gain)

    [C] File tiny / corrupt        → wrong card/device for tinycap.
        Re-run with adjusted -D/-d from section 3 PCM list.

"@ -ForegroundColor White
      # try to open player
      try { Start-Process $TestWav } catch { }
    } else {
      Write-Host "  WAV too small — capture likely failed." -ForegroundColor Yellow
    }
  }
}

# --- Verdict ---
Section "VERDICT"
$verdict = if ($hasCapture -and (Test-Path $TestWav) -and ((Get-Item $TestWav).Length -gt 1000)) {
  "PASS_LIKELY — play the WAV. If you hear speech, set Aura mic source to Car Thing."
} elseif ($hasCapture) {
  "PARTIAL — capture PCM exists but test clip missing/silent. Fix mixer or card/device index."
} else {
  "FAIL — no capture PCM. Device-tree / kernel path required (docs/MICROPHONE.md Step 3B)."
}
Write-Host "  $verdict" -ForegroundColor $(if ($verdict -match "^PASS") { "Green" } elseif ($verdict -match "^PARTIAL") { "Yellow" } else { "Red" })
$script:Out.Add("VERDICT: $verdict") | Out-Null

$script:Out | Set-Content -Path $Report -Encoding UTF8
Write-Host "`nFull report saved: $Report`n" -ForegroundColor Cyan
Write-Host "Continue in docs/HARDWARE_PROBE.md (mixer fix, DTB, Aura settings).`n" -ForegroundColor DarkGray
