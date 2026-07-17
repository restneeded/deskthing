import React, { useCallback, useEffect, useRef, useState } from "react";
import { onAura, send } from "./deskthing";
import type {
  AuraConfigFlags,
  AuraReply,
  AuraStatus,
  LightDevice,
  Message,
} from "./types";

import StatusBar from "./components/StatusBar";
import Conversation from "./components/Conversation";
import PushToTalk from "./components/PushToTalk";
import SceneBar from "./components/SceneBar";
import DeviceStrip from "./components/DeviceStrip";
import QuickBar from "./components/QuickBar";
import SetupCard from "./components/SetupCard";

const MAX_MESSAGES = 30;

const App: React.FC = () => {
  const [config, setConfig] = useState<AuraConfigFlags | null>(null);
  const [devices, setDevices] = useState<LightDevice[]>([]);
  const [status, setStatus] = useState<AuraStatus>({ state: "idle" });
  const [messages, setMessages] = useState<Message[]>([]);
  const idRef = useRef(0);

  const pushMessage = useCallback((m: Omit<Message, "id">) => {
    setMessages((prev) => {
      const next = [...prev, { ...m, id: `m${idRef.current++}` }];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
  }, []);

  useEffect(() => {
    const off = onAura((request, payload) => {
      switch (request) {
        case "config":
          setConfig(payload as AuraConfigFlags);
          break;
        case "devices":
          setDevices((payload?.devices ?? []) as LightDevice[]);
          break;
        case "status":
          setStatus(payload as AuraStatus);
          break;
        case "transcript":
          if (payload?.text) pushMessage({ role: "user", text: payload.text });
          break;
        case "reply": {
          const r = payload as AuraReply;
          pushMessage({ role: "aura", text: r.text, actions: r.actions });
          break;
        }
      }
    });
    send("get_state");
    return off;
  }, [pushMessage]);

  const controlsDisabled = !config?.hasGovee;

  const onChat = useCallback(
    (text: string) => {
      pushMessage({ role: "user", text });
      send("chat", { text });
    },
    [pushMessage],
  );

  const onControl = useCallback((tool: string, args: Record<string, unknown>) => {
    send("control", { tool, args });
  }, []);

  const onScene = useCallback((sceneId: string) => {
    send("scene", { sceneId });
  }, []);

  const onPower = useCallback((name: string, on: boolean) => {
    send("control", { tool: "set_power", args: { target: name, on } });
  }, []);

  const hasLlm = !!(config?.hasLlm || config?.hasGrok);
  const needsSetup = config && (!hasLlm || !config.hasGovee);

  return (
    <div className="relative h-screen w-screen flex flex-col bg-[#06070c] text-white overflow-hidden">
      <StatusBar status={status} config={config} onRefresh={() => send("refresh_devices")} />

      <div className="flex-1 flex min-h-0">
        {/* Left: conversation + devices + input */}
        <div className="flex-1 flex flex-col min-h-0 p-3 gap-2">
          <Conversation messages={messages} status={status} />
          <DeviceStrip devices={devices} onPower={onPower} />
          <QuickBar onChat={onChat} onControl={onControl} />
        </div>

        {/* Right: mic / wake + scenes */}
        <aside className="w-[300px] shrink-0 flex flex-col gap-3 p-3 border-l border-white/10">
          <PushToTalk
            voiceEnabled={!!config?.voiceEnabled}
            voiceMode={config?.voiceMode}
            listening={status.state === "listening"}
            statusDetail={status.detail}
            disabled={status.state === "thinking" || status.state === "acting" || status.state === "transcribing"}
            onStart={() => send("ptt_start")}
            onStop={() => send("ptt_stop")}
          />
          <SceneBar onScene={onScene} disabled={controlsDisabled} />
        </aside>
      </div>

      {needsSetup && <SetupCard config={config!} />}
    </div>
  );
};

export default App;
