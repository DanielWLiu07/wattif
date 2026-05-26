import { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, useGLTF } from "@react-three/drei";
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
    // Idle drift speed + journey boost when scrolling
    const speed = 3 + progress * 14;
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

// ── Hero station ──────────────────────────────────────────────────────────────

function HeroStation() {
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

  return (
    <group ref={groupRef} position={[3.5, fit.yBase, -1]} scale={fit.scale} castShadow>
      <primitive object={cloned} />
    </group>
  );
}

// ── Problem station ───────────────────────────────────────────────────────────

type ZoneEntry = { id: string; name: string; centroid: [number, number]; demographics: { energyBurdenIndex: number } };

function ProblemStation({ progress }: { progress: number }) {
  const zones = zonesRaw as ZoneEntry[];
  const reveal = MathUtils.clamp((progress - 0.14) / 0.16, 0, 1);

  const markers = useMemo(() =>
    zones.map((z) => {
      const [x, dz] = geoTo3D(z.centroid[0], z.centroid[1], 0.8);
      const burden = z.demographics.energyBurdenIndex;
      const isHigh = burden > 0.6;
      return { x, dz, isHigh, burden };
    }),
    [zones]
  );

  if (reveal < 0.01) return null;

  return (
    <group position={[0, 0, -14]}>
      {markers.map((m, i) => (
        <mesh key={i} position={[m.x, 0.25 * reveal, m.dz]} scale={reveal}>
          <sphereGeometry args={[m.isHigh ? 0.22 : 0.12, 6, 6]} />
          <meshStandardMaterial
            color={m.isHigh ? "#ef4444" : "#d0d0d0"}
            roughness={0.6}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
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

function DemandStation({ progress }: { progress: number }) {
  const reveal = MathUtils.clamp((progress - 0.34) / 0.16, 0, 1);
  const fade   = MathUtils.clamp((0.56 - progress) / 0.06, 0, 1);
  const vis    = reveal * fade;
  if (vis < 0.01) return null;

  return (
    <group position={[0, 0, -28]}>
      {BLOCKS.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, (b.h / 2) * vis, 0]}
          scale={[1, vis, 1]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#e8e8e8" roughness={0.6} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

// ── Infrastructure parade ─────────────────────────────────────────────────────

function InfraStation({ progress }: { progress: number }) {
  const p0 = MathUtils.clamp((progress - 0.5) / 0.08, 0, 1);
  const p1 = MathUtils.clamp((progress - 0.57) / 0.08, 0, 1);
  const p2 = MathUtils.clamp((progress - 0.64) / 0.08, 0, 1);
  const p3 = MathUtils.clamp((progress - 0.71) / 0.08, 0, 1);

  return (
    <group position={[0, 0, -40]}>
      <GlbModel url="/models/solar_array.glb"   position={[-11, 0, 0]} targetH={MODEL_HEIGHTS.solar}     reveal={ease(p0)} />
      <GlbModel url="/models/wind_turbine.glb"  position={[-4, 0, 0]}  targetH={MODEL_HEIGHTS.wind}      reveal={ease(p1)} rotateY={0.3} />
      <GlbModel url="/models/battery.glb"       position={[3.5, 0, 0]} targetH={MODEL_HEIGHTS.battery}   reveal={ease(p2)} />
      <GlbModel url="/models/microgrid_hub.glb" position={[10, 0, 0]}  targetH={MODEL_HEIGHTS.microgrid} reveal={ease(p3)} />
    </group>
  );
}

// ── Siting coverage ───────────────────────────────────────────────────────────

function SitingStation({ progress }: { progress: number }) {
  const zones = zonesRaw as ZoneEntry[];
  const covered = useMemo(() => zones.filter((_, i) => i % 3 === 0), [zones]);

  const reveal = MathUtils.clamp((progress - 0.7) / 0.15, 0, 1);
  if (reveal < 0.01) return null;

  return (
    <group position={[0, 0.05, -68]}>
      {covered.map((z, i) => {
        const [x, dz] = geoTo3D(z.centroid[0], z.centroid[1], 0.9);
        return (
          <mesh key={i} position={[x, 0, dz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.4, 1.4]} />
            <meshBasicMaterial color="#c8f400" transparent opacity={0.35 * reveal} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Main exported scene ───────────────────────────────────────────────────────

export function Scene3D({ progress }: { progress: number }) {
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
        <HeroStation />
        <ProblemStation progress={progress} />
        <DemandStation progress={progress} />
        <InfraStation progress={progress} />
        <SitingStation progress={progress} />
      </Suspense>
    </>
  );
}
