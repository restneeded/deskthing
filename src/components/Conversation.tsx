import React, { useEffect, useRef } from "react";
import type { AuraStatus, Message } from "../types";

interface Props {
  messages: Message[];
  status: AuraStatus;
}

const THINKING_STATES = new Set(["thinking", "acting", "transcribing", "listening"]);

const Conversation: React.FC<Props> = ({ messages, status }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status.state]);

  const thinking = THINKING_STATES.has(status.state);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2.5 pr-1">
      {messages.length === 0 && !thinking && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 text-white/35">
          <p className="text-lg text-white/60">Hey, I'm Aura.</p>
          <p className="text-sm max-w-[320px]">
            Hold the mic and say something like{" "}
            <span className="text-white/75">“turn the living room purple”</span> — or ask me
            anything.
          </p>
        </div>
      )}

      {messages.map((m) =>
        m.role === "user" ? (
          <div key={m.id} className="self-end max-w-[80%]">
            <div className="rounded-2xl rounded-br-sm bg-blue-600/80 px-3.5 py-2 text-[15px] leading-snug">
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.id} className="self-start max-w-[85%]">
            <div className="rounded-2xl rounded-bl-sm bg-white/8 border border-white/10 px-3.5 py-2 text-[15px] leading-snug text-white/90">
              {m.text}
            </div>
            {m.actions && m.actions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {m.actions.map((a, i) => (
                  <span
                    key={i}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      a.ok
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : "bg-red-500/10 border-red-500/30 text-red-300"
                    }`}
                  >
                    {a.ok ? "✓" : "✕"} {a.target} {a.ok ? a.action : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ),
      )}

      {thinking && (
        <div className="self-start">
          <div className="rounded-2xl rounded-bl-sm bg-white/8 border border-white/10 px-3.5 py-2">
            <span className="aura-shimmer text-[15px] font-medium">
              {status.state === "listening"
                ? "listening"
                : status.state === "transcribing"
                  ? "hearing you"
                  : status.state === "acting"
                    ? "adjusting lights"
                    : "thinking"}
              …
            </span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
};

export default Conversation;
