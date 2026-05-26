import { useRef, useMemo, useEffect, Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, useGLTF } from "@react-three/drei";
import { Vector3, MathUtils, Color, type Group, type Mesh } from "three";
import zonesRaw from "@/data/zonesFixture.json";

// Preload all models up-front so there's no hitch on the infra station
useGLTF.preload("/models/wind_turbine.glb");
useGLTF.preload("/models/solar_array.glb");
useGLTF.preload("/models/battery.glb");
useGLTF.preload("/models/microgrid_hub.glb");

// ── Toronto geo → 3D world coordinate helpers ──────────────────────────────
// Toronto lng: -79.65 → -79.10, lat: 43.57 → 43.86
const TORONTO_MID_LNG = -79.375;
const TORONTO_MID_LAT = 43.715;
const TORONTO_LNG_SPAN = 0.55;
const TORONTO_LAT_SPAN = 0.29;

function geoTo3D(lng: number, lat: number, spread = 1): [number, number] {
  const x = ((lng - TORONTO_MID_LNG) / (TORONTO_LNG_SPAN / 2)) * 12 * spread;
  const z = -((lat - TORONTO_MID_LAT) / (TORONTO_LAT_SPAN / 2)) * 7 * spread;
  return [x, z];
}

// ── Camera rig — drives camera along the Z-axis road ───────────────────────

export function CameraRig({ progress }: { progress: number }) {
  const { camera } = useThree();
  const tPos = useRef(new Vector3(0, 5, 20));
  const tLook = useRef(new Vector3(0, 1.5, 0));

  useFrame(() => {
    const p = progress;

    if (p < 0.55) {
      // Approach: drive forward toward the infrastructure row (hero → problem → demand)
      const d = p / 0.55;
      tPos.current.set(0, 5, MathUtils.lerp(20, -22, d));
      tLook.current.set(0, 1.5, MathUtils.lerp(0, -40, d));
    } else if (p < 0.75) {
      // Infrastructure: pan LEFT → RIGHT across the row (no fly-through, kept at distance)
      const d = (p - 0.55) / 0.2;
      tPos.current.set(MathUtils.lerp(-14, 14, d), 5, -22);
      tLook.current.set(MathUtils.lerp(-10, 10, d), 1.2, -40);
    } else if (p < 0.86) {
      // Settle back to centre and advance toward the siting coverage
      const d = (p - 0.75) / 0.11;
      tPos.current.set(MathUtils.lerp(14, 0, d), MathUtils.lerp(5, 6, d), MathUtils.lerp(-22, -50, d));
      tLook.current.set(MathUtils.lerp(10, 0, d), 1.2, -68);
    } else {
      // Lift to top-down for scope selection
      const l = (p - 0.86) / 0.14;
      tPos.current.set(0, MathUtils.lerp(6, 42, l), MathUtils.lerp(-50, -52, l));
      tLook.current.set(0, 0, MathUtils.lerp(-68, -52, l));
    }

    camera.position.lerp(tPos.current, 0.09);
    camera.lookAt(tLook.current);
    camera.updateProjectionMatrix();
  });

  return null;
}

// ── Lighting ─────────────────────────────────────────────────────────────────

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
      {/* Soft fill from opposite side */}
      <directionalLight position={[-8, 10, -8]} intensity={0.4} color="#f0f8ff" />
    </>
  );
}

// ── Floor: shadow receiver + infinite grid ────────────────────────────────────

function Floor() {
  return (
    <>
      {/* Shadow-receiving plane (invisible, just catches shadows) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -30]} receiveShadow>
        <planeGeometry args={[200, 160]} />
        <shadowMaterial transparent opacity={0.14} />
      </mesh>
      {/* The visible infinite grid — the "road" texture */}
      <Grid
        position={[0, 0, -30]}
        args={[200, 160]}
        cellSize={2}
        cellThickness={0.4}
        cellColor="#ebebeb"
        sectionSize={10}
        sectionThickness={0.8}
        sectionColor={new Color("#e0e0e0")}
        fadeDistance={55}
        fadeStrength={2.5}
        infiniteGrid
      />
    </>
  );
}

// ── Volt horizon line ─────────────────────────────────────────────────────────

function VoltHorizon() {
  return (
    <mesh position={[0, 0.8, -65]} rotation={[0, 0, 0]}>
      <planeGeometry args={[120, 0.025]} />
      <meshBasicMaterial color="#c8f400" transparent opacity={0.7} />
    </mesh>
  );
}

// ── GLB model loader with shadow support ──────────────────────────────────────

function GlbModel({
  url,
  position,
  scale = 1,
  rotateY = 0,
  visible = true,
}: {
  url: string;
  position: [number, number, number];
  scale?: number;
  rotateY?: number;
  visible?: boolean;
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

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * rotateY;
    }
  });

  if (!visible) return null;

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={cloned} />
    </group>
  );
}

// ── Hero station — big turbine rotating ──────────────────────────────────────

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

  // Find the rotor group after clone — stored in ref so useFrame can mutate it
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

  useFrame((_, delta) => {
    if (bladeRef.current) {
      bladeRef.current.rotation.z -= delta * 0.55;
    } else if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef} position={[3.5, 0, -1]} scale={3.2} castShadow>
      <primitive object={cloned} />
    </group>
  );
}

// ── Problem station — energy-burden zone markers ──────────────────────────────

type ZoneEntry = { id: string; name: string; centroid: [number, number]; demographics: { energyBurdenIndex: number } };

function ProblemStation({ progress }: { progress: number }) {
  const zones = zonesRaw as ZoneEntry[];
  // How "revealed" the markers are (0-1)
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
        <mesh
          key={i}
          position={[m.x, 0.25 * reveal, m.dz]}
          scale={reveal}
        >
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

// ── Demand station — stylized city blocks ─────────────────────────────────────

const BLOCKS: { x: number; w: number; d: number; h: number }[] = [
  { x: -5, w: 1.8, d: 1.8, h: 3.5 },
  { x: -3, w: 1.2, d: 1.5, h: 5.8 },
  { x: -1, w: 2, d: 1.8, h: 8.2 },
  { x: 1.5, w: 1.5, d: 1.5, h: 12 },
  { x: 3.5, w: 1.8, d: 2, h: 9 },
  { x: 5.5, w: 1.2, d: 1.2, h: 6.5 },
  { x: 7, w: 1, d: 1.2, h: 4 },
  { x: -7, w: 1.5, d: 1.5, h: 2.8 },
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
          <meshStandardMaterial
            color="#e8e8e8"
            roughness={0.6}
            metalness={0.05}
          />
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
      {p0 > 0.01 && (
        <GlbModel url="/models/solar_array.glb" position={[-11, 0, 0]} scale={1.3 * p0} />
      )}
      {p1 > 0.01 && (
        <GlbModel url="/models/wind_turbine.glb" position={[-4, 0, 0]} scale={1.7 * p1} rotateY={0.3} />
      )}
      {p2 > 0.01 && (
        <GlbModel url="/models/battery.glb" position={[3.5, 0, 0]} scale={1.1 * p2} />
      )}
      {p3 > 0.01 && (
        <GlbModel url="/models/microgrid_hub.glb" position={[10, 0, 0]} scale={1.4 * p3} />
      )}
    </group>
  );
}

// ── Volt siting coverage ──────────────────────────────────────────────────────

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
            <meshBasicMaterial
              color="#c8f400"
              transparent
              opacity={0.35 * reveal}
            />
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
      <fog attach="fog" args={["#ffffff", 14, 70]} />

      <Lights />
      <Floor />
      <VoltHorizon />
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
