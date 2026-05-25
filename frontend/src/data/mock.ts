// Realistic MOCK data matching the contract (docs/PLAN.md).
// Lets the whole UI work before the backend is live. Swapped out by the API
// client the moment the real backend responds.
import type {
  Agent,
  AgentVoice,
  Flow,
  Infra,
  InfraKind,
  LngLat,
  PlannerEvent,
  Recommendation,
  Scenario,
  ScenarioEffect,
  ScenarioType,
  Sentiment,
  SimMetrics,
  Zone,
} from "@/types";
import { INFRA_PRESETS, MODEL_URL } from "@/types";
import zonesFixture from "./zonesFixture.json";

// Small seeded PRNG so mock data is stable across reloads.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260524);

// Real Toronto neighbourhood boundaries snapshot (from data/processed/zones.json,
// coords rounded). Using real non-overlapping polygons means the OFFLINE/mock
// view looks exactly like live — no overlapping placeholder rectangles.
export const ZONES: Zone[] = zonesFixture as unknown as Zone[];

const ARCHETYPES = [
  "renter-lowincome",
  "owner-suburban",
  "small-business",
  "condo-dweller",
  "owner-midincome",
];

export const AGENTS: Agent[] = ZONES.flatMap((z) => {
  const n = Math.max(40, Math.round(z.demographics.population / 400));
  return Array.from({ length: n }, (_, k) => {
    const [clng, clat] = z.centroid;
    const spread = 0.011;
    const incomeRoll = rng();
    const bracket: Agent["incomeBracket"] =
      z.demographics.energyBurdenIndex > 0.6
        ? incomeRoll < 0.7
          ? "low"
          : "mid"
        : incomeRoll < 0.4
        ? "mid"
        : incomeRoll < 0.85
        ? "high"
        : "low";
    const hasRooftop = rng() > z.demographics.renterPct;
    return {
      id: `${z.id}-a${k}`,
      zoneId: z.id,
      position: [
        clng + (rng() - 0.5) * spread,
        clat + (rng() - 0.5) * spread,
      ] as LngLat,
      archetype: ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)],
      demandKwh: Math.round(220 + rng() * 900),
      incomeBracket: bracket,
      hasRooftop,
      evOwner: rng() > 0.78,
      solarAdopted: hasRooftop && rng() > 0.85,
    };
  });
});

// A couple of pre-placed installations so the map isn't empty on first load.
export function seedInfra(): Infra[] {
  const mk = (kind: Infra["kind"], pos: LngLat, status: Infra["status"]): Infra => ({
    id: `infra-${kind}-${Math.round(pos[0] * 1e4)}`,
    kind,
    position: pos,
    capacityKw: INFRA_PRESETS[kind].capacityKw,
    costCad: INFRA_PRESETS[kind].costCad,
    modelUrl: MODEL_URL[kind],
    status,
    placedBy: "you",
    zoneId: nearestZone(pos)?.id,
  });
  return [
    mk("solar", [-79.4205, 43.6371], "active"),
    mk("wind", [-79.2972, 43.6717], "active"),
    mk("battery", [-79.3607, 43.6595], "planned"),
    mk("microgrid", [-79.4112, 43.7615], "planned"),
  ];
}

// Baseline metrics for tick 0 given current infra.
export function metricsForTick(
  tick: number,
  infra: Infra[],
  approvalPct = 0.62,
  demandMultiplier = 1
): SimMetrics {
  const totalDemandKwh =
    ZONES.reduce((s, z) => s + z.demandKwhMonthly, 0) * demandMultiplier;
  const installedKw = infra.reduce(
    (s, i) => s + i.capacityKw * (i.status === "active" ? 1 : i.status === "damaged" ? 0 : 0.4),
    0
  );
  // crude monthly kWh from installed kW (capacity factor ~22%, 730h/mo) + organic adoption growth
  const growth = 1 + tick * 0.035;
  const renewableSupplyKwh = Math.round(installedKw * 730 * 0.22 * growth +
    totalDemandKwh * 0.04 * Math.min(tick, 24) / 24);
  const coveragePct = Math.min(1, renewableSupplyKwh / totalDemandKwh);
  const costCumulativeCad = infra.reduce((s, i) => s + i.costCad, 0);
  const burdenServed =
    infra.length === 0
      ? 0
      : infra.reduce((s, i) => {
          const z = nearestZone(i.position);
          return s + (z ? z.demographics.energyBurdenIndex : 0.4);
        }, 0) / infra.length;
  return {
    tick,
    year: 2026 + Math.floor(tick / 12),
    totalDemandKwh,
    renewableSupplyKwh,
    coveragePct: +coveragePct.toFixed(4),
    gridLoadPct: +Math.max(0.35, 0.92 - coveragePct * 0.5).toFixed(3),
    emissionsTonnes: Math.round((totalDemandKwh - renewableSupplyKwh) * 0.00012),
    costCumulativeCad,
    equityScore: +Math.min(1, 0.35 + burdenServed * 0.6).toFixed(3),
    approvalPct: +Math.min(1, Math.max(0, approvalPct)).toFixed(3),
    hour: (6 + tick) % 24,
  };
}

export function nearestZone(pos: LngLat): Zone | undefined {
  let best: Zone | undefined;
  let bestD = Infinity;
  for (const z of ZONES) {
    const d =
      (z.centroid[0] - pos[0]) ** 2 + (z.centroid[1] - pos[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

// Mock optimizer: rank high-burden, high-potential zones without infra nearby.
export function mockOptimize(n: number, infra: Infra[]): Recommendation[] {
  const occupied = new Set(
    infra.map((i) => nearestZone(i.position)?.id).filter(Boolean) as string[]
  );
  const ranked = ZONES.filter((z) => !occupied.has(z.id))
    .map((z) => {
      const kind: Recommendation["kind"] =
        z.solarPotential > z.windPotential
          ? z.demographics.population > 25000
            ? "microgrid"
            : "solar"
          : "wind";
      const score = +(
        z.demographics.energyBurdenIndex * 0.55 +
        z.solarPotential * 0.3 +
        z.windPotential * 0.15
      ).toFixed(3);
      return {
        position: z.centroid,
        kind,
        score,
        expectedCoverageGain: +(0.01 + z.solarPotential * 0.05).toFixed(3),
        equityGain: +(z.demographics.energyBurdenIndex * 0.08).toFixed(3),
        rationale: `${z.name}: energy-burden ${(
          z.demographics.energyBurdenIndex * 100
        ).toFixed(0)}%, ${
          z.solarPotential > z.windPotential ? "strong solar" : "strong wind"
        } potential, ${(z.demographics.renterPct * 100).toFixed(
          0
        )}% renters underserved.`,
      } as Recommendation;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
  return ranked;
}

// ---------------- v2 mock engine: scenarios / sentiment / voices / flows / planner ----------------

const mockRng = mulberry32(99173);
function rid(prefix: string) {
  return `${prefix}-${Math.floor(mockRng() * 1e6).toString(36)}`;
}

const SCENARIO_META: Record<
  ScenarioType,
  { label: string; description: string }
> = {
  earthquake: {
    label: "Earthquake (M5.8)",
    description:
      "Seismic shock damages grid infrastructure across central zones; several installations go offline.",
  },
  heatwave: {
    label: "Extreme Heatwave",
    description:
      "A 41°C heat dome spikes cooling demand 20–40% and pushes residents toward solar + storage.",
  },
  ice_storm: {
    label: "Ice Storm",
    description:
      "Freezing rain downs lines and ices over panels; demand climbs as heating loads surge.",
  },
  blackout: {
    label: "City-wide Blackout",
    description:
      "Cascading failure cuts coverage everywhere — except microgrid-served zones, which stay lit.",
  },
  gas_spike: {
    label: "Natural Gas Price Spike",
    description:
      "Fuel costs jump; emissions penalty rises and adoption incentives strengthen.",
  },
  population_boom: {
    label: "Population Boom",
    description:
      "Rapid in-migration raises baseline demand across residential zones.",
  },
  policy_incentive: {
    label: "Green Policy Incentive",
    description:
      "New rebates raise adoption propensity citywide; sentiment toward renewables improves.",
  },
  custom: { label: "Custom Scenario", description: "A custom event." },
};

const SCENARIO_TYPES: ScenarioType[] = [
  "earthquake",
  "heatwave",
  "ice_storm",
  "blackout",
  "gas_spike",
  "population_boom",
  "policy_incentive",
];

export function mockScenario(
  type: ScenarioType | "random",
  tick: number,
  infra: Infra[],
  intensity = 1
): Scenario {
  const t: ScenarioType =
    type === "random"
      ? SCENARIO_TYPES[Math.floor(mockRng() * SCENARIO_TYPES.length)]
      : type;
  const meta = SCENARIO_META[t];
  const effects: ScenarioEffect[] = [];

  const pickZones = (k: number) =>
    [...ZONES].sort(() => mockRng() - 0.5).slice(0, k);

  switch (t) {
    case "earthquake": {
      infra
        .filter(() => mockRng() < 0.35)
        .forEach((i) =>
          effects.push({
            target: "infra",
            infraId: i.id,
            delta: -1,
            note: "Damaged — offline",
          })
        );
      pickZones(4).forEach((z) =>
        effects.push({ target: "grid", zoneId: z.id, delta: -0.5, note: "Outage" })
      );
      break;
    }
    case "heatwave":
      effects.push({
        target: "demand",
        delta: 0.2 + 0.2 * intensity,
        note: "Cooling demand surge",
      });
      effects.push({
        target: "sentiment",
        delta: 0.12,
        note: "Support for solar/battery up",
      });
      break;
    case "ice_storm":
      effects.push({ target: "demand", delta: 0.25, note: "Heating load up" });
      pickZones(3).forEach((z) =>
        effects.push({ target: "grid", zoneId: z.id, delta: -0.3, note: "Lines down" })
      );
      break;
    case "blackout":
      ZONES.forEach((z) =>
        effects.push({ target: "grid", zoneId: z.id, delta: -1, note: "Blackout" })
      );
      break;
    case "gas_spike":
      effects.push({ target: "adoption", delta: 0.15, note: "Incentive to switch" });
      effects.push({ target: "sentiment", delta: 0.06, note: "Renewables look cheaper" });
      break;
    case "population_boom":
      effects.push({ target: "demand", delta: 0.18, note: "More residents" });
      break;
    case "policy_incentive":
      effects.push({ target: "adoption", delta: 0.2, note: "Rebates" });
      effects.push({ target: "sentiment", delta: 0.15, note: "Public approval up" });
      break;
    default:
      break;
  }

  return {
    id: rid("scn"),
    type: t,
    label: meta.label,
    description: meta.description,
    effects,
    startedTick: tick,
  };
}

// Aggregate scenario effects into simple multipliers/sets the store applies.
export function scenarioImpact(scenarios: Scenario[]) {
  let demandMultiplier = 1;
  let sentimentDelta = 0;
  let adoptionDelta = 0;
  const outageZones = new Set<string>();
  const damagedInfra = new Set<string>();
  const microgridResilient = scenarios.some((s) => s.type === "blackout");
  for (const s of scenarios) {
    for (const e of s.effects) {
      if (e.target === "demand") demandMultiplier *= 1 + e.delta;
      if (e.target === "sentiment") sentimentDelta += e.delta;
      if (e.target === "adoption") adoptionDelta += e.delta;
      if (e.target === "grid" && e.zoneId && e.delta <= -0.5)
        outageZones.add(e.zoneId);
      if (e.target === "infra" && e.infraId) damagedInfra.add(e.infraId);
    }
  }
  return {
    demandMultiplier,
    sentimentDelta,
    adoptionDelta,
    outageZones,
    damagedInfra,
    microgridResilient,
  };
}

// ---- Sentiment ----
function approvalForZone(z: Zone, infra: Infra[], bias: number): number {
  // closer infra + lower burden -> higher approval; some archetypes dislike wind
  const near = infra.filter(
    (i) =>
      (i.position[0] - z.centroid[0]) ** 2 +
        (i.position[1] - z.centroid[1]) ** 2 <
      0.0006
  );
  let a = 0.1 + near.length * 0.18 - z.demographics.energyBurdenIndex * 0.25;
  if (near.some((i) => i.kind === "wind")) a -= 0.12; // noise/visual concerns
  if (near.some((i) => i.kind === "microgrid" || i.kind === "battery")) a += 0.1;
  return Math.max(-1, Math.min(1, a + bias));
}

export function mockSentiment(infra: Infra[], bias = 0): Sentiment {
  const perZone: Record<string, number> = {};
  let sum = 0;
  for (const z of ZONES) {
    const a = approvalForZone(z, infra, bias);
    perZone[z.id] = +a.toFixed(3);
    sum += a;
  }
  const avg = sum / ZONES.length; // -1..1
  return { cityApprovalPct: +((avg + 1) / 2).toFixed(3), perZone };
}

// ---- Voices ----
const VOICE_TEMPLATES: Record<
  AgentVoice["stance"],
  ((kind?: string, zone?: string) => string)[]
> = {
  support: [
    (k) => `Finally some ${k ?? "clean energy"} in our neighbourhood — about time.`,
    () => `My hydro bill dropped after the new install. I'm sold.`,
    (k) => `Proud to see ${k ?? "renewables"} going up here. This is the future.`,
    () => `Resilient power during the last outage? Yes please.`,
  ],
  oppose: [
    (k) => `That ${k ?? "thing"} is an eyesore and I wasn't even consulted.`,
    () => `Worried about the noise and my property value, honestly.`,
    () => `Why here and not the wealthy parts of town? Same old story.`,
    (k) => `Not convinced the ${k ?? "project"} is worth the cost to us.`,
  ],
  neutral: [
    () => `Could go either way — depends if my bill actually changes.`,
    (k) => `Curious how the ${k ?? "rollout"} will hold up over winter.`,
    () => `Wait and see for me. Show me the numbers first.`,
  ],
};

const ARCH_LABELS = [
  "renter-lowincome",
  "owner-suburban",
  "small-business",
  "condo-dweller",
  "owner-midincome",
];

export function mockVoices(
  n: number,
  infra: Infra[],
  sentiment: Sentiment,
  context?: string
): AgentVoice[] {
  const out: AgentVoice[] = [];
  const zones = [...ZONES].sort(() => mockRng() - 0.5);
  for (let i = 0; i < n; i++) {
    const z = zones[i % zones.length];
    const approval = sentiment.perZone[z.id] ?? 0;
    const roll = mockRng() + approval * 0.5;
    const stance: AgentVoice["stance"] =
      roll > 0.55 ? "support" : roll < 0.2 ? "oppose" : "neutral";
    const near = infra.find(
      (inf) =>
        (inf.position[0] - z.centroid[0]) ** 2 +
          (inf.position[1] - z.centroid[1]) ** 2 <
        0.0008
    );
    const tmpl =
      VOICE_TEMPLATES[stance][
        Math.floor(mockRng() * VOICE_TEMPLATES[stance].length)
      ];
    const arch = ARCH_LABELS[Math.floor(mockRng() * ARCH_LABELS.length)];
    const seed = `${z.id}-${i}-${Math.floor(mockRng() * 1e4)}`;
    // exact-ish agent location: jittered around the zone centroid
    const position: LngLat = [
      z.centroid[0] + (mockRng() - 0.5) * 0.012,
      z.centroid[1] + (mockRng() - 0.5) * 0.012,
    ];
    out.push({
      agentId: rid("ag"),
      zoneId: z.id,
      archetype: arch,
      avatarSeed: seed,
      text: tmpl(near?.kind, z.name),
      stance,
      topic: context ?? near?.kind ?? "grid",
      position,
      trigger: context ?? null,
    });
  }
  return out;
}

// ---- Flows (energy source -> zone) ----
export function mockFlows(infra: Infra[]): Flow[] {
  const out: Flow[] = [];
  for (const i of infra) {
    if (i.status === "damaged") continue;
    // power the 2 nearest zones
    const near = [...ZONES]
      .map((z) => ({
        z,
        d: (z.centroid[0] - i.position[0]) ** 2 + (z.centroid[1] - i.position[1]) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach(({ z }, idx) =>
      out.push({
        fromInfraId: i.id,
        toZoneId: z.id,
        powerKwh: Math.round(i.capacityKw * 730 * 0.22 * (idx === 0 ? 0.6 : 0.4)),
      })
    );
  }
  return out;
}

// ---- Planner (deterministic greedy "planner-lite") ----
// Honors the user's typed instruction: parses an infra kind ("batteries") and a
// target ("near hospitals") so the typed-command demo does what it says — even
// offline. Yields a realistic event stream the chat UI animates.
type PlannerOpts = {
  text?: string;
  facilities?: { kind: string; position: LngLat; name?: string }[];
};

function parseKind(text: string): InfraKind | null {
  if (/\bbatter/i.test(text)) return "battery";
  if (/\bsolar\b/i.test(text)) return "solar";
  if (/\bwind\b/i.test(text)) return "wind";
  if (/\bmicrogrid\b/i.test(text)) return "microgrid";
  return null;
}

function parseFacilityTarget(text: string): string | null {
  if (/\bhospital/i.test(text)) return "hospital";
  if (/\bshelter|respite/i.test(text)) return "shelter";
  if (/\bcooling|pool|library|community|school/i.test(text)) return "cooling_centre";
  return null;
}

function parseProgram(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bretrofit|insulat|heat pump|grant\b/.test(t)) return "retrofit_grant";
  if (/\bev\b|charg|electric vehicle/.test(t)) return "ev_incentive";
  if (/rebate|incentive|program|subsid/.test(t)) return "rooftop_solar_rebate";
  return null;
}

export function* mockPlannerEvents(
  n: number,
  infra: Infra[],
  budgetCad: number,
  opts: PlannerOpts = {}
): Generator<PlannerEvent> {
  const text = opts.text ?? "";
  const forcedKind = parseKind(text);
  const facTarget = parseFacilityTarget(text);
  const program = parseProgram(text);

  // Program path: launch a distributed incentive (rebate/EV/retrofit) instead of
  // siting utility infra — drives per-home rooftop adoption in high-burden zones.
  // (Program keywords like "rebate" win even if a kind like "solar" is mentioned.)
  if (program) {
    const label = program.replace(/_/g, " ");
    yield {
      type: "thought",
      text: `A ${label} reaches many households at once. Targeting the highest energy-burden neighbourhoods for the biggest equity impact.`,
    };
    yield { type: "tool_call", name: "get_city_state", args: {} };
    yield { type: "tool_call", name: "launch_program", args: { program } };
    const targets = [...ZONES]
      .sort(
        (a, b) =>
          b.demographics.energyBurdenIndex - a.demographics.energyBurdenIndex
      )
      .slice(0, 6)
      .map((z) => z.id);
    yield {
      type: "tool_result",
      name: "launch_program",
      result: { program, zones: targets },
    };
    yield {
      type: "done",
      summary: `Launched the ${label} across ${targets.length} high-burden neighbourhoods — watch rooftop solar adoption climb there over the next ticks.`,
    };
    return;
  }

  yield {
    type: "thought",
    text: text
      ? `Understood: "${text}". Let me read the city state and find the best sites.`
      : `Goal: maximize renewable coverage + equity within ${(budgetCad / 1e6).toFixed(1)}M CAD. Let me read the city state.`,
  };
  yield { type: "tool_call", name: "get_city_state", args: {} };
  yield {
    type: "tool_result",
    name: "get_city_state",
    result: { zones: ZONES.length, placed: infra.length },
  };
  yield { type: "tool_call", name: "get_metrics", args: {} };

  // Build placement sites: near matching facilities if requested, else optimizer.
  type Site = { position: LngLat; kind: InfraKind; rationale: string };
  let sites: Site[];
  if (facTarget && opts.facilities?.length) {
    const matched = opts.facilities.filter((f) => f.kind === facTarget);
    const pool = (matched.length ? matched : opts.facilities).slice(0, n);
    const kind = forcedKind ?? "battery";
    yield {
      type: "tool_call",
      name: "get_facilities",
      args: { category: facTarget },
    };
    yield {
      type: "tool_result",
      name: "get_facilities",
      result: { count: pool.length, category: facTarget },
    };
    sites = pool.map((f) => ({
      position: f.position,
      kind,
      rationale: `${f.name ?? "facility"} (${(f.kind ?? facTarget).replace(/_/g, " ")}) — siting a ${kind} alongside it for resilient backup power.`,
    }));
  } else {
    const recs = mockOptimize(n, infra);
    yield { type: "tool_call", name: "optimize", args: { n } };
    yield {
      type: "tool_result",
      name: "optimize",
      result: recs.map((r) => ({ kind: r.kind, score: r.score })),
    };
    sites = recs.map((r) => ({
      position: r.position,
      kind: forcedKind ?? (r.kind as InfraKind),
      rationale: r.rationale,
    }));
  }

  let spent = 0;
  let placed = 0;
  for (const site of sites) {
    const preset = INFRA_PRESETS[site.kind];
    if (spent + preset.costCad > budgetCad) {
      yield { type: "thought", text: `Budget nearly exhausted (${((spent / budgetCad) * 100).toFixed(0)}%). Holding off on further placements.` };
      break;
    }
    yield { type: "thought", text: `${site.rationale} Placing a ${site.kind} here.` };
    yield {
      type: "tool_call",
      name: "place_infrastructure",
      args: { kind: site.kind, position: site.position, capacityKw: preset.capacityKw },
    };
    const z = nearestZone(site.position);
    const infraItem: Infra = {
      id: rid("ai"),
      kind: site.kind,
      position: site.position,
      capacityKw: preset.capacityKw,
      costCad: preset.costCad,
      modelUrl: MODEL_URL[site.kind],
      status: "active",
      placedBy: "ai",
      zoneId: z?.id,
    };
    spent += preset.costCad;
    placed++;
    yield { type: "tool_result", name: "place_infrastructure", result: { id: infraItem.id } };
    yield { type: "placement", infra: infraItem };
  }
  yield {
    type: "done",
    summary: facTarget
      ? `Placed ${placed} ${forcedKind ?? "battery"} unit(s) next to ${facTarget.replace(/_/g, " ")}s for ~${(spent / 1e6).toFixed(1)}M CAD — resilient backup where vulnerable people shelter.`
      : `Placed ${placed} assets for ~${(spent / 1e6).toFixed(1)}M CAD, prioritizing high-burden zones with strong renewable potential.`,
  };
}
