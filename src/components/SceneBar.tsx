import React from "react";
import { SCENES } from "../types";

interface Props {
  onScene: (id: string) => void;
  disabled?: boolean;
}

const SceneBar: React.FC<Props> = ({ onScene, disabled }) => (
  <div className="flex-1 min-h-0">
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      {SCENES.map((s) => (
        <button
          key={s.id}
          disabled={disabled}
          onClick={() => onScene(s.id)}
          className="flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2.5 active:scale-95 transition disabled:opacity-40"
        >
          <span className="text-xl">{s.emoji}</span>
          <span className="text-sm font-medium text-white/85">{s.label}</span>
        </button>
      ))}
    </div>
  </div>
);

export default SceneBar;
