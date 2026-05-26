import { useRef, useMemo, useEffect, Suspense, useState, createRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, useGLTF, OrbitControls, TransformControls, Text3D, Html } from "@react-three/drei";
import {
  Vector3, Box3, MathUtils, Color,
  type Group, type Mesh, type Points,
  BufferGeometry, Float32BufferAttribute,
} from "three";
import zonesRaw from "@/data/zonesFixture.json";

// ── Model sizing ─────────────────────────────────────────────────────────────
const MODEL_HEIGHTS = {
  heroTurbine: 11,
  solar: 2.2,
  wind: 6,
  battery: 2.6,
  microgrid: 3.2,
};

function fitToHeight(obj: Group, targetH: number) {
  const box = new Box3().setFromObject(obj);
  const size = new Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetH / maxDim;
  return { scale, yBase: -box.min.y * scale };
}

const ease = (t: number) => {
  const x = MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

useGLTF.preload("/models/wind_turbine.glb");
useGLTF.preload("/models/solar_array.glb");
useGLTF.preload("/models/battery.glb");
useGLTF.preload("/models/microgrid_hub.glb");

// ── Toronto geo → 3D world coordinate helpers ────────────────────────────────
const TORONTO_MID_LNG = -79.375;
const TORONTO_MID_LAT = 43.715;
const TORONTO_LNG_SPAN = 0.55;
const TORONTO_LAT_SPAN = 0.29;

function geoTo3D(lng: number, lat: number, spread = 1): [number, number] {
  const x = ((lng - TORONTO_MID_LNG) / (TORONTO_LNG_SPAN / 2)) * 12 * spread;
  const z = -((lat - TORONTO_MID_LAT) / (TORONTO_LAT_SPAN / 2)) * 7 * spread;
  return [x, z];
}

// ── Camera rig ───────────────────────────────────────────────────────────────

export function CameraRig({ progress }: { progress: number }) {
  const { camera } = useThree();
  const tPos = useRef(new Vector3(0, 5, 20));
  const tLook = useRef(new Vector3(0, 1.5, 0));
  // Smoothed look target — lags the position slightly for a cinematic feel
  const currentLook = useRef(new Vector3(0, 1.5, 0));

  useFrame(() => {
    const p = progress;

    if (p < 0.55) {
      const d = p / 0.55;
      tPos.current.set(0, 5, MathUtils.lerp(20, -22, d));
      tLook.current.set(0, 1.5, MathUtils.lerp(0, -40, d));
    } else if (p < 0.75) {
      const d = (p - 0.55) / 0.2;
      tPos.current.set(MathUtils.lerp(-14, 14, d), 5, -22);
      tLook.current.set(MathUtils.lerp(-10, 10, d), 1.2, -40);
    } else if (p < 0.86) {
      const d = (p - 0.75) / 0.11;
      tPos.current.set(MathUtils.lerp(14, 0, d), MathUtils.lerp(5, 6, d), MathUtils.lerp(-22, -50, d));
      tLook.current.set(MathUtils.lerp(10, 0, d), 1.2, -68);
    } else {
      const l = (p - 0.86) / 0.14;
      tPos.current.set(0, MathUtils.lerp(6, 42, l), MathUtils.lerp(-50, -52, l));
      tLook.current.set(0, 0, MathUtils.lerp(-68, -52, l));
    }

    // Distance-adaptive lerp: fast approach when far, eases to a soft settle.
    // This gives a cinematic "arrival" at each waypoint instead of constant-speed lerp.
    const dist = camera.position.distanceTo(tPos.current);
    const lerpK = MathUtils.clamp(0.04 + dist * 0.016, 0.04, 0.14);
    camera.position.lerp(tPos.current, lerpK);

    // Look target lags slightly behind position for a natural, weighted feel
    currentLook.current.lerp(tLook.current, 0.07);
    camera.lookAt(currentLook.current);
    camera.updateProjectionMatrix();
  });

  return null;
}

// ── Lighting ──────────────────────────────────────────────────────────────────

function Lights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight
        castShadow
        position={[12, 28, 12]}
        intensity={2.2}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={150}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        color="#ffffff"
      />
      <directionalLight position={[-8, 10, -8]} intensity={0.4} color="#f0f8ff" />
    </>
  );
}

// ── Animated floor grid ───────────────────────────────────────────────────────
// Wrapping Grid in a group lets us shift its Z each frame so section lines
// appear to scroll toward the camera — giving the "driving down the road" feel.
const SECTION_SIZE = 10;

function Floor({ progress }: { progress: number }) {
  const groupRef = useRef<Group>(null);
  const baseZ = -30;
  // Each frame accumulate elapsed time to drive the scroll offset
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    // Idle drift speed + journey boost when scrolling. At the scope screen
    // (progress past ~0.86) the journey has arrived, so the grid eases to a
    // slow ambient crawl instead of racing.
    const speed = progress > 0.86 ? 1.4 : 3 + progress * 14;
    elapsed.current += delta * speed;
    // Loop within one section so the grid tiles seamlessly
    const offset = elapsed.current % SECTION_SIZE;
    groupRef.current.position.z = baseZ + offset;
  });

  return (
    <>
      {/* Shadow receiver */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, baseZ]} receiveShadow>
        <planeGeometry args={[200, 160]} />
        <shadowMaterial transparent opacity={0.14} />
      </mesh>

      {/* Animated grid */}
      <group ref={groupRef}>
        <Grid
          position={[0, 0, 0]}
          args={[200, 160]}
          cellSize={2}
          cellThickness={0.7}
          cellColor="#cccccc"
          sectionSize={SECTION_SIZE}
          sectionThickness={1.5}
          sectionColor={new Color("#8fad6e")}
          fadeDistance={90}
          fadeStrength={1.2}
          infiniteGrid
        />
      </group>
    </>
  );
}

// ── Volt horizon glow ─────────────────────────────────────────────────────────

function VoltHorizon() {
  return (
    <group position={[0, 0.8, -65]}>
      {/* Broad diffuse glow band */}
      <mesh>
        <planeGeometry args={[120, 1.2]} />
        <meshBasicMaterial color="#c8f400" transparent opacity={0.08} />
      </mesh>
      {/* Crisp line on top */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[120, 0.028]} />
        <meshBasicMaterial color="#c8f400" transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

// ── Floating ambient particles ────────────────────────────────────────────────
// Sparse motes drifting upward to add depth and life.

const PARTICLE_COUNT = 140;

function Particles() {
  const pointsRef = useRef<Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    // Volt green: r=0.784 g=0.957 b=0  Gray: ~0.65,0.65,0.65
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 14;
      pos[i * 3 + 2] = -Math.random() * 80;
      const isVolt = Math.random() < 0.3;
      col[i * 3]     = isVolt ? 0.784 : 0.65;
      col[i * 3 + 1] = isVolt ? 0.957 : 0.65;
      col[i * 3 + 2] = isVolt ? 0.0   : 0.65;
    }
    return { positions: pos, colors: col };
  }, []);

  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions.slice(), 3));
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const attr = pointsRef.current.geometry.attributes.position;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 1] += delta * (0.08 + Math.random() * 0.04);
      if (arr[i * 3 + 1] > 14) {
        arr[i * 3 + 1] = 0;
        arr[i * 3]     = (Math.random() - 0.5) * 80;
        arr[i * 3 + 2] = -Math.random() * 80;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        size={0.07}
        vertexColors
        transparent
        opacity={0.45}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// ── Volt energy pulses ────────────────────────────────────────────────────────
// Small glowing volt dots that travel along grid section lines toward the
// camera (Z increasing toward 0), reinforcing the energy-flow theme.

const PULSE_COUNT = 10;
// Place pulses on X grid section lines (-20, -10, 0, 10, 20) + some random
const PULSE_CONFIGS = Array.from({ length: PULSE_COUNT }, (_, i) => ({
  x: Math.round(((Math.random() - 0.5) * 40) / 10) * 10,
  startZ: -(Math.random() * 68 + 4),
  speed: 7 + Math.random() * 8,
  phase: Math.random() * 68,
}));

function VoltPulses() {
  const groupRef = useRef<Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (!groupRef.current) return;
    groupRef.current.children.forEach((child, i) => {
      const cfg = PULSE_CONFIGS[i];
      // Travel from startZ toward 0, loop when past camera
      const z = cfg.startZ + ((timeRef.current * cfg.speed + cfg.phase) % 72);
      child.position.z = z > 2 ? cfg.startZ : z;
    });
  });

  return (
    <group ref={groupRef}>
      {PULSE_CONFIGS.map((cfg, i) => (
        <mesh key={i} position={[cfg.x, 0.06, cfg.startZ]}>
          <sphereGeometry args={[0.1, 5, 5]} />
          <meshBasicMaterial color="#c8f400" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ── Volt scan line ────────────────────────────────────────────────────────────
// A single volt line slowly sweeping forward across the grid — subtle cinematic pulse.

function ScanLine() {
  const meshRef = useRef<Mesh>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta * 1.8;
    if (!meshRef.current) return;
    // Sweep from z=-70 to z=5, loop every ~42s / cycle
    const z = -70 + (timeRef.current * 2.5) % 75;
    meshRef.current.position.z = z;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, -70]}>
      <planeGeometry args={[160, 0.18]} />
      <meshBasicMaterial color="#c8f400" transparent opacity={0.12} depthWrite={false} />
    </mesh>
  );
}

// ── GLB model loader ──────────────────────────────────────────────────────────

function GlbModel({
  url,
  position,
  targetH,
  reveal = 1,
  rotateY = 0,
}: {
  url: string;
  position: [number, number, number];
  targetH: number;
  reveal?: number;
  rotateY?: number;
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const fit = useMemo(() => fitToHeight(cloned, targetH), [cloned, targetH]);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * rotateY;
    }
  });

  if (reveal < 0.01) return null;

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + fit.yBase * reveal, position[2]]}
      scale={fit.scale * reveal}
    >
      <primitive object={cloned} />
    </group>
  );
}

// ── Stored-layout model (uses saved position/rotation/scale exactly) ──────────
// Used when a localStorage layout is present — bypasses fitToHeight/yBase math
// since those were already baked into the saved values at drag-time.

function StoredGlbModel({
  url, storedPosition, storedRotation, storedScale, reveal = 1, rotateY = 0,
}: {
  url: string;
  storedPosition: [number, number, number];
  storedRotation: [number, number, number];
  storedScale: number;
  reveal?: number;
  rotateY?: number;
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as Mesh).isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * rotateY;
  });
  if (reveal < 0.01) return null;
  return (
    <group
      ref={groupRef}
      position={[storedPosition[0], storedPosition[1] * reveal, storedPosition[2]]}
      rotation={[storedRotation[0], storedRotation[1], storedRotation[2]]}
      scale={storedScale * reveal}
    >
      <primitive object={cloned} />
    </group>
  );
}

// ── Hero station ──────────────────────────────────────────────────────────────

// Default positions for hero-area models when no stored layout exists
const HERO_DEFAULTS: Record<string, [number, number, number]> = {
  heroTurbine: [3.5,  0, -1],
  solar:       [-8,  0, -2],
  battery:     [8,   0,  1],
  microgrid:   [13,  0, -3],
};

function HeroTurbine({ stored }: {
  stored?: StoredModelEntry | null;
}) {
  const { scene } = useGLTF("/models/wind_turbine.glb");
  const groupRef = useRef<Group>(null);
  const bladeRef = useRef<Group | null>(null);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  useEffect(() => {
    bladeRef.current = null;
    cloned.traverse((child) => {
      if (!bladeRef.current) {
        const name = child.name.toLowerCase();
        if (name.match(/rotor|blade|prop|spin|fan|hub/)) {
          bladeRef.current = child as Group;
        }
      }
    });
  }, [cloned]);

  const fit = useMemo(() => fitToHeight(cloned, MODEL_HEIGHTS.heroTurbine), [cloned]);

  useFrame((_, delta) => {
    if (bladeRef.current) {
      bladeRef.current.rotation.z -= delta * 0.55;
    } else if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  if (stored) {
    return (
      <group ref={groupRef} position={stored.position} rotation={stored.rotation} scale={stored.scale} castShadow>
        <primitive object={cloned} />
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[HERO_DEFAULTS.heroTurbine[0], fit.yBase, HERO_DEFAULTS.heroTurbine[2]]} scale={fit.scale} castShadow>
      <primitive object={cloned} />
    </group>
  );
}

// Generic hero model: uses stored layout if present, else fits to targetH at default pos
function HeroGlbModel({ url, targetH, defaultPos, stored }: {
  url: string;
  targetH: number;
  defaultPos: [number, number, number];
  stored?: StoredModelEntry | null;
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<Group>(null);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as Mesh).isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return c;
  }, [scene]);
  const fit = useMemo(() => fitToHeight(cloned, targetH), [cloned, targetH]);

  if (stored) {
    return (
      <group ref={groupRef} position={stored.position} rotation={stored.rotation} scale={stored.scale} castShadow>
        <primitive object={cloned} />
      </group>
    );
  }
  return (
    <group ref={groupRef} position={[defaultPos[0], fit.yBase, defaultPos[2]]} scale={fit.scale} castShadow>
      <primitive object={cloned} />
    </group>
  );
}

function HeroStation({ storedModels, progress }: {
  storedModels?: Record<string, StoredModelEntry> | null;
  progress: number;
}) {
  const groupRef = useRef<Group>(null);
  // Smoothed reveal: 1 in hero range, fades to 0 by progress 0.24
  const smoothReveal = useRef(1);

  useFrame((_, delta) => {
    const target = MathUtils.clamp(1 - (progress - 0.06) / 0.18, 0, 1);
    smoothReveal.current = MathUtils.lerp(smoothReveal.current, target, 1 - Math.pow(0.004, delta));
    if (groupRef.current) {
      groupRef.current.visible = smoothReveal.current > 0.01;
      // Scale toward 0 when fading so models don't cast shadows / appear in 2D stations
      groupRef.current.scale.setScalar(smoothReveal.current);
    }
  });

  return (
    <group ref={groupRef}>
      <HeroTurbine stored={storedModels?.heroTurbine} />
      <HeroGlbModel url="/models/solar_array.glb"   targetH={MODEL_HEIGHTS.solar}     defaultPos={HERO_DEFAULTS.solar}     stored={storedModels?.solar} />
      <HeroGlbModel url="/models/battery.glb"        targetH={MODEL_HEIGHTS.battery}   defaultPos={HERO_DEFAULTS.battery}   stored={storedModels?.battery} />
      <HeroGlbModel url="/models/microgrid_hub.glb"  targetH={MODEL_HEIGHTS.microgrid} defaultPos={HERO_DEFAULTS.microgrid} stored={storedModels?.microgrid} />
    </group>
  );
}

// ── Normal-scene wordmark (rendered when localStorage layout has wordmark) ─────

const FONT_URL_NORMAL = "/fonts/helvetiker_bold.typeface.json";

function NormalWordmark({ position, rotation, scale }: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}) {
  return (
    <group position={position} rotation={[rotation[0], rotation[1], rotation[2]]} scale={scale}>
      <Suspense fallback={null}>
        <Text3D font={FONT_URL_NORMAL} size={1.3} height={0.3} curveSegments={8} bevelEnabled bevelThickness={0.02} bevelSize={0.02}>
          Watt
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.1} />
        </Text3D>
        <Text3D font={FONT_URL_NORMAL} size={1.3} height={0.3} curveSegments={8} bevelEnabled bevelThickness={0.02} bevelSize={0.02} position={[3.1, 0, 0]}>
          If.
          <meshStandardMaterial color="#c8f400" roughness={0.3} metalness={0.0} />
        </Text3D>
      </Suspense>
    </group>
  );
}

// ── Problem station ───────────────────────────────────────────────────────────

type ZoneEntry = { id: string; name: string; centroid: [number, number]; demographics: { energyBurdenIndex: number } };

function ProblemStation(_props: { progress: number }) {
  // Replaced by 2D BurdenChart overlay in Landing.tsx
  return null;
}

// ── Demand station ────────────────────────────────────────────────────────────

const BLOCKS: { x: number; w: number; d: number; h: number }[] = [
  { x: -5, w: 1.8, d: 1.8, h: 3.5 },
  { x: -3, w: 1.2, d: 1.5, h: 5.8 },
  { x: -1, w: 2,   d: 1.8, h: 8.2 },
  { x: 1.5, w: 1.5, d: 1.5, h: 12 },
  { x: 3.5, w: 1.8, d: 2,   h: 9 },
  { x: 5.5, w: 1.2, d: 1.2, h: 6.5 },
  { x: 7,   w: 1,   d: 1.2, h: 4 },
  { x: -7,  w: 1.5, d: 1.5, h: 2.8 },
];

function DemandStation(_props: { progress: number }) {
  // Replaced by 2D BurdenChart overlay in Landing.tsx
  return null;
}

// ── Infrastructure parade ─────────────────────────────────────────────────────

type StoredModelEntry = { position: [number, number, number]; rotation: [number, number, number]; scale: number };

function InfraStation(_props: { progress: number; storedModels?: Record<string, StoredModelEntry> }) {
  // Replaced by 2D FlowDiagram bento overlay in Landing.tsx
  return null;
}

// ── localStorage layout persistence ──────────────────────────────────────────

const LAYOUT_KEY = "wattif:scene-layout";

interface StoredLayout {
  models: { type: string; position: [number, number, number]; rotation: [number, number, number]; scale: number }[];
  wordmark: { position: [number, number, number]; rotation: [number, number, number]; scale: number } | null;
}

function readStoredLayout(): StoredLayout | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LAYOUT_KEY) : null;
    if (!raw) return null;
    return JSON.parse(raw) as StoredLayout;
  } catch {
    return null;
  }
}

function writeStoredLayout(layout: StoredLayout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch { /* ignore private browsing */ }
}

// ── Main exported scene ───────────────────────────────────────────────────────

export function Scene3D({ progress }: { progress: number }) {
  const stored = useMemo(() => readStoredLayout(), []);
  const storedByType = useMemo(() => {
    if (!stored) return null;
    return stored.models.reduce<Record<string, StoredModelEntry>>((acc, m) => {
      acc[m.type] = { position: m.position, rotation: m.rotation, scale: m.scale };
      return acc;
    }, {});
  }, [stored]);

  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <fog attach="fog" args={["#ffffff", 18, 80]} />

      <Lights />
      <Floor progress={progress} />
      <VoltHorizon />
      <Particles />
      <VoltPulses />
      <ScanLine />
      <CameraRig progress={progress} />

      <Suspense fallback={null}>
        <HeroStation storedModels={storedByType} progress={progress} />
        <ProblemStation progress={progress} />
        <DemandStation progress={progress} />
        <InfraStation progress={progress} storedModels={storedByType ?? undefined} />
        {stored?.wordmark && (
          <NormalWordmark
            position={stored.wordmark.position}
            rotation={stored.wordmark.rotation}
            scale={stored.wordmark.scale}
          />
        )}
      </Suspense>
    </>
  );
}

// ── Edit mode (gated by ?edit in URL) ────────────────────────────────────────
//
// Accessed at localhost:5175/?edit — never active on the real landing (no ?edit).
// Provides:
//   • OrbitControls to free-orbit the scene
//   • All models visible at once, each with TransformControls on click
//   • "+" buttons to spawn extra model instances
//   • WattIf 3D wordmark (Text3D) with rotate/scale/translate controls
//   • "Copy layout JSON" exports all positions to clipboard + console

const EDIT_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("edit");

const FONT_URL = "/fonts/helvetiker_bold.typeface.json";

interface EditModelSpec {
  uid: number;
  type: string;
  url: string;
  targetH: number;
  initPos: [number, number, number];
}

const EDIT_DEFAULTS: EditModelSpec[] = [
  { uid: 0, type: "heroTurbine",  url: "/models/wind_turbine.glb",  targetH: MODEL_HEIGHTS.heroTurbine, initPos: [3.5,  0, -1] },
  { uid: 1, type: "solar",        url: "/models/solar_array.glb",   targetH: MODEL_HEIGHTS.solar,       initPos: [-8,   0, -2] },
  { uid: 2, type: "wind",         url: "/models/wind_turbine.glb",  targetH: MODEL_HEIGHTS.wind,        initPos: [-4,   0, -40] },
  { uid: 3, type: "battery",      url: "/models/battery.glb",       targetH: MODEL_HEIGHTS.battery,     initPos: [8,    0,  1] },
  { uid: 4, type: "microgrid",    url: "/models/microgrid_hub.glb", targetH: MODEL_HEIGHTS.microgrid,   initPos: [13,   0, -3] },
];

const ADD_CATALOG: { type: string; url: string; targetH: number }[] = [
  { type: "solar",     url: "/models/solar_array.glb",   targetH: MODEL_HEIGHTS.solar },
  { type: "wind",      url: "/models/wind_turbine.glb",  targetH: MODEL_HEIGHTS.wind },
  { type: "battery",   url: "/models/battery.glb",       targetH: MODEL_HEIGHTS.battery },
  { type: "microgrid", url: "/models/microgrid_hub.glb", targetH: MODEL_HEIGHTS.microgrid },
];

// ── Editable GLB model ────────────────────────────────────────────────────────

function EditableGlbModel({
  spec, groupRef, selected, onSelect, tcMode, orbitRef, onDragEnd,
}: {
  spec: EditModelSpec;
  groupRef: React.RefObject<Group | null>;
  selected: boolean;
  onSelect: () => void;
  tcMode: "translate" | "rotate" | "scale";
  orbitRef: React.RefObject<unknown>;
  onDragEnd?: () => void;
}) {
  const { scene } = useGLTF(spec.url);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child) => {
      if ((child as Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const fit = useMemo(() => fitToHeight(cloned, spec.targetH), [cloned, spec.targetH]);

  return (
    <>
      <group
        ref={groupRef}
        position={[spec.initPos[0], spec.initPos[1] + fit.yBase, spec.initPos[2]]}
        scale={fit.scale}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <primitive object={cloned} />
      </group>
      {selected && (
        <TransformControls
          object={groupRef}
          mode={tcMode}
          onMouseDown={() => { if (orbitRef.current) (orbitRef.current as { enabled: boolean }).enabled = false; }}
          onMouseUp={() => {
            if (orbitRef.current) (orbitRef.current as { enabled: boolean }).enabled = true;
            onDragEnd?.();
          }}
        />
      )}
    </>
  );
}

// ── 3D wordmark ───────────────────────────────────────────────────────────────

function EditWordmark({
  groupRef, selected, onSelect, tcMode, orbitRef, onDragEnd,
}: {
  groupRef: React.RefObject<Group | null>;
  selected: boolean;
  onSelect: () => void;
  tcMode: "translate" | "rotate" | "scale";
  orbitRef: React.RefObject<unknown>;
  onDragEnd?: () => void;
}) {
  return (
    <>
      <group
        ref={groupRef}
        position={[0, 5, -6]}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <Suspense fallback={null}>
          <Text3D font={FONT_URL} size={1.3} height={0.3} curveSegments={8} bevelEnabled bevelThickness={0.02} bevelSize={0.02}>
            Watt
            <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.1} />
          </Text3D>
          {/* "If." offset ~3.1 units right — roughly "Watt" width at size 1.3 */}
          <Text3D font={FONT_URL} size={1.3} height={0.3} curveSegments={8} bevelEnabled bevelThickness={0.02} bevelSize={0.02} position={[3.1, 0, 0]}>
            If.
            <meshStandardMaterial color="#c8f400" roughness={0.3} metalness={0.0} />
          </Text3D>
        </Suspense>
      </group>
      {selected && (
        <TransformControls
          object={groupRef}
          mode={tcMode}
          onMouseDown={() => { if (orbitRef.current) (orbitRef.current as { enabled: boolean }).enabled = false; }}
          onMouseUp={() => {
            if (orbitRef.current) (orbitRef.current as { enabled: boolean }).enabled = true;
            onDragEnd?.();
          }}
        />
      )}
    </>
  );
}

// ── Edit scene ────────────────────────────────────────────────────────────────

function EditScene() {
  const orbitRef = useRef<unknown>(null);

  const [models, setModels] = useState<EditModelSpec[]>(EDIT_DEFAULTS);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [tcMode, setTcMode] = useState<"translate" | "rotate" | "scale">("translate");

  const [wordmarkSelected, setWordmarkSelected] = useState(false);
  const [wordmarkMode, setWordmarkMode] = useState<"translate" | "rotate" | "scale">("translate");

  const nextUid = useRef(100);
  // Stable refs per uid — created once and reused
  const modelRefs = useRef<Map<number, React.RefObject<Group | null>>>(
    new Map(EDIT_DEFAULTS.map((m) => [m.uid, createRef<Group | null>()]))
  );
  const wordmarkRef = useRef<Group | null>(null);

  // Slider-driven transform of the currently selected object (model or wordmark).
  const [xf, setXf] = useState({ px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 });

  const selectedGroup = (): Group | null => {
    if (wordmarkSelected) return wordmarkRef.current;
    if (selectedUid !== null) return modelRefs.current.get(selectedUid)?.current ?? null;
    return null;
  };

  const syncFromGroup = () => {
    const g = selectedGroup();
    if (!g) return;
    setXf({
      px: +g.position.x.toFixed(2), py: +g.position.y.toFixed(2), pz: +g.position.z.toFixed(2),
      rx: +g.rotation.x.toFixed(3), ry: +g.rotation.y.toFixed(3), rz: +g.rotation.z.toFixed(3),
    });
  };

  // Re-read the gizmo's transform into the sliders whenever selection changes.
  useEffect(() => {
    const id = requestAnimationFrame(syncFromGroup);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUid, wordmarkSelected]);

  const getOrCreateRef = (uid: number) => {
    if (!modelRefs.current.has(uid)) {
      modelRefs.current.set(uid, createRef<Group | null>());
    }
    return modelRefs.current.get(uid)!;
  };

  const addModel = (type: string) => {
    const spec = ADD_CATALOG.find((c) => c.type === type)!;
    const uid = nextUid.current++;
    setModels((prev) => [...prev, { uid, type, url: spec.url, targetH: spec.targetH, initPos: [0, 0, -20] }]);
  };

  const selectModel = (uid: number) => {
    setSelectedUid(uid);
    setWordmarkSelected(false);
  };

  const selectWordmark = () => {
    setWordmarkSelected(true);
    setSelectedUid(null);
  };

  const collectLayout = (): StoredLayout => {
    const modelLayout = models.map((m) => {
      const g = modelRefs.current.get(m.uid)?.current;
      return {
        type: m.type,
        position: (g ? [+g.position.x.toFixed(3), +g.position.y.toFixed(3), +g.position.z.toFixed(3)] : m.initPos) as [number, number, number],
        rotation: (g ? [+g.rotation.x.toFixed(3), +g.rotation.y.toFixed(3), +g.rotation.z.toFixed(3)] : [0, 0, 0]) as [number, number, number],
        scale: g ? +g.scale.x.toFixed(3) : 1,
      };
    });
    const wm = wordmarkRef.current;
    const wordmarkLayout = wm
      ? {
          position: [+wm.position.x.toFixed(3), +wm.position.y.toFixed(3), +wm.position.z.toFixed(3)] as [number, number, number],
          rotation: [+wm.rotation.x.toFixed(3), +wm.rotation.y.toFixed(3), +wm.rotation.z.toFixed(3)] as [number, number, number],
          scale: +wm.scale.x.toFixed(3),
        }
      : null;
    return { models: modelLayout, wordmark: wordmarkLayout };
  };

  const [savedToDevice, setSavedToDevice] = useState(false);

  const saveToDevice = () => {
    const layout = collectLayout();
    writeStoredLayout(layout);
    setSavedToDevice(true);
    setTimeout(() => setSavedToDevice(false), 1800);
  };

  // Slider → write directly to the selected group, persist, keep state in sync.
  const applyXf = (next: typeof xf) => {
    const g = selectedGroup();
    if (!g) return;
    g.position.set(next.px, next.py, next.pz);
    g.rotation.set(next.rx, next.ry, next.rz);
    setXf(next);
    saveToDevice();
  };

  // Gizmo drag end → persist AND refresh the sliders to match.
  const onTransformEnd = () => {
    saveToDevice();
    syncFromGroup();
  };

  // Snap the orbit camera back to the exact landing-page hero framing so you can
  // preview how the arrangement reads on the real page.
  const resetToLanding = () => {
    const c = orbitRef.current as {
      object?: { position: { set: (x: number, y: number, z: number) => void }; fov?: number; updateProjectionMatrix?: () => void };
      target?: { set: (x: number, y: number, z: number) => void };
      update?: () => void;
    } | null;
    if (!c?.object || !c.target) return;
    c.object.position.set(0, 5, 20);
    c.target.set(0, 1.5, 0);
    if (c.object.fov !== undefined) { c.object.fov = 52; c.object.updateProjectionMatrix?.(); }
    c.update?.();
  };

  const copyLayout = () => {
    const layout = collectLayout();
    const json = JSON.stringify(layout, null, 2);
    console.log("=== WattIf Scene Layout ===\n", json);
    navigator.clipboard.writeText(json).catch(() => {});
  };

  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <Lights />
      <Floor progress={0} />
      <VoltHorizon />
      <Particles />
      <ScanLine />

      {/* Default target = the hero camera's look-at, so the editor opens on the
          exact landing-page framing (camera starts at [0,5,20] via the Canvas). */}
      <OrbitControls ref={orbitRef as React.RefObject<unknown>} makeDefault target={[0, 1.5, 0]} />

      {/* Invisible background plane to deselect */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        onClick={() => { setSelectedUid(null); setWordmarkSelected(false); }}
      >
        <planeGeometry args={[2000, 2000]} />
        <meshBasicMaterial />
      </mesh>

      <Suspense fallback={null}>
        {models.map((m) => (
          <EditableGlbModel
            key={m.uid}
            spec={m}
            groupRef={getOrCreateRef(m.uid)}
            selected={selectedUid === m.uid}
            onSelect={() => selectModel(m.uid)}
            tcMode={tcMode}
            orbitRef={orbitRef}
            onDragEnd={onTransformEnd}
          />
        ))}
      </Suspense>

      <EditWordmark
        groupRef={wordmarkRef as React.RefObject<Group | null>}
        selected={wordmarkSelected}
        onSelect={selectWordmark}
        tcMode={wordmarkMode}
        orbitRef={orbitRef}
        onDragEnd={onTransformEnd}
      />

      {/* ── Dev panel ──────────────────────────────────────────────────────── */}
      <Html fullscreen style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute", right: 16, top: 16,
            width: 264,
            background: "rgba(10,10,10,0.92)",
            backdropFilter: "blur(10px)",
            color: "#fff",
            borderRadius: 12,
            padding: 16,
            fontFamily: "monospace",
            fontSize: 12,
            pointerEvents: "auto",
            userSelect: "none",
            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, color: "#c8f400", fontSize: 14 }}>
            ⚡ Edit Mode
          </div>

          {/* Snap back to the real landing-page camera framing */}
          <button
            onClick={resetToLanding}
            style={{
              width: "100%", padding: "6px 0", marginBottom: 12,
              background: "#1c1c1c", color: "#c8f400",
              border: "1px solid #c8f400", borderRadius: 6,
              cursor: "pointer", fontSize: 11, fontWeight: 600,
            }}
            title="View the scene from the landing page's hero camera"
          >
            ⌂ Landing view
          </button>

          {/* Model selection + transform mode */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#777", marginBottom: 6, fontSize: 11 }}>
              {selectedUid !== null
                ? `Selected: ${models.find((m) => m.uid === selectedUid)?.type ?? "model"} (uid ${selectedUid})`
                : "Click a model to select"}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["translate", "rotate", "scale"] as const).map((m) => {
                const active = tcMode === m && selectedUid !== null;
                return (
                  <button
                    key={m}
                    onClick={() => setTcMode(m)}
                    style={{
                      flex: 1, padding: "4px 0",
                      background: active ? "#c8f400" : "#242424",
                      color: active ? "#000" : "#aaa",
                      border: "1px solid #3a3a3a",
                      borderRadius: 5, cursor: "pointer", fontSize: 11,
                    }}
                  >
                    {m[0].toUpperCase() + m.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Precise position / rotation sliders for the selected object */}
          {(selectedUid !== null || wordmarkSelected) && (
            <div style={{ marginBottom: 12, borderTop: "1px solid #1e1e1e", paddingTop: 12 }}>
              {([
                { group: "Position", rows: [
                  { key: "px", label: "X", min: -25, max: 25, step: 0.1 },
                  { key: "py", label: "Y", min: -5,  max: 25, step: 0.1 },
                  { key: "pz", label: "Z", min: -60, max: 20, step: 0.1 },
                ] },
                { group: "Rotation", rows: [
                  { key: "rx", label: "rX", min: -Math.PI, max: Math.PI, step: 0.01 },
                  { key: "ry", label: "rY", min: -Math.PI, max: Math.PI, step: 0.01 },
                  { key: "rz", label: "rZ", min: -Math.PI, max: Math.PI, step: 0.01 },
                ] },
              ] as const).map(({ group, rows }) => (
                <div key={group} style={{ marginBottom: 8 }}>
                  <div style={{ color: "#777", marginBottom: 4, fontSize: 11 }}>{group}</div>
                  {rows.map(({ key, label, min, max, step }) => {
                    const value = xf[key as keyof typeof xf];
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 16, color: "#888" }}>{label}</span>
                        <input
                          type="range" min={min} max={max} step={step} value={value}
                          onChange={(e) => applyXf({ ...xf, [key]: parseFloat(e.target.value) })}
                          style={{ flex: 1, accentColor: "#c8f400", height: 14 }}
                        />
                        <span style={{ width: 40, textAlign: "right", color: "#c8f400", fontSize: 11 }}>
                          {value.toFixed(label.startsWith("r") ? 2 : 1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Add model */}
          <div style={{ marginBottom: 12, borderTop: "1px solid #1e1e1e", paddingTop: 12 }}>
            <div style={{ color: "#777", marginBottom: 6, fontSize: 11 }}>Spawn model:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {ADD_CATALOG.map(({ type }) => (
                <button
                  key={type}
                  onClick={() => addModel(type)}
                  style={{
                    padding: "3px 9px",
                    background: "#1e1e1e", color: "#ccc",
                    border: "1px solid #3a3a3a",
                    borderRadius: 4, cursor: "pointer", fontSize: 11,
                  }}
                >
                  + {type}
                </button>
              ))}
            </div>
          </div>

          {/* WattIf wordmark */}
          <div style={{ marginBottom: 12, borderTop: "1px solid #1e1e1e", paddingTop: 12 }}>
            <div style={{ color: "#777", marginBottom: 6, fontSize: 11 }}>
              WattIf wordmark{wordmarkSelected ? " ✓" : ""}
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {(["translate", "rotate", "scale"] as const).map((m) => {
                const active = wordmarkMode === m && wordmarkSelected;
                return (
                  <button
                    key={m}
                    onClick={() => { setWordmarkMode(m); selectWordmark(); }}
                    style={{
                      flex: 1, padding: "4px 0",
                      background: active ? "#c8f400" : "#242424",
                      color: active ? "#000" : "#aaa",
                      border: "1px solid #3a3a3a",
                      borderRadius: 5, cursor: "pointer", fontSize: 11,
                    }}
                  >
                    {m[0].toUpperCase() + m.slice(1)}
                  </button>
                );
              })}
            </div>
            <button
              onClick={selectWordmark}
              style={{
                width: "100%", padding: "4px",
                background: wordmarkSelected ? "#1a2200" : "#1e1e1e",
                color: wordmarkSelected ? "#c8f400" : "#777",
                border: `1px solid ${wordmarkSelected ? "#c8f400" : "#3a3a3a"}`,
                borderRadius: 4, cursor: "pointer", fontSize: 11,
              }}
            >
              {wordmarkSelected ? "Wordmark selected — drag gizmo" : "Click to select wordmark"}
            </button>
          </div>

          {/* Persist / copy layout */}
          <button
            onClick={saveToDevice}
            style={{
              width: "100%", padding: "9px",
              background: savedToDevice ? "#4ade80" : "#1e2e00",
              color: savedToDevice ? "#000" : "#c8f400",
              border: `1px solid ${savedToDevice ? "#4ade80" : "#c8f400"}`,
              borderRadius: 6,
              cursor: "pointer", fontWeight: 700, fontSize: 12,
              marginBottom: 6,
              transition: "background 0.3s, color 0.3s",
            }}
          >
            {savedToDevice ? "✓ Saved to device!" : "Save to Device"}
          </button>
          <button
            onClick={copyLayout}
            style={{
              width: "100%", padding: "9px",
              background: "#c8f400", color: "#000",
              border: "none", borderRadius: 6,
              cursor: "pointer", fontWeight: 700, fontSize: 12,
              marginBottom: 6,
            }}
          >
            Copy Layout JSON
          </button>
          <div style={{ color: "#444", fontSize: 10, textAlign: "center" }}>
            Save → normal scene reads layout · Copy → logs to console
          </div>
        </div>

        {/* Bottom hint */}
        <div
          style={{
            position: "absolute", bottom: 16, left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(10,10,10,0.75)",
            color: "#666", borderRadius: 8,
            padding: "5px 14px", fontSize: 11,
            whiteSpace: "nowrap", pointerEvents: "none",
          }}
        >
          Orbit: left-drag · Pan: right-drag · Zoom: scroll · Click model/wordmark to select
        </div>
      </Html>
    </>
  );
}

// ── Edit mode entry point ─────────────────────────────────────────────────────

export function SceneEdit() {
  if (!EDIT_MODE) return null;
  return <EditScene />;
}
