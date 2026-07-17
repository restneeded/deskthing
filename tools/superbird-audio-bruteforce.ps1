#Requires -Version 5.1
<#
.SYNOPSIS
  Brute-force Car Thing mic CAPTURE + speaker PLAYBACK over ADB.

.DESCRIPTION
  For a PC that already has DeskThing/ADB talking to the Car Thing.
  Systematically tries:
    - capture: arecord/tinycap across cards, devices, channels
    - mixer: toggle capture-ish controls and re-test
    - playback: tinyplay/aplay of a short tone to each playback device
  Scores WAVs by size + optional RMS energy and writes a ranked report.

.PARAMETER Serial
  Optional adb serial if multiple devices.

.PARAMETER MaxCard
  Highest ALSA card index to try (default 3).

.PARAMETER MaxDevice
  Highest device index per card (default 3).

.PARAMETER SkipMixerSweep
  Skip the slower tinymix toggle phase.

.EXAMPLE
  .\tools\superbird-audio-bruteforce.ps1
  .\tools\superbird-audio-bruteforce.ps1 -Serial ABC123 -MaxCard 2
#>
param(
  [string]$Serial = "",
  [int]$MaxCard = 3,
  [int]$MaxDevice = 3,
  [switch]$SkipMixerSweep
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $Root) { $Root = (Get-Location).Path }
Set-Location $Root

$OutDir = Join-Path $Root "superbird-audio-bruteforce"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Report = Join-Path $OutDir "REPORT.txt"
$Hits = [System.Collections.Generic.List[string]]::new()

function Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)
  if ($Serial) { & adb -s $Serial @Rest } else { & adb @Rest }
}

function Shell([string]$Cmd, [int]$TimeoutSec = 20) {
  $job = Start-Job -ScriptBlock {
    param($Serial, $Cmd)
    if ($Serial) { adb -s $Serial shell $Cmd 2>&1 | Out-String }
    else { adb shell $Cmd 2>&1 | Out-String }
  } -ArgumentList $Serial, $Cmd
  if (-not (Wait-Job $job -Timeout $TimeoutSec)) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    return "TIMEOUT"
  }
  $r = Receive-Job $job
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  return ($r | Out-String)
}

function Log([string]$Msg, [string]$Color = "White") {
  Write-Host $Msg -ForegroundColor $Color
  Add-Content -Path $Report -Value $Msg
}

function WavEnergy([string]$Path) {
  # Rough PCM energy: skip 44-byte header, mean abs of int16 samples
  try {
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 1000) { return 0.0 }
    $start = 44
    if ($bytes.Length -lt $start + 4) { return 0.0 }
    $sum = 0.0
    $n = 0
    for ($i = $start; $i + 1 -lt $bytes.Length; $i += 2) {
      $s = [BitConverter]::ToInt16($bytes, $i)
      $sum += [Math]::Abs([double]$s)
      $n++
      if ($n -ge 80000) { break }
    }
    if ($n -eq 0) { return 0.0 }
    return [Math]::Round($sum / $n, 2)
  } catch { return 0.0 }
}

"" | Set-Content $Report
Log "============================================================"
Log " SUPERBIRD AUDIO BRUTEFORCE — $(Get-Date -Format o)"
Log " Out: $OutDir"
Log "============================================================" "Cyan"

# --- 0. adb ---
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  Log "FAIL: adb not on PATH. Install platform-tools and enable DeskThing 'Use Global ADB'." "Red"
  exit 1
}
$dev = adb devices 2>&1 | Out-String
Log $dev
if ($dev -notmatch "`tdevice") {
  Log "FAIL: no 'device' in adb devices. Plug Car Thing / open DeskThing / adb kill-server." "Red"
  exit 1
}
Shell "true" | Out-Null
if ($LASTEXITCODE -ne 0 -and -not (Shell "echo ok" | Select-String "ok")) {
  Log "WARN: shell check weird; continuing anyway" "Yellow"
}

# --- 1. inventory ---
Log "`n=== INVENTORY ===" "Cyan"
$cards = Shell "cat /proc/asound/cards 2>/dev/null; echo; cat /proc/asound/pcm 2>/dev/null; echo; ls -l /dev/snd 2>/dev/null"
Log $cards
$tools = Shell "command -v arecord; command -v aplay; command -v tinycap; command -v tinyplay; command -v tinymix; command -v amixer; echo DONE"
Log $tools
$hasArecord = $tools -match "arecord"
$hasAplay = $tools -match "aplay"
$hasTinycap = $tools -match "tinycap"
$hasTinyplay = $tools -match "tinyplay"
$hasTinymix = $tools -match "tinymix"

# --- 2. generate a short tone on HOST for playback tests ---
$ToneLocal = Join-Path $OutDir "tone_1k_1s.wav"
Log "`n=== BUILD HOST TONE ===" "Cyan"
$toneBuilt = $false
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  & ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=1000:duration=1" -ar 16000 -ac 1 -c:a pcm_s16le $ToneLocal 2>&1 | Out-Null
  if (Test-Path $ToneLocal) { $toneBuilt = $true; Log "tone via ffmpeg: $ToneLocal" "Green" }
}
if (-not $toneBuilt) {
  # Minimal 16kHz mono 1s 1kHz-ish square-ish WAV (header + silence then noise)
  $sr = 16000
  $samples = $sr
  $data = New-Object byte[] ($samples * 2)
  for ($i = 0; $i -lt $samples; $i++) {
    $v = if (($i % 16) -lt 8) { 8000 } else { -8000 }
    $b = [BitConverter]::GetBytes([int16]$v)
    $data[2 * $i] = $b[0]
    $data[2 * $i + 1] = $b[1]
  }
  $dataLen = $data.Length
  $ms = New-Object IO.MemoryStream
  $bw = New-Object IO.BinaryWriter $ms
  $bw.Write([Text.Encoding]::ASCII.GetBytes("RIFF"))
  $bw.Write([int](36 + $dataLen))
  $bw.Write([Text.Encoding]::ASCII.GetBytes("WAVE"))
  $bw.Write([Text.Encoding]::ASCII.GetBytes("fmt "))
  $bw.Write([int]16)
  $bw.Write([int16]1)      # PCM
  $bw.Write([int16]1)      # mono
  $bw.Write([int]$sr)
  $bw.Write([int]($sr * 2))
  $bw.Write([int16]2)
  $bw.Write([int16]16)
  $bw.Write([Text.Encoding]::ASCII.GetBytes("data"))
  $bw.Write([int]$dataLen)
  $bw.Write($data)
  $bw.Flush()
  [IO.File]::WriteAllBytes($ToneLocal, $ms.ToArray())
  $bw.Close(); $ms.Close()
  $toneBuilt = Test-Path $ToneLocal
  Log "tone via raw WAV writer: $ToneLocal" "Green"
}
$RemoteTone = "/tmp/aura-bf-tone.wav"
if ($toneBuilt) {
  Adb push $ToneLocal $RemoteTone 2>&1 | ForEach-Object { Log "  $_" "DarkGray" }
}

# --- 3. CAPTURE sweep ---
Log "`n=== CAPTURE SWEEP ===" "Cyan"
$captureHits = @()
$channelsList = @(1, 2, 4)
$rates = @(16000)

function TryCapture([string]$Tag, [scriptblock]$StartRemote) {
  $remote = "/tmp/aura-bf-cap.wav"
  Shell "rm -f $remote" | Out-Null
  & $StartRemote
  $ls = Shell "ls -l $remote 2>/dev/null || echo MISSING"
  if ($ls -match "MISSING" -or $ls -notmatch "aura-bf-cap") {
    Log "  [$Tag] no remote file" "DarkGray"
    return
  }
  $local = Join-Path $OutDir ("cap_{0}.wav" -f ($Tag -replace '[^\w\-]+', '_'))
  if (Test-Path $local) { Remove-Item $local -Force }
  Adb pull $remote $local 2>&1 | Out-Null
  Shell "rm -f $remote" | Out-Null
  if (-not (Test-Path $local)) {
    Log "  [$Tag] pull failed" "DarkGray"
    return
  }
  $len = (Get-Item $local).Length
  $e = WavEnergy $local
  $line = "  [$Tag] size=$len energy=$e -> $local"
  if ($len -gt 2000 -and $e -gt 50) {
    Log $line "Green"
    $script:Hits.Add("CAPTURE HIT $Tag size=$len energy=$e file=$local") | Out-Null
    $script:captureHits += [pscustomobject]@{ Tag = $Tag; Size = $len; Energy = $e; File = $local }
  } elseif ($len -gt 2000) {
    Log "$line (file ok but low energy — maybe silence/muted)" "Yellow"
  } else {
    Log $line "DarkGray"
  }
}

if ($hasArecord) {
  foreach ($ch in $channelsList) {
    foreach ($rate in $rates) {
      $tag = "arecord_c${ch}_r$rate"
      TryCapture $tag {
        Shell "arecord -d 2 -f S16_LE -r $rate -c $ch /tmp/aura-bf-cap.wav 2>&1" | Out-Null
      }
    }
  }
  # also try default device string
  TryCapture "arecord_default" {
    Shell "arecord -d 2 -f S16_LE -r 16000 -c 2 /tmp/aura-bf-cap.wav 2>&1" | Out-Null
  }
}

if ($hasTinycap) {
  for ($card = 0; $card -le $MaxCard; $card++) {
    for ($dev = 0; $dev -le $MaxDevice; $dev++) {
      foreach ($ch in $channelsList) {
        $tag = "tinycap_D${card}_d${dev}_c$ch"
        TryCapture $tag {
          Shell "sh -c 'tinycap /tmp/aura-bf-cap.wav -D $card -d $dev -c $ch -r 16000 -b 16 >/tmp/aura-bf-cap.log 2>&1 & echo `$`!; sleep 2; kill -INT `$`$ 2>/dev/null; wait 2>/dev/null; cat /tmp/aura-bf-cap.log'" 25 | Out-Null
        }
      }
    }
  }
}

if (-not $hasArecord -and -not $hasTinycap) {
  Log "No arecord/tinycap on device. Push tinyalsa static binaries (see HARDWARE_PROBE.md)." "Yellow"
}

# --- 4. Mixer sweep (re-test best tinycap path or default) ---
if (-not $SkipMixerSweep -and $hasTinymix) {
  Log "`n=== MIXER SWEEP (capture-ish controls) ===" "Cyan"
  $mix = Shell "tinymix 2>/dev/null"
  Log ($mix.Substring(0, [Math]::Min(4000, $mix.Length)))
  # Parse control names roughly: lines often "N. Name values"
  $names = @()
  foreach ($line in ($mix -split "`n")) {
    if ($line -match "^\s*\d+\.\s+(.+?)\s+\S") {
      $n = $Matches[1].Trim()
      if ($n -match "(?i)capture|pdm|mic|adc|in |loop|record|dmic") {
        $names += $n
      }
    }
  }
  $names = $names | Select-Object -Unique | Select-Object -First 40
  Log "Candidate controls ($($names.Count)): $($names -join ' | ')" "Cyan"

  foreach ($name in $names) {
    # try enable / raise
    $safe = $name -replace "'", ""
    Shell "tinymix '$safe' 1 2>/dev/null; tinymix '$safe' 100 2>/dev/null; tinymix '$safe' 50 2>/dev/null" | Out-Null
    $tag = "mixer_$($safe -replace '\s+','_')"
    if ($hasArecord) {
      TryCapture $tag {
        Shell "arecord -d 2 -f S16_LE -r 16000 -c 2 /tmp/aura-bf-cap.wav 2>&1" | Out-Null
      }
    } elseif ($hasTinycap) {
      TryCapture $tag {
        Shell "sh -c 'tinycap /tmp/aura-bf-cap.wav -D 0 -d 0 -c 2 -r 16000 -b 16 >/dev/null 2>&1 & sleep 2; kill -INT `$! 2>/dev/null'" 20 | Out-Null
      }
    }
  }
}

# --- 5. PLAYBACK sweep ---
Log "`n=== PLAYBACK SWEEP (listen to Car Thing speakers) ===" "Cyan"
Log "When you hear a beep/tone, note the tag printed above it." "Yellow"
$playHits = @()

function TryPlay([string]$Tag, [scriptblock]$PlayCmd) {
  Log "  PLAY try [$Tag] — listen now…" "White"
  $out = & $PlayCmd
  if ($out) { Log "    $out" "DarkGray" }
  $script:Hits.Add("PLAYBACK TRIED $Tag") | Out-Null
}

if ($toneBuilt -and (Shell "test -f $RemoteTone && echo YES" ) -match "YES") {
  if ($hasAplay) {
    TryPlay "aplay_default" {
      Shell "aplay -d 1 $RemoteTone 2>&1"
    }
    for ($card = 0; $card -le $MaxCard; $card++) {
      TryPlay "aplay_D$card" {
        Shell "aplay -D hw:$card,0 -d 1 $RemoteTone 2>&1"
      }
      TryPlay "aplay_plughw_$card" {
        Shell "aplay -D plughw:$card,0 -d 1 $RemoteTone 2>&1"
      }
    }
  }
  if ($hasTinyplay) {
    for ($card = 0; $card -le $MaxCard; $card++) {
      for ($dev = 0; $dev -le $MaxDevice; $dev++) {
        TryPlay "tinyplay_D${card}_d$dev" {
          Shell "tinyplay $RemoteTone -D $card -d $dev 2>&1"
        }
      }
    }
  }
  if (-not $hasAplay -and -not $hasTinyplay) {
    Log "No aplay/tinyplay on device — cannot brute force speakers until a player binary exists." "Yellow"
  }
} else {
  Log "No tone on device; skip playback." "Yellow"
}

# --- 6. Speaker mixer (playback volume) ---
if ($hasTinymix) {
  Log "`n=== SPEAKER MIXER (raise playback-ish controls) ===" "Cyan"
  $mix2 = Shell "tinymix 2>/dev/null"
  $playNames = @()
  foreach ($line in ($mix2 -split "`n")) {
    if ($line -match "^\s*\d+\.\s+(.+?)\s+\S") {
      $n = $Matches[1].Trim()
      if ($n -match "(?i)playback|speaker|hp |headphone|dac|out |volume|master|line") {
        $playNames += $n
      }
    }
  }
  $playNames = $playNames | Select-Object -Unique | Select-Object -First 30
  foreach ($name in $playNames) {
    $safe = $name -replace "'", ""
    Shell "tinymix '$safe' 1 2>/dev/null; tinymix '$safe' 100 2>/dev/null; tinymix '$safe' 80 2>/dev/null" | Out-Null
    Log "  set '$safe' high" "DarkGray"
  }
  if ($hasAplay -and $toneBuilt) {
    Log "  Re-play default after mixer bump — listen…" "Yellow"
    Shell "aplay -d 1 $RemoteTone 2>&1" | Out-Null
  }
}

# --- 7. Summary ---
Log "`n============================================================"
Log " SUMMARY"
Log "============================================================" "Cyan"
if ($captureHits.Count -gt 0) {
  $best = $captureHits | Sort-Object Energy -Descending | Select-Object -First 5
  Log "TOP CAPTURE HITS (highest energy = most likely real mic audio):" "Green"
  foreach ($b in $best) {
    Log "  energy=$($b.Energy) size=$($b.Size) $($b.Tag)"
    Log "    $($b.File)"
  }
  Log "`nAura settings suggestion:" "Green"
  Log "  Microphone source = Car Thing mics (via ADB)"
  $top = $best | Select-Object -First 1
  if ($top.Tag -match "tinycap_D(\d+)_d(\d+)") {
    Log "  Capture tool = tinycap  (card=$($Matches[1]) device=$($Matches[2])) — hardcode if Auto fails"
  } elseif ($top.Tag -match "arecord") {
    Log "  Capture tool = arecord"
  }
  Log "  Play the best WAV and confirm you hear YOUR voice (not just noise)."
} else {
  Log "NO strong capture hits. Either mics muted (mixer), wrong binary, or no capture PCM (DTB)." "Yellow"
  Log "See docs/HARDWARE_PROBE.md and docs/MICROPHONE.md"
}

Log "`nPLAYBACK: if you heard a tone/beep during PLAYBACK SWEEP, speakers work on that tag."
Log "DeskThing itself usually drives the screen UI; system speaker path is separate ALSA."
Log "`nFull log: $Report"
Log "WAVs: $OutDir"
Log "`nDone." "Cyan"

# open folder
try { Start-Process explorer.exe $OutDir } catch { }
