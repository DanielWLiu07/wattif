import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChatCircle as MessageSquare,
  Brain,
  Stack as Boxes,
  ChartBar as BarChart3,
  Newspaper,
} from "@phosphor-icons/react";
import { useStore } from "@/store";
import { Hud } from "@/components/Hud";
import { VoicesFeed } from "@/components/VoicesFeed";
import { ChatPanel } from "@/components/ChatPanel";
import { ActivityLog } from "@/components/ActivityLog";
import { InfrastructureInspector } from "@/components/InfrastructureInspector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useCountUp } from "@/lib/useCountUp";

// Tiny delta chip that briefly highlights the change after a step.
function Delta({ d, unit = "%" }: { d: number; unit?: string }) {
  if (Math.abs(d) < 0.01) return null;
  const up = d > 0;
  return (
    <span
      className={`ml-1 text-[9px] font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(d).toFixed(1)}
      {unit}
    </span>
  );
}

// Always-pinned thin status strip — core numbers visible regardless of tab.
function MiniStats() {
  const metrics = useStore((s) => s.metrics);
  const history = useStore((s) => s.history);
  const cov = useCountUp((metrics?.coveragePct ?? 0) * 100);
  const app = useCountUp((metrics?.approvalPct ?? 0) * 100);
  if (!metrics) return null;
  const prevM = history.length >= 2 ? history[history.length - 2] : undefined;
  const covD = prevM ? (metrics.coveragePct - prevM.coveragePct) * 100 : 0;
  const appD = prevM
    ? ((metrics.approvalPct ?? 0) - (prevM.approvalPct ?? 0)) * 100
    : 0;
  const cells = [
    {
      label: "Coverage",
      value: `${cov.toFixed(0)}%`,
      tint: "text-primary",
      delta: covD,
    },
    {
      label: "Approval",
      value: `${app.toFixed(0)}%`,
      tint: "text-data-info",
      delta: appD,
    },
    {
      label: "Tick",
      value: `${metrics.tick} · ${metrics.year}`,
      tint: "text-foreground",
      delta: 0,
    },
  ];
  return (
    <div className="flex items-stretch divide-x divide-border/60 rounded-lg border border-border/60 bg-secondary/30">
      {cells.map((c) => (
        <div key={c.label} className="flex-1 px-2.5 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {c.label}
          </div>
          <div className={`text-sm font-semibold num ${c.tint}`}>
            {c.value}
            <Delta d={c.delta} />
          </div>
        </div>
      ))}
    </div>
  );
}

function UnreadDot({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function RightDock() {
  const chatLen = useStore((s) => s.chat.length);
  const voicesLen = useStore((s) => s.voices.length);
  const activityLen = useStore((s) => s.activity.length);
  const focusVoiceNonce = useStore((s) => s.focusVoiceNonce);
  const loaded = useStore((s) => s.loaded);
  const [tab, setTab] = useState("chat"); // chat is the headline surface
  const [unread, setUnread] = useState({ chat: 0, voices: 0, activity: 0 });
  const prev = useRef({ chat: chatLen, voices: voicesLen, activity: activityLen });
  const started = useRef(false);

  // Clicking a 3D speech bubble pulls the Voices log into focus.
  useEffect(() => {
    if (focusVoiceNonce <= 0) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab("voices");
    setUnread((u) => ({ ...u, voices: 0 }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [focusVoiceNonce]);

  // Accrue unread on NON-active tabs — never auto-switch the user's tab.
  // (Guarded so the initial data load doesn't count as "unread".)
  const accrue = useCallback(
    (key: "chat" | "voices" | "activity", len: number) => {
      if (!started.current) {
        prev.current[key] = len;
        return;
      }
      const d = len - prev.current[key];
      prev.current[key] = len;
      if (d > 0 && tab !== key) setUnread((u) => ({ ...u, [key]: u[key] + d }));
    },
    [tab]
  );
  useEffect(() => accrue("chat", chatLen), [chatLen, accrue]);
  useEffect(() => accrue("voices", voicesLen), [voicesLen, accrue]);
  useEffect(() => accrue("activity", activityLen), [activityLen, accrue]);
  useEffect(() => {
    if (loaded && !started.current) {
      prev.current = { chat: chatLen, voices: voicesLen, activity: activityLen };
      started.current = true;
    }
  }, [loaded, chatLen, voicesLen, activityLen]);

  const onTab = (t: string) => {
    setTab(t);
    if (t === "chat" || t === "voices" || t === "activity")
      setUnread((u) => ({ ...u, [t]: 0 }));
  };

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col gap-2 overflow-hidden p-3">
      <div className="shrink-0">
        <MiniStats />
      </div>

      <Card className="glass flex min-h-0 flex-1 flex-col overflow-hidden">
        <Tabs value={tab} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="m-1.5 grid h-auto shrink-0 grid-cols-5 gap-0.5">
            <TabsTrigger value="chat" className="flex-col gap-0.5 px-0.5 py-1 text-[9px]">
              <span className="relative">
                <Brain className="h-3.5 w-3.5" />
                <span className="absolute -right-2 -top-1">
                  <UnreadDot n={unread.chat} />
                </span>
              </span>
              Chat
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-col gap-0.5 px-0.5 py-1 text-[9px]">
              <span className="relative">
                <Newspaper className="h-3.5 w-3.5" />
                <span className="absolute -right-2 -top-1">
                  <UnreadDot n={unread.activity} />
                </span>
              </span>
              Activity
            </TabsTrigger>
            <TabsTrigger value="voices" className="flex-col gap-0.5 px-0.5 py-1 text-[9px]">
              <span className="relative">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="absolute -right-2 -top-1">
                  <UnreadDot n={unread.voices} />
                </span>
              </span>
              Voices
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex-col gap-0.5 px-0.5 py-1 text-[9px]">
              <BarChart3 className="h-3.5 w-3.5" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex-col gap-0.5 px-0.5 py-1 text-[9px]">
              <Boxes className="h-3.5 w-3.5" />
              Assets
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ChatPanel />
          </TabsContent>
          <TabsContent value="activity" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ActivityLog />
          </TabsContent>
          <TabsContent value="voices" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <VoicesFeed />
          </TabsContent>
          <TabsContent value="stats" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <Hud />
          </TabsContent>
          <TabsContent value="assets" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <InfrastructureInspector />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
