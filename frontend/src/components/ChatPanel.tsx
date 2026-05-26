import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Wrench,
  CheckCircle2,
  MapPin,
  Sparkles,
  Send,
  Check,
  X,
  Zap,
  Wifi,
  WifiOff,
  ListChecks,
} from "lucide-react";
import { useStore } from "@/store";
import { CONCERN_IMPROVEMENT_PROMPT } from "@/api/client";
import type { ChatItem, OperatorRecommendation, PlannerEvent } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function RecommendationBubble({ rec }: { rec: OperatorRecommendation }) {
  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-2.5 text-[11px]">
      <div className="flex items-start gap-2 font-medium text-foreground">
        <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span>{rec.summary}</span>
      </div>
      {rec.key_concerns_considered.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Concerns considered
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {rec.key_concerns_considered.slice(0, 4).map((c, i) => (
              <li key={c.id ?? i} className="leading-snug">
                <span className="text-foreground/90">
                  {c.cohortName ?? "Cohort"} · {c.topic}
                </span>
                {c.summary ? ` — ${c.summary.slice(0, 120)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rec.recommended_actions.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Recommended actions
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-foreground/90">
            {rec.recommended_actions.map((a, i) => (
              <li key={i}>{a.action}</li>
            ))}
          </ol>
        </div>
      )}
      {rec.tradeoffs.length > 0 && (
        <p className="text-muted-foreground">
          <span className="text-[10px] uppercase tracking-wide">Tradeoffs: </span>
          {rec.tradeoffs.slice(0, 2).join(" ")}
        </p>
      )}
      {rec.suggested_next_step && (
        <p className="italic text-muted-foreground">Next: {rec.suggested_next_step}</p>
      )}
    </div>
  );
}

function EventBubble({ e }: { e: PlannerEvent }) {
  if (e.type === "thought")
    return (
      <div className="flex gap-2 text-xs text-foreground/90">
        <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="italic">{e.text}</span>
      </div>
    );
  if (e.type === "tool_call")
    return (
      <div className="flex gap-2 text-xs">
        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" />
        <span className="font-mono">
          <span className="text-yellow-400">{e.name}</span>
          <span className="text-muted-foreground">
            ({Object.keys(e.args).join(", ")})
          </span>
        </span>
      </div>
    );
  if (e.type === "tool_result")
    return (
      <div className="flex gap-2 pl-5 text-[11px] text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span className="break-words font-mono [overflow-wrap:anywhere]">
          {typeof e.result === "string"
            ? e.result
            : JSON.stringify(e.result)}
        </span>
      </div>
    );
  if (e.type === "placement")
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        <span className="capitalize">
          Placed <b>{e.infra.kind}</b> · {e.infra.capacityKw} kW
        </span>
      </div>
    );
  if (e.type === "recommendation")
    return <RecommendationBubble rec={e.recommendation} />;
  return (
    <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-xs">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{e.summary}</span>
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  if (item.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary/90 px-3 py-1.5 text-xs text-primary-foreground">
          {item.text}
        </div>
      </div>
    );
  if (item.role === "system")
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-yellow-400/30 bg-yellow-400/10 px-2 py-1.5 text-[11px] text-yellow-100">
        <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
        {item.text}
      </div>
    );
  return <EventBubble e={item.event} />;
}

const SUGGESTIONS = [
  "Add solar to the highest-burden neighbourhoods",
  "Maximize equity under $5M",
  "Prepare the grid for a heatwave",
];

const CONCERN_SUGGESTION = CONCERN_IMPROVEMENT_PROMPT;

export function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const chatBusy = useStore((s) => s.chatBusy);
  const chatAwaiting = useStore((s) => s.chatAwaiting);
  const chatConnected = useStore((s) => s.chatConnected);
  const datasetSummaries = useStore((s) => s.datasetSummaries);
  const cohortConcerns = useStore((s) => s.cohortConcerns);
  const sendChat = useStore((s) => s.sendChat);
  const clearChat = useStore((s) => s.clearChat);
  const approveStep = useStore((s) => s.approveStep);
  const rejectStep = useStore((s) => s.rejectStep);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [chat.length, chatBusy]);

  const askConcernOperator = () =>
    sendChat(CONCERN_SUGGESTION, { intent: "concern_recommendation" });

  const submit = () => {
    if (!text.trim() || chatBusy) return;
    sendChat(text);
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Brain className="h-4 w-4 text-accent" /> Planning agent
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[9px]">
            {chatConnected ? (
              <>
                <Wifi className="h-2.5 w-2.5" /> live
              </>
            ) : (
              <>
                <WifiOff className="h-2.5 w-2.5" /> local
              </>
            )}
          </Badge>
          {chat.length > 0 && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={clearChat}
            >
              clear
            </button>
          )}
        </div>
      </div>

      {(datasetSummaries.length > 0 || cohortConcerns.length > 0) && (
        <div className="border-b border-border/60 bg-secondary/20 px-3 py-1.5 text-[10px] text-muted-foreground">
          Using {datasetSummaries.length} uploaded dataset
          {datasetSummaries.length === 1 ? "" : "s"}
          {cohortConcerns.length > 0 && (
            <>
              {" "}
              and {cohortConcerns.length} generated concern
              {cohortConcerns.length === 1 ? "" : "s"}
            </>
          )}
          {" "}
          — operator can recommend proposal changes (simulation unchanged).
        </div>
      )}

      {cohortConcerns.length > 0 && (
        <div className="border-b border-border/60 px-3 py-1.5">
          <button
            type="button"
            onClick={askConcernOperator}
            disabled={chatBusy}
            className="w-full rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-left text-[11px] transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            Ask operator to address concerns
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {chat.length === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Ask the planning agent to site infrastructure, or pick <b>AI Auto</b>
              /<b>AI Step</b> in the Build tab. It reasons and places live — and you
              can fire a scenario mid-conversation to watch it react.
            </p>
            <div className="flex flex-col gap-1.5">
              {cohortConcerns.length > 0 && (
                <button
                  onClick={askConcernOperator}
                  className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-accent/60 hover:bg-accent/15"
                >
                  “{CONCERN_SUGGESTION}”
                </button>
              )}
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendChat(s)}
                  className="rounded-lg border border-border bg-secondary/30 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-accent/50 hover:bg-accent/10"
                >
                  “{s}”
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((item) => (
          <Item key={item.id} item={item} />
        ))}
        {chatBusy && !chatAwaiting && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
            </span>
            agent is working…
          </div>
        )}
      </div>

      {chatAwaiting && (
        <div className="flex items-center gap-2 border-t border-border bg-secondary/40 p-2.5">
          <span className="flex-1 text-[11px] text-muted-foreground">
            Approve this action?
          </span>
          <Button size="sm" className="h-7" onClick={approveStep}>
            <Check /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={rejectStep}>
            <X /> Reject
          </Button>
        </div>
      )}

      <div className="border-t border-border p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Tell the agent what to do…"
            className="max-h-24 min-h-[36px] flex-1 resize-none rounded-lg border border-input bg-secondary/40 px-2.5 py-2 text-xs outline-none focus:border-primary/60"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={submit}
            disabled={!text.trim() || chatBusy}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
