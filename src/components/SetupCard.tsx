import React from "react";
import type { AuraConfigFlags } from "../types";

interface Props {
  config: AuraConfigFlags;
}

/** Shown when required keys are missing — points the user at DeskThing settings. */
const SetupCard: React.FC<Props> = ({ config }) => {
  const need: string[] = [];
  if (!config.hasGrok) need.push("xAI (Grok) API key");
  if (!config.hasGovee) need.push("Govee API key");

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="max-w-[440px] w-full rounded-2xl bg-[#11141f] border border-white/10 p-6 text-center">
        <div className="text-4xl mb-2">✨</div>
        <h2 className="text-xl font-bold mb-1">Almost there</h2>
        <p className="text-sm text-white/60 mb-4">
          Open this app's <span className="text-white/80">settings</span> in the DeskThing
          desktop app and add:
        </p>
        <ul className="text-left text-sm space-y-1.5 mb-4">
          {need.map((n) => (
            <li key={n} className="flex items-center gap-2">
              <span className="text-amber-400">•</span> {n}
            </li>
          ))}
        </ul>
        <p className="text-xs text-white/40">
          Grok is the brain, Govee controls the lights. See the README for where to get each
          key.
        </p>
      </div>
    </div>
  );
};

export default SetupCard;
