import React, { useRef } from "react";

const MicIcon = ({ size = 46 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <line x1="8" y1="21" x2="16" y2="21" />
  </svg>
);

interface Props {
  voiceEnabled: boolean;
  voiceMode?: string;
  listening: boolean;
  statusDetail?: string;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

const PushToTalk: React.FC<Props> = ({
  voiceEnabled,
  voiceMode = "off",
  listening,
  statusDetail,
  disabled,
  onStart,
  onStop,
}) => {
  const held = useRef(false);

  if (!voiceEnabled || voiceMode === "off") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 py-5 px-4 text-center">
        <div className="text-white/30">
          <MicIcon size={34} />
        </div>
        <p className="text-xs text-white/50 leading-snug">
          Voice off. Type below, or set <span className="text-white/70">Voice mode</span> in
          DeskThing settings (push-to-talk or wake word).
        </p>
      </div>
    );
  }

  // Wake mode — always listening; button is status only (optional manual PTT still works)
  if (voiceMode === "wake") {
    return (
      <div className="flex flex-col items-center gap-2 py-1 select-none">
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 128,
            height: 128,
            background: listening
              ? "radial-gradient(circle at 50% 40%, #4aa8ff, #1b5bd6)"
              : "radial-gradient(circle at 50% 40%, #1a3d2a, #0d1a14)",
            boxShadow: listening
              ? "0 0 40px rgba(74,168,255,0.6)"
              : "0 0 28px rgba(52,211,153,0.25)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {listening && (
            <span
              className="aura-pulse absolute inset-0 rounded-full"
              style={{ border: "3px solid #4aa8ff" }}
            />
          )}
          <span className={listening ? "text-white" : "text-emerald-300/90"}>
            <MicIcon />
          </span>
        </div>
        <span className="text-xs text-white/60 text-center px-2 leading-snug">
          {listening
            ? statusDetail || "Listening…"
            : statusDetail || 'Wake word on — say "hey aura"'}
        </span>
        <button
          type="button"
          disabled={disabled}
          onPointerDown={() => {
            if (disabled) return;
            held.current = true;
            onStart();
          }}
          onPointerUp={() => {
            if (!held.current) return;
            held.current = false;
            onStop();
          }}
          onPointerLeave={() => {
            if (!held.current) return;
            held.current = false;
            onStop();
          }}
          className="text-[10px] text-white/40 underline underline-offset-2"
        >
          or hold for push-to-talk
        </button>
      </div>
    );
  }

  // Push-to-talk
  const begin = () => {
    if (disabled || held.current) return;
    held.current = true;
    onStart();
  };
  const end = () => {
    if (!held.current) return;
    held.current = false;
    onStop();
  };

  return (
    <div className="flex flex-col items-center gap-2 py-1 select-none">
      <button
        onPointerDown={begin}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        disabled={disabled}
        className="relative flex items-center justify-center rounded-full transition active:scale-95"
        style={{
          width: 128,
          height: 128,
          background: listening
            ? "radial-gradient(circle at 50% 40%, #4aa8ff, #1b5bd6)"
            : "radial-gradient(circle at 50% 40%, #2a3350, #171c30)",
          boxShadow: listening
            ? "0 0 40px rgba(74,168,255,0.6)"
            : "0 6px 20px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {listening && (
          <span
            className="aura-pulse absolute inset-0 rounded-full"
            style={{ border: "3px solid #4aa8ff" }}
          />
        )}
        <span className={listening ? "text-white" : "text-white/80"}>
          <MicIcon />
        </span>
      </button>
      <span className="text-xs text-white/50">
        {listening ? "Release to send" : "Hold to talk"}
      </span>
    </div>
  );
};

export default PushToTalk;
