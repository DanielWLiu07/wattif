// REST + WS client per docs/PLAN.md. Every call degrades gracefully to mock
// data so the frontend is never blocked on the backend.
import type {
  ActivityItem,
  Agent,
  AgentVoice,
  ConstraintZone,
  ExistingInfra,
  Facility,
  Flow,
  Infra,
  InfraKind,
  PlannerEvent,
  Recommendation,
  Scenario,
  ScenarioType,
  Sentiment,
  SimMetrics,
  Zone,
} from "@/types";
import {
  AGENTS,
  ZONES,
  metricsForTick,
  mockFlows,
  mockOptimize,
  mockPlannerEvents,
  mockScenario,
  mockSentiment,
  mockVoices,
  seedInfra,
} from "@/data/mock";

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8000";

const TIMEOUT_MS = 2500;

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function checkHealth(): Promise<boolean> {
  const r = await tryFetch<{ ok: boolean }>("/api/health");
  return !!r?.ok;
}

export async function getZones(): Promise<{ data: Zone[]; live: boolean }> {
  const r = await tryFetch<Zone[]>("/api/zones");
  return r && r.length ? { data: r, live: true } : { data: ZONES, live: false };
}

export async function getAgents(
  zoneId?: string
): Promise<{ data: Agent[]; live: boolean }> {
  const q = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : "";
  const r = await tryFetch<Agent[]>(`/api/agents${q}`);
  if (r && r.length) return { data: r, live: true };
  const data = zoneId ? AGENTS.filter((a) => a.zoneId === zoneId) : AGENTS;
  return { data, live: false };
}

export async function placeInfra(infra: Infra): Promise<Infra> {
  const r = await tryFetch<Infra>("/api/infra", {
    method: "POST",
    body: JSON.stringify(infra),
  });
  return r ?? infra;
}

export async function deleteInfra(id: string): Promise<boolean> {
  const r = await tryFetch<{ ok: boolean }>(`/api/infra/${id}`, {
    method: "DELETE",
  });
  return r?.ok ?? true;
}

export async function resetSim(
  infra: Infra[]
): Promise<{ data: SimMetrics; live: boolean }> {
  const r = await tryFetch<SimMetrics>("/api/sim/reset", { method: "POST" });
  return r ? { data: r, live: true } : { data: metricsForTick(0, infra), live: false };
}

export async function stepSim(
  tick: number,
  infra: Infra[]
): Promise<{ data: SimMetrics; live: boolean }> {
  const r = await tryFetch<SimMetrics>("/api/sim/step", {
    method: "POST",
    body: JSON.stringify({ ticks: 1 }),
  });
  return r
    ? { data: r, live: true }
    : { data: metricsForTick(tick, infra), live: false };
}

export async function optimize(
  n: number,
  infra: Infra[],
  kind?: Infra["kind"]
): Promise<{ data: Recommendation[]; live: boolean }> {
  const r = await tryFetch<Recommendation[]>("/api/optimize", {
    method: "POST",
    body: JSON.stringify({ n, kind }),
  });
  return r && r.length
    ? { data: r, live: true }
    : { data: mockOptimize(n, infra), live: false };
}

export { seedInfra };

// ---------------- v2: scenarios / sentiment / voices / flows / planner ----------------

export async function applyScenario(
  type: ScenarioType | "random",
  tick: number,
  infra: Infra[],
  intensity = 1,
  zoneId?: string
): Promise<{ data: Scenario; live: boolean }> {
  const r = await tryFetch<Scenario>("/api/scenario", {
    method: "POST",
    body: JSON.stringify({ type, intensity, zoneId }),
  });
  if (r) {
    // surface the targeted zone in the UI even if the backend doesn't echo it
    if (zoneId && !r.effects?.some((e) => e.zoneId === zoneId)) {
      r.effects = [
        ...(r.effects ?? []),
        { target: "grid", zoneId, delta: -0.5, note: "targeted" },
      ];
    }
    return { data: r, live: true };
  }
  const m = mockScenario(type, tick, infra, intensity);
  if (zoneId)
    m.effects = m.effects.map((e, i) => (i === 0 ? { ...e, zoneId } : e));
  return { data: m, live: false };
}

export async function resetSession(): Promise<boolean> {
  const r = await tryFetch<unknown>("/api/session/reset", { method: "POST" });
  return r != null;
}

export async function getSentiment(
  infra: Infra[],
  bias = 0
): Promise<{ data: Sentiment; live: boolean }> {
  const r = await tryFetch<Sentiment>("/api/sentiment");
  return r
    ? { data: r, live: true }
    : { data: mockSentiment(infra, bias), live: false };
}

export async function getVoices(
  n: number,
  infra: Infra[],
  sentiment: Sentiment,
  context?: string
): Promise<{ data: AgentVoice[]; live: boolean }> {
  const q = `?n=${n}${context ? `&context=${encodeURIComponent(context)}` : ""}`;
  const r = await tryFetch<AgentVoice[]>(`/api/agents/voices${q}`);
  return r && r.length
    ? { data: r, live: true }
    : { data: mockVoices(n, infra, sentiment, context), live: false };
}

export async function getFlows(
  infra: Infra[]
): Promise<{ data: Flow[]; live: boolean }> {
  const r = await tryFetch<Flow[]>("/api/flows");
  return r ? { data: r, live: true } : { data: mockFlows(infra), live: false };
}

// ---- v3 real-data layers (degrade to [] / null when endpoints don't exist yet) ----

async function firstOk<T>(paths: string[]): Promise<T | null> {
  for (const p of paths) {
    const r = await tryFetch<T>(p);
    if (r != null) return r;
  }
  return null;
}

// Map a raw facility category/type to our marker kinds (cooling-centre-ish, etc.)
function normalizeFacilityKind(cat?: string, raw?: string): string {
  const s = `${cat ?? ""} ${raw ?? ""}`.toLowerCase();
  if (/(pool|community|library|arena|recreation|senior|cooling)/.test(s))
    return "cooling_centre";
  if (/(shelter|respite|drop-in)/.test(s)) return "shelter";
  if (/(hospital|health|clinic)/.test(s)) return "hospital";
  return "community";
}

// Wrapped responses carry `available:bool` — respect it (don't render stale/empty).
function gated<T>(r: any, key: string): T[] {
  if (!r) return [];
  if (Array.isArray(r)) return r as T[];
  if (r.available === false) return [];
  return (r[key] ?? []) as T[];
}

export async function getFacilities(): Promise<Facility[]> {
  const r = await firstOk<any>(["/api/facilities"]);
  const list = gated<any>(r, "facilities");
  return list
    .filter((f) => Array.isArray(f.position))
    .map((f, i) => ({
      id: f.id ?? `fc${i}`,
      kind: f.kind ?? normalizeFacilityKind(f.category, f.rawType),
      name: f.name ?? f.rawType ?? "Facility",
      position: f.position,
    }));
}

export async function getExistingInfra(): Promise<ExistingInfra[]> {
  const r = await firstOk<any>(["/api/existing_infra", "/api/existing-infra"]);
  const list = r?.available === false ? [] : gated<any>(r, "infra");
  return list
    .filter((d) => Array.isArray(d.position))
    .map((d, i) => ({
      id: d.id ?? `ei${i}`,
      kind: d.kind ?? d.subtype ?? "existing",
      name: d.name,
      position: d.position,
      capacityKw: d.capacityKw,
    }));
}

// Per-zone constraints: [{ zoneId, sitingPenalty, noBuild }]
export async function getConstraints(): Promise<ConstraintZone[]> {
  const r = await firstOk<any>(["/api/constraints"]);
  const list = gated<any>(r, "zones");
  return list
    .filter((c) => c.zoneId)
    .map((c) => ({
      zoneId: c.zoneId,
      sitingPenalty: c.sitingPenalty ?? 0,
      noBuild: !!c.noBuild,
    }));
}

export type ZoneEnviro = { greenScore?: number; pollutionBurden?: number };
export async function getEnvironment(): Promise<Record<string, ZoneEnviro>> {
  const r = await firstOk<any>(["/api/environment"]);
  if (!r || r.available === false) return {};
  const out: Record<string, ZoneEnviro> = {};
  if (Array.isArray(r.zones)) {
    for (const z of r.zones)
      out[z.zoneId] = { greenScore: z.greenScore, pollutionBurden: z.pollutionBurden };
    return out;
  }
  return (r.environment ?? r) as Record<string, ZoneEnviro>;
}

export async function getActivity(): Promise<ActivityItem[]> {
  const r = await firstOk<any>(["/api/activity"]);
  if (!r || r.available === false) return [];
  return Array.isArray(r) ? r : r.activity ?? [];
}

// Per-zone risk layers from data-2 (flood risk, heat vulnerability). Both follow
// the established { available, zones:[{ zoneId, <value> }] } pattern; degrade to
// {} until the endpoints exist so they light up automatically when they land.
function perZoneNumber(r: any, key: string): Record<string, number> {
  if (!r || r.available === false) return {};
  const list: any[] = Array.isArray(r) ? r : r.zones ?? [];
  const out: Record<string, number> = {};
  for (const z of list) if (z.zoneId != null && z[key] != null) out[z.zoneId] = z[key];
  return out;
}
export async function getFloodRisk(): Promise<Record<string, number>> {
  // GET /api/flood → { available, zones:[{ zoneId, floodRiskScore 0..1, floodRisk }] }
  const r = await firstOk<any>(["/api/flood", "/api/flood-risk"]);
  return perZoneNumber(r, "floodRiskScore");
}
export async function getHeatVulnerability(): Promise<Record<string, number>> {
  // GET /api/heat-vulnerability → { available, zones:[{ zoneId, hvi 0..1, level }] }
  const r = await firstOk<any>(["/api/heat-vulnerability"]);
  return perZoneNumber(r, "hvi");
}

export type DistrictEnergyZone = { servedFraction: number; systemName: string };
export async function getDistrictEnergy(): Promise<
  Record<string, DistrictEnergyZone>
> {
  const r = await firstOk<any>(["/api/district-energy"]);
  if (!r || r.available === false) return {};
  const list: any[] = Array.isArray(r) ? r : r.zones ?? [];
  const out: Record<string, DistrictEnergyZone> = {};
  for (const z of list)
    if (z.zoneId)
      out[z.zoneId] = {
        servedFraction: z.servedFraction ?? 0,
        systemName: z.systemName ?? "District energy",
      };
  return out;
}

export type Sbei = {
  communityWideMtCO2e?: number;
  sectorSharePct?: Record<string, number>;
  baselineYear?: number;
  note?: string;
  source?: string;
};
export async function getSbei(): Promise<Sbei | null> {
  const r = await firstOk<any>(["/api/sbei"]);
  if (!r || r.available === false) return null;
  return r as Sbei;
}

export type GenerationMix = {
  mix: Record<string, number>;
  marginalGco2PerKwh: number | null;
};
export async function getGenerationMix(): Promise<GenerationMix | null> {
  const r = await firstOk<any>(["/api/generation-mix"]);
  if (!r || r.available === false) return null;
  return { mix: r.mix ?? {}, marginalGco2PerKwh: r.marginalGco2PerKwh ?? null };
}

/**
 * Run the agentic planner. Tries WS /ws/planner; if unreachable, drives the
 * deterministic mock "planner-lite" generator at a realistic cadence so the UI
 * animates either way. Returns a disposer.
 *
 * In "step" mode, the returned `approve`/`reject` controls advance the agent.
 */
export type PlannerHandle = {
  approve: () => void;
  reject: () => void;
  stop: () => void;
};

export function runPlanner(opts: {
  mode: "auto" | "step";
  n?: number;
  budgetCad?: number;
  infra: Infra[];
  onEvent: (e: PlannerEvent) => void;
  onLive?: (live: boolean) => void;
}): PlannerHandle {
  const { mode, n = 5, budgetCad = 8_000_000, infra, onEvent, onLive } = opts;

  // Try the live WS planner first.
  let ws: WebSocket | null = null;
  let usedLive = false;
  try {
    const url = API_URL.replace(/^http/, "ws") + "/ws/planner";
    ws = new WebSocket(url);
    const openTimer = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        ws.close();
      }
    }, TIMEOUT_MS);
    ws.onopen = () => {
      clearTimeout(openTimer);
      usedLive = true;
      onLive?.(true);
      ws?.send(JSON.stringify({ mode, goal: "maximize coverage + equity", budgetCad }));
    };
    ws.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as PlannerEvent);
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      /* fall back below */
    };
  } catch {
    ws = null;
  }

  // Mock driver (used unless the live WS took over).
  const gen = mockPlannerEvents(n, infra, budgetCad);
  let waiting = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const advance = () => {
    if (stopped || usedLive) return;
    const { value, done } = gen.next();
    if (done || !value) return;
    onEvent(value);
    // In step mode, pause after each tool_call until approved.
    if (mode === "step" && value.type === "tool_call") {
      waiting = true;
      return;
    }
    timer = setTimeout(advance, delayFor(value));
  };

  const delayFor = (e: PlannerEvent) =>
    e.type === "thought" ? 850 : e.type === "placement" ? 500 : 450;

  // Kick the mock after giving the WS a moment to connect.
  const bootTimer = setTimeout(() => {
    if (!usedLive) {
      onLive?.(false);
      advance();
    }
  }, 600);

  return {
    approve: () => {
      if (usedLive) {
        ws?.send(JSON.stringify({ action: "approve" }));
        return;
      }
      if (waiting) {
        waiting = false;
        advance();
      }
    },
    reject: () => {
      if (usedLive) {
        ws?.send(JSON.stringify({ action: "reject" }));
        return;
      }
      // skip the pending placement: consume the matching tool_result + placement
      if (waiting) {
        waiting = false;
        // drop next placement-related events until next thought/done
        let next = gen.next();
        while (
          !next.done &&
          next.value &&
          (next.value.type === "tool_result" || next.value.type === "placement")
        ) {
          next = gen.next();
        }
        if (next.value) onEvent(next.value);
        timer = setTimeout(advance, 400);
      }
    },
    stop: () => {
      stopped = true;
      clearTimeout(bootTimer);
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}

/**
 * Persistent, multi-turn planner/chat session over WS /ws/planner.
 * The user can send instructions, approve/reject (step mode), and fire scenarios
 * mid-conversation (handled by the store via REST) — the agent streams events
 * back in real time. Falls back to the deterministic mock generator per message
 * when the WS can't be reached, so chat works fully offline.
 */
export type PlannerSession = {
  send: (text: string, opts?: { mode?: "auto" | "step"; budgetCad?: number }) => void;
  approve: () => void;
  reject: () => void;
  // Notify the agent that a scenario fired DURING the chat so it reacts in-character.
  fireScenario: (scenarioType: string, zoneId?: string, intensity?: number) => void;
  isLive: () => boolean;
  close: () => void;
};

export function createPlannerSession(opts: {
  infraProvider: () => Infra[];
  facilitiesProvider?: () => { kind: string; position: [number, number]; name?: string }[];
  onEvent: (e: PlannerEvent) => void;
  onStatus?: (open: boolean) => void;
  onBusy?: (busy: boolean) => void;
}): PlannerSession {
  const { infraProvider, facilitiesProvider, onEvent, onStatus, onBusy } = opts;
  let ws: WebSocket | null = null;
  let live = false;
  let closed = false;

  try {
    const url = API_URL.replace(/^http/, "ws") + "/ws/planner";
    ws = new WebSocket(url);
    ws.onopen = () => {
      live = true;
      onStatus?.(true);
    };
    ws.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data) as PlannerEvent;
        onEvent(e);
        if (e.type === "done") onBusy?.(false);
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      live = false;
      onStatus?.(false);
    };
    ws.onclose = () => {
      live = false;
      if (!closed) onStatus?.(false);
    };
  } catch {
    ws = null;
  }

  // ---- mock driver (per message) ----
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gen: Generator<PlannerEvent> | null = null;
  let waiting = false;
  let stepMode = false;

  const delayFor = (e: PlannerEvent) =>
    e.type === "thought" ? 800 : e.type === "placement" ? 480 : 420;

  const advance = () => {
    if (!gen) return;
    const { value, done } = gen.next();
    if (done || !value) {
      onBusy?.(false);
      gen = null;
      return;
    }
    onEvent(value);
    if (stepMode && value.type === "tool_call") {
      waiting = true;
      return;
    }
    timer = setTimeout(advance, delayFor(value));
  };

  const parseGoal = (text: string) => {
    const t = text.toLowerCase();
    let n = 5;
    const m = t.match(/(\d+)\s*(sites?|installations?|units?|solar|wind|batter|microgrid)/);
    if (m) n = Math.min(8, Math.max(1, parseInt(m[1], 10)));
    return { n };
  };

  return {
    send: (text, sopts) => {
      stepMode = sopts?.mode === "step";
      onBusy?.(true);
      if (live && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "user_message",
            text,
            mode: sopts?.mode ?? "auto",
            budgetCad: sopts?.budgetCad ?? 8_000_000,
          })
        );
        return;
      }
      // mock: stream a fresh plan for this instruction (honors kind + facility target)
      if (timer) clearTimeout(timer);
      const { n } = parseGoal(text);
      gen = mockPlannerEvents(n, infraProvider(), sopts?.budgetCad ?? 8_000_000, {
        text,
        facilities: facilitiesProvider?.(),
      });
      advance();
    },
    approve: () => {
      if (live && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "approve" }));
        return;
      }
      if (waiting) {
        waiting = false;
        advance();
      }
    },
    reject: () => {
      if (live && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "reject" }));
        return;
      }
      if (waiting && gen) {
        waiting = false;
        let next = gen.next();
        while (
          !next.done &&
          next.value &&
          (next.value.type === "tool_result" || next.value.type === "placement")
        ) {
          next = gen.next();
        }
        if (next.value) onEvent(next.value);
        timer = setTimeout(advance, 360);
      }
    },
    fireScenario: (scenarioType, zoneId, intensity) => {
      if (live && ws?.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({ action: "scenario", scenarioType, zoneId, intensity })
        );
        onBusy?.(true); // agent will stream a reaction
      }
    },
    isLive: () => live,
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}

// Staggered sim-WS frames (tick_start -> placements -> voices -> tick_complete).
export type SimMessage =
  | { type: "tick_start"; tick: number; hour?: number }
  | { type: "placements"; infra: Infra[] }
  | { type: "voices"; voices: AgentVoice[] }
  | {
      type: "tick_complete";
      metrics: SimMetrics;
      zoneDeltas?: Record<string, { approval?: number; outage?: boolean }>;
      flows?: Flow[];
      activity?: ActivityItem[];
    }
  | { type: "metrics"; metrics: SimMetrics }; // legacy single-frame

export type WsStatus = "open" | "closed" | "reconnecting";

/**
 * Open the sim WebSocket with automatic reconnect + backoff. Reports status
 * (open / reconnecting / closed) so the UI can show a "reconnecting…" state and
 * recover cleanly. If it can never connect, the app stays on local stepping.
 */
export function openSimSocket(
  onMessage: (m: SimMessage) => void,
  onStatus: (status: WsStatus) => void
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let everConnected = false;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const url = API_URL.replace(/^http/, "ws") + "/ws/sim";

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      everConnected = true;
      attempts = 0;
      onStatus("open");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg && typeof msg.type === "string") {
          onMessage(msg as SimMessage);
        } else if (msg && typeof msg.tick === "number") {
          onMessage({ type: "metrics", metrics: msg as SimMetrics });
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onerror = () => {
      /* close handler drives reconnect */
    };
    ws.onclose = () => {
      if (closed) return;
      // Only show "reconnecting" if we'd previously connected (a real drop);
      // otherwise the backend simply isn't up → stay on mock silently.
      if (everConnected && attempts < 6) {
        onStatus("reconnecting");
        scheduleReconnect();
      } else {
        onStatus("closed");
      }
    };
  };

  const scheduleReconnect = () => {
    if (closed) return;
    attempts++;
    const delay = Math.min(1000 * 2 ** attempts, 15000); // 2s,4s,8s…cap 15s
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}

export type { InfraKind };
