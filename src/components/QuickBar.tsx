import React, { useState } from "react";

const QUICK = [
  { label: "All off", kind: "control" as const, tool: "set_power", args: { target: "all", on: false } },
  { label: "All on", kind: "control" as const, tool: "set_power", args: { target: "all", on: true } },
  { label: "Warm", kind: "control" as const, tool: "set_white", args: { target: "all", warmth: "warm" } },
  { label: "Brighter", kind: "chat" as const, text: "make all the lights brighter" },
  { label: "Dimmer", kind: "chat" as const, text: "dim all the lights a bit" },
];

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
);

interface Props {
  onChat: (text: string) => void;
  onControl: (tool: string, args: Record<string, unknown>) => void;
  disabled?: boolean;
}

const QuickBar: React.FC<Props> = ({ onChat, onControl, disabled }) => {
  const [text, setText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onChat(t);
    setText("");
  };

  return (
    <div className="shrink-0 flex flex-col gap-2 pt-1">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {QUICK.map((q) => (
          <button
            key={q.label}
            disabled={disabled}
            onClick={() =>
              q.kind === "control" ? onControl(q.tool, q.args) : onChat(q.text)
            }
            className="text-[13px] whitespace-nowrap px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 active:scale-95 transition disabled:opacity-40"
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-3 py-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type a command or question…"
          className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-white/30"
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="text-blue-400 disabled:text-white/20 active:scale-90 transition"
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
};

export default QuickBar;
