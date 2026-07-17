import React from "react";
import type { AuraConfigFlags, AuraStatus } from "../types";

const STATE_META: Record<string, { label: string; color: string }> = {
  idle: { label: "Ready", color: "#3ddc84" },
  listening: { label: "Listening…", color: "#4aa8ff" },
  transcribing: { label: "Hearing…", color: "#8b5cf6" },
  thinking: { label: "Thinking…", color: "#f5c518" },
  acting: { label: "On it…", color: "#f59e0b" },
  error: { label: "Error", color: "#ff5470" },
};

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

interface Props {
  status: AuraStatus;
  config: AuraConfigFlags | null;
  onRefresh: () => void;
}

const StatusBar: React.FC<Props> = ({ status, config, onRefresh }) => {
  const meta = STATE_META[status.state] ?? STATE_META.idle;
  return (
    <header className="flex items-center justify-between px-4 h-12 border-b border-white/10 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight">Aura</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 max-w-[160px] truncate">
          {config?.provider === "openrouter"
            ? "OpenRouter"
            : config?.provider === "xai"
              ? "xAI"
              : config?.provider || "LLM"}
          {" · Govee"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
          />
          <span className="text-sm text-white/80">{status.detail || meta.label}</span>
        </div>
        <span className="text-xs text-white/40">
          {config?.deviceCount ?? 0} 💡
        </span>
        <button
          onClick={onRefresh}
          className="text-white/50 hover:text-white/90 p-1 rounded active:scale-90 transition"
          aria-label="Refresh lights"
        >
          <RefreshIcon />
        </button>
      </div>
    </header>
  );
};

export default StatusBar;
