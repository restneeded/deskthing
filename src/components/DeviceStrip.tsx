import React from "react";
import type { LightDevice } from "../types";

interface Props {
  devices: LightDevice[];
  onPower: (name: string, on: boolean) => void;
}

const DeviceStrip: React.FC<Props> = ({ devices, onPower }) => {
  if (!devices.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 shrink-0">
      {devices.map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 pl-3 pr-1.5 py-1.5 shrink-0"
        >
          <span className="text-sm text-white/80 whitespace-nowrap max-w-[120px] truncate">
            {d.name}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPower(d.name, true)}
              className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 active:scale-90 transition"
            >
              On
            </button>
            <button
              onClick={() => onPower(d.name, false)}
              className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/60 hover:bg-white/20 active:scale-90 transition"
            >
              Off
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DeviceStrip;
