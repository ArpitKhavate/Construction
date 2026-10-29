"use client";

import type { AgentId, RunRecord } from "@/lib/types";
import { ContactShadows } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The five research agents drawn as a crew of glossy characters, one per agent card.
// Each one's state comes from the run: queued, working, done (with a hop) or gap (a shrug).

export type CrewState = "queued" | "working" | "done" | "gap";
type Prop = "hardhat" | "umbrella" | "stamp" | "toolbelt" | "magnifier";
type Member = { name: string; role: string; color: string; prop: Prop };

const CREW: Record<AgentId, Member> = {
  codes: { name: "Zoney", role: "Zoning and codes", color: "#f2c230", prop: "hardhat" },
  hazards: { name: "Levee", role: "Flood and hazards", color: "#3c8fd9", prop: "umbrella" },
  permits: { name: "Stamp", role: "Permit history", color: "#e0582a", prop: "stamp" },
  development: { name: "Foreman", role: "Filing path", color: "#1f9e8f", prop: "toolbelt" },
  environmental: { name: "Fern", role: "Creeks and trees", color: "#5aa845", prop: "magnifier" },
};

const GAP = 14;
const { damp } = THREE.MathUtils;

// What each agent turned up, for the "!" marks and the line under its name.
function finding(run: RunRecord, id: AgentId): { found: boolean; line: string } {
  const f = run.field;
  switch (id) {
    case "codes":
      return { found: Boolean(f.zoning), line: f.zoning ? `Zoned ${f.zoning}` : "Zoning missing" };
    case "hazards": {
      const wet = [f.fema, f.coaFlood, f.nearFlood].some((check) => check.state === "hit");
      return { found: wet, line: wet ? "Flood zone found" : "No flood zone" };
    }
    case "permits":
      return {
        found: f.permits.length > 0,
        line: f.permits.length ? `${f.permits.length} permits nearby` : "No permits nearby",
      };
    case "development":
      return { found: false, line: "Next steps ready" };
    case "environmental": {
      const wet = f.creek.state === "hit";
      return { found: wet, line: wet ? "Creek nearby" : "No creek nearby" };
    }
  }
}

export function Crew({ run, shown }: { run: RunRecord; shown: number }) {
  const members = run.steps.map((step, index) => {
    const state: CrewState =
      index < shown ? (step.status === "gap" ? "gap" : "done") : index === shown ? "working" : "queued";
    return { id: step.id, ...CREW[step.id], state, ...finding(run, step.id) };
  });

  return (
    <section className="crew" aria-label="The research crew">
      <div className="crew-row">
        {members.map((member) => (
          <div key={member.id} className={`crew-card is-${member.state}`}>
            {member.state === "done" ? (
              <span className="crew-badge ok" aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : member.state === "gap" ? (
              <span className="crew-badge gap" aria-hidden="true">!</span>
            ) : null}
          </div>
        ))}
        <Stage members={members} />
      </div>
      <div className="crew-row crew-labels">
        {members.map((member) => (
          <div key={member.id}>
            <b>{member.name}</b>
            <span>{member.role}</span>
            <em aria-live="polite">
              {member.state === "queued"
                ? "Waiting"
                : member.state === "working"
                  ? "Reading the city layers…"
                  : member.state === "gap"
                    ? "Some layers did not answer"
                    : member.line}
            </em>
          </div>
        ))}
      </div>
    </section>
  );
}

// Shown over the map while the agents run, before the results page exists.
export function CrewOverlay({ place }: { place: string }) {
  const members = (Object.keys(CREW) as AgentId[]).map((id) => ({
    id,
    ...CREW[id],
    state: "working" as CrewState,
    found: false,
  }));
  return (
    <div className="crew-overlay" role="status">
      <div className="crew-sheet">
        <p className="kicker">Five agents on it</p>
        <h2>Reading Austin&apos;s city layers for {place}</h2>
        <div className="crew-row">
          {members.map((member) => (
            <div key={member.id} className="crew-card is-working" />
          ))}
          <Stage members={members} />
        </div>
        <div className="crew-row crew-labels">
          {members.map((member) => (
            <div key={member.id}>
              <b>{member.name}</b>
              <span>{member.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stage({ members }: { members: RowMember[] }) {
  return (
    <div className="crew-stage" aria-hidden="true">
      <Canvas orthographic flat dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 3, 10], zoom: 60 }}>
        <Studio />
        <ambientLight intensity={0.3} />
        <directionalLight position={[-3, 6, 7]} intensity={1.25} />
        <directionalLight position={[4, 2, -3]} intensity={0.5} color="#cfe8ff" />
        <Row members={members} />
      </Canvas>
    </div>
  );
}

// Offline studio lighting for the glossy clear-coat look, with no HDR download.
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

type RowMember = Member & { id: AgentId; state: CrewState; found: boolean };

// Lines each character up with its HTML card: 1 world unit = `zoom` pixels.
function Row({ members }: { members: RowMember[] }) {
  const { size, camera } = useThree();
  const count = members.length;
  const col = (size.width - GAP * (count - 1)) / count;
  const zoom = Math.min(64, col / 2.7);

  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.zoom = zoom;
    ortho.position.set(0, 1.2 + 3, 10);
    ortho.lookAt(0, 1.2, 0);
    ortho.updateProjectionMatrix();
  }, [camera, zoom]);

  return (
    <>
      {members.map((member, index) => {
        const centerPx = index * (col + GAP) + col / 2 - size.width / 2;
        return <Agent key={member.id} member={member} x={centerPx / zoom} seed={index * 1.7} />;
      })}
      <ContactShadows position={[0, 0.001, 0]} scale={[size.width / zoom, 3]} blur={2.6} far={2.4} opacity={0.5} color="#25404f" resolution={512} />
    </>
  );
}

// ---------- shared geometry ----------

let eggCache: THREE.LatheGeometry | null = null;
// Gumdrop: wide at the base, narrower and round on top, 1.92 units tall with its base at y = 0.
function egg() {
  if (eggCache) return eggCache;
  const points: THREE.Vector2[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI;
    const y = -Math.cos(t);
    const radius = Math.pow(Math.sin(t), 0.8) * 0.86 * (1 - 0.22 * y);
    points.push(new THREE.Vector2(radius, (y + 1) * 0.96));
  }
  eggCache = new THREE.LatheGeometry(points, 72);
  return eggCache;
}

function clay(color: string) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
}

// ---------- one character ----------

function Agent({ member, x, seed }: { member: RowMember; x: number; seed: number }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Group>(null);
  const ticks = useRef<THREE.Group>(null);
  const sweat = useRef<THREE.Mesh>(null);
  const canopy = useRef<THREE.Group>(null);
  const stamp = useRef<THREE.Group>(null);

  const skin = useMemo(() => clay(member.color), [member.color]);
  const ink = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: "#16161c", roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    [],
  );

  // Smoothed values, so every pose change eases instead of snapping.
  const live = useRef({ y: 0, sy: 1, tiltX: 0, tiltZ: 0, lid: 0.15, eyeY: 0, eyeX: 0, arm: 0, glow: 0.2, open: 0 });
  const last = useRef<{ state: CrewState; at: number }>({ state: member.state, at: -10 });

  useFrame((three, delta) => {
    const now = three.clock.elapsedTime;
    const t = now + seed;
    if (last.current.state !== member.state) last.current = { state: member.state, at: now };
    const age = now - last.current.at;
    const s = member.state;
    const dt = Math.min(delta, 1 / 20);

    let y = 0;
    let sy = 1 + Math.sin(t * 2.2) * 0.022;
    let tiltX = 0;
    let tiltZ = Math.sin(t * 1.1) * 0.035;
    let lidAngle = 0.15;
    let eyeY = 0;
    let eyeX = 0;
    let arm = 0;
    let glow = 0.15;
    let snap = 10;

    if (s === "working") {
      sy = 1 + Math.sin(t * 15) * 0.014;
      y = Math.abs(Math.sin(t * 7.5)) * 0.025;
      tiltX = 0.16 + Math.sin(t * 2.4) * 0.03;
      tiltZ = Math.sin(t * 1.7) * 0.05;
      lidAngle = 1.62;
      eyeY = -0.05;
      eyeX = Math.sin(t * 1.3) * 0.04;
      arm = 1;
      glow = 0.75 + Math.sin(t * 9) * 0.15;
    }

    if (s === "done") {
      lidAngle = 1.62;
      glow = 0.35;
      // Hop: squash down, stretch up into the air, squash on landing, settle.
      if (age < 0.12) {
        sy = 1 - 0.2 * (age / 0.12);
        snap = 40;
      } else if (age < 0.54) {
        const p = (age - 0.12) / 0.42;
        y = 1.8 * p * (1 - p) * 0.5;
        sy = 1 + 0.16 * Math.cos(p * Math.PI) * (p < 0.5 ? 1 : 0.4);
        snap = 40;
      } else if (age < 0.76) {
        const q = (age - 0.54) / 0.22;
        sy = 1 - 0.16 * Math.sin(q * Math.PI);
        snap = 40;
      }
      eyeY = 0.03;
    }

    if (s === "gap") {
      lidAngle = 1.62;
      tiltZ = Math.sin(t * 1.6) * 0.07;
      eyeX = Math.sin(t * 0.9) * 0.06;
      arm = -1;
    }

    const v = live.current;
    v.y = damp(v.y, y, snap, dt);
    v.sy = damp(v.sy, sy, snap, dt);
    v.tiltX = damp(v.tiltX, tiltX, 6, dt);
    v.tiltZ = damp(v.tiltZ, tiltZ, 6, dt);
    v.lid = damp(v.lid, lidAngle, 7, dt);
    v.eyeY = damp(v.eyeY, eyeY, 8, dt);
    v.eyeX = damp(v.eyeX, eyeX, 8, dt);
    v.arm = damp(v.arm, arm, 6, dt);
    v.glow = damp(v.glow, glow, 6, dt);

    if (root.current) root.current.position.y = v.y;
    if (body.current) {
      const wide = 1 / Math.sqrt(v.sy);
      body.current.scale.set(wide, v.sy, wide);
      body.current.rotation.set(v.tiltX, 0, v.tiltZ);
    }
    if (eyes.current) {
      const blink = (t % 4.3) < 0.11 ? 0.12 : 1;
      eyes.current.position.set(v.eyeX, v.eyeY, 0);
      eyes.current.scale.y = damp(eyes.current.scale.y, blink, 30, dt);
    }
    if (lid.current) lid.current.rotation.x = v.lid;
    if (screen.current) screen.current.emissiveIntensity = v.glow;

    // Arms trail the body: typing taps when working, a shrug when there is a gap.
    const tap = v.arm > 0 ? v.arm : 0;
    const shrug = v.arm < 0 ? -v.arm : 0;
    if (armL.current) {
      armL.current.position.y = 0.6 + Math.max(0, Math.sin(t * 16)) * 0.04 * tap + shrug * 0.12;
      armL.current.rotation.z = 0.5 + shrug * 0.5;
    }
    if (armR.current) {
      armR.current.position.y = 0.6 + Math.max(0, Math.sin(t * 16 + Math.PI)) * 0.04 * tap + shrug * 0.12;
      armR.current.rotation.z = -0.5 - shrug * 0.5;
    }

    // Sparkles burst on the hop, then keep a slow twinkle.
    if (sparks.current) {
      const on = s === "done" ? 1 : 0;
      sparks.current.children.forEach((spark, index) => {
        const burst = s === "done" && age < 0.9 ? 1 + Math.sin(Math.min(age / 0.9, 1) * Math.PI) * 0.8 : 1;
        const twinkle = 0.75 + Math.sin(t * 3 + index * 2.1) * 0.25;
        const target = on * twinkle * burst;
        spark.scale.setScalar(damp(spark.scale.x, target, 10, dt));
        spark.rotation.z += dt * 0.8;
      });
    }

    // "!" marks when the agent found something real.
    if (ticks.current) {
      const target = s === "done" && member.found ? 1 + Math.sin(t * 5) * 0.08 : 0;
      ticks.current.scale.setScalar(damp(ticks.current.scale.x, target, 9, dt));
    }

    if (sweat.current) {
      const cycle = (t * 0.6) % 1;
      sweat.current.visible = s === "gap";
      sweat.current.position.y = 1.48 - cycle * 0.3;
      sweat.current.scale.setScalar(cycle < 0.85 ? 1 : (1 - cycle) / 0.15);
    }

    // Levee's umbrella pops open on a flood hit.
    if (canopy.current) {
      const open = s === "done" && member.found ? 1 : 0;
      v.open = damp(v.open, open, 9, dt);
      canopy.current.scale.setScalar(v.open);
    }

    // Stamp's stamp thumps while working.
    if (stamp.current) {
      const thump = s === "working" ? Math.max(0, Math.sin(t * 6)) * 0.22 : 0;
      stamp.current.position.y = damp(stamp.current.position.y, thump, 18, dt);
    }
  });

  return (
    <group position={[x, 0, 0]} rotation={[0, 0.32, 0]}>
      <group ref={root}>
        <group ref={body}>
          <mesh geometry={egg()} material={skin} />

          {/* eyes */}
          <group ref={eyes}>
            {[-0.2, 0.2].map((ex) => (
              <group key={ex} position={[ex, 1.27, 0.73]} rotation={[0, ex * 0.6, 0]}>
                <mesh material={ink} scale={[0.82, 1.4, 0.45]}>
                  <sphereGeometry args={[0.11, 24, 16]} />
                </mesh>
                <mesh position={[0.025, 0.05, 0.04]}>
                  <sphereGeometry args={[0.022, 12, 8]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </group>
            ))}
          </group>

          {/* arms */}
          <group ref={armL} position={[-0.42, 0.6, 0.98]} rotation={[1.2, 0, 0.5]}>
            <mesh material={skin}>
              <capsuleGeometry args={[0.14, 0.22, 8, 16]} />
            </mesh>
          </group>
          <group ref={armR} position={[0.42, 0.6, 0.98]} rotation={[1.2, 0, -0.5]}>
            <mesh material={skin}>
              <capsuleGeometry args={[0.14, 0.22, 8, 16]} />
            </mesh>
          </group>

          <Laptop lid={lid} screen={screen} />
          <PropFor prop={member.prop} canopy={canopy} stamp={stamp} />

          {/* sweat drop for a gap */}
          <mesh ref={sweat} position={[0.6, 1.45, 0.45]} visible={false}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshPhysicalMaterial color="#8fd0ff" roughness={0.05} clearcoat={1} transparent opacity={0.85} />
          </mesh>
        </group>

        {/* sparkles */}
        <group ref={sparks}>
          {[
            [0.88, 1.95, 0.2, 0.12],
            [-0.92, 1.5, 0.3, 0.08],
            [1.02, 1.1, 0.1, 0.06],
          ].map(([sx, sy, sz, r], index) => (
            <mesh key={index} position={[sx, sy, sz]} scale={0}>
              <octahedronGeometry args={[r, 0]} />
              <meshBasicMaterial color="#fff3b0" />
            </mesh>
          ))}
        </group>

        {/* "!" marks */}
        <group ref={ticks} position={[0.62, 2.05, 0.3]} scale={0}>
          {[-0.5, 0, 0.5].map((angle) => (
            <mesh key={angle} rotation={[0, 0, -angle]} position={[Math.sin(angle) * 0.28, Math.cos(angle) * 0.28, 0]}>
              <capsuleGeometry args={[0.035, 0.16, 4, 8]} />
              <meshBasicMaterial color="#ffb020" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

function Laptop({
  lid,
  screen,
}: {
  lid: React.RefObject<THREE.Group | null>;
  screen: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const shell = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: "#e9ecef", metalness: 0.25, roughness: 0.3, clearcoat: 0.6 }),
    [],
  );
  return (
    <group position={[0, 0.52, 0.96]} rotation={[0.12, 0, 0]}>
      <mesh material={shell}>
        <boxGeometry args={[0.8, 0.04, 0.48]} />
      </mesh>
      {/* the lid hinges at the edge away from the character, so its back faces the viewer */}
      <group ref={lid} position={[0, 0.02, 0.24]} rotation={[0.15, 0, 0]}>
        <group position={[0, 0, -0.24]}>
          <mesh material={shell}>
            <boxGeometry args={[0.8, 0.03, 0.48]} />
          </mesh>
          <mesh position={[0, -0.018, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.72, 0.4]} />
            <meshStandardMaterial ref={screen} color="#bfe6ff" emissive="#9fd8ff" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, 0.017, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.05, 24]} />
            <meshBasicMaterial color="#aab2bb" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function PropFor({
  prop,
  canopy,
  stamp,
}: {
  prop: Prop;
  canopy: React.RefObject<THREE.Group | null>;
  stamp: React.RefObject<THREE.Group | null>;
}) {
  if (prop === "hardhat") {
    return (
      <group position={[0, 1.7, 0]}>
        <mesh>
          <sphereGeometry args={[0.5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#f07a1f" roughness={0.3} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
        <mesh position={[0, 0.01, 0.08]}>
          <cylinderGeometry args={[0.6, 0.62, 0.05, 40]} />
          <meshPhysicalMaterial color="#f07a1f" roughness={0.3} clearcoat={1} />
        </mesh>
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.5, 0.035, 10, 40]} />
          <meshPhysicalMaterial color="#d9661a" roughness={0.3} clearcoat={1} />
        </mesh>
      </group>
    );
  }

  if (prop === "umbrella") {
    return (
      <>
        <group position={[0, 1.68, 0]} rotation={[-0.12, 0, 0]}>
          <mesh>
            <sphereGeometry args={[0.46, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color="#f2c230" roughness={0.3} clearcoat={1} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.5, 0.68, 0.12, 40, 1, true]} />
            <meshPhysicalMaterial color="#f2c230" roughness={0.3} clearcoat={1} side={THREE.DoubleSide} />
          </mesh>
        </group>
      <group ref={canopy} position={[0.86, 0.45, 0.1]} rotation={[0, 0, -0.18]} scale={0}>
        <mesh position={[0, 0.85, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 1.7, 10]} />
          <meshStandardMaterial color="#34342f" />
        </mesh>
        <mesh position={[0.08, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.08, 0.025, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#34342f" />
        </mesh>
        <mesh position={[0, 1.62, 0]} scale={[1, 0.45, 1]}>
          <sphereGeometry args={[0.7, 8, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#e0582a" roughness={0.35} clearcoat={0.8} flatShading side={THREE.DoubleSide} />
        </mesh>
      </group>
      </>
    );
  }

  if (prop === "stamp") {
    return (
      <group position={[-1.05, 0, 0.5]}>
        <mesh position={[0, 0.012, 0]}>
          <boxGeometry args={[0.5, 0.02, 0.38]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <group ref={stamp}>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.3, 0.1, 0.22]} />
            <meshPhysicalMaterial color="#7a4a25" roughness={0.5} clearcoat={0.4} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.28, 0.03, 0.2]} />
            <meshStandardMaterial color="#c2541f" />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.22, 16]} />
            <meshPhysicalMaterial color="#7a4a25" roughness={0.5} clearcoat={0.4} />
          </mesh>
          <mesh position={[0, 0.41, 0]}>
            <sphereGeometry args={[0.11, 24, 16]} />
            <meshPhysicalMaterial color="#c2541f" roughness={0.3} clearcoat={1} />
          </mesh>
        </group>
      </group>
    );
  }

  if (prop === "toolbelt") {
    return (
      <group>
        <mesh position={[0, 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.92, 0.07, 12, 64]} />
          <meshPhysicalMaterial color="#7a4a25" roughness={0.55} clearcoat={0.3} />
        </mesh>
        <mesh position={[0, 0.36, 0.98]}>
          <boxGeometry args={[0.2, 0.15, 0.05]} />
          <meshStandardMaterial color="#e0b44a" metalness={0.6} roughness={0.3} />
        </mesh>
        <group position={[0.9, 0.2, 0.35]} rotation={[0, 0, 0.15]}>
          <mesh>
            <cylinderGeometry args={[0.035, 0.035, 0.45, 10]} />
            <meshStandardMaterial color="#a8763e" />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.24, 0.08, 0.08]} />
            <meshStandardMaterial color="#5a5d63" metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group>
      {/* sprout */}
      <group position={[0, 1.89, 0]}>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.02, 0.025, 0.16, 8]} />
          <meshStandardMaterial color="#2f7a3a" />
        </mesh>
        <mesh position={[0.1, 0.18, 0]} rotation={[0, 0, -0.6]} scale={[1, 0.45, 0.25]}>
          <sphereGeometry args={[0.13, 16, 12]} />
          <meshPhysicalMaterial color="#3d9a4a" roughness={0.35} clearcoat={0.8} />
        </mesh>
      </group>
      {/* magnifier */}
      <group position={[-0.95, 0.85, 0.6]} rotation={[0, 0.4, 0.5]}>
        <mesh>
          <torusGeometry args={[0.24, 0.04, 12, 40]} />
          <meshPhysicalMaterial color="#34342f" roughness={0.3} clearcoat={1} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.22, 32]} />
          <meshPhysicalMaterial color="#d8f1ff" roughness={0.05} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.42, 0]}>
          <cylinderGeometry args={[0.04, 0.045, 0.36, 12]} />
          <meshPhysicalMaterial color="#7a4a25" roughness={0.5} clearcoat={0.4} />
        </mesh>
      </group>
    </group>
  );
}
