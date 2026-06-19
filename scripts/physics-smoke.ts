/**
 * Physics core smoke + determinism test.
 *
 * No test framework needed — compile with tsc and run with node:
 *   npm run test:physics
 *
 * Verifies:
 *   1. Determinism: identical seed + inputs ⇒ byte-identical particle state.
 *   2. Seeds matter: different seeds ⇒ different state (RNG is actually used).
 *   3. pixelize/rasterize round-trips a static scene.
 *   4. gravityDrop is stable: particles fall, settle in bounds, no NaN.
 */
import { PhysicsWorld, explode, scatter, gravityDrop, BodyType } from "../app/lib/physics/index";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failures++;
  }
}

/** A 20×20 grid with a lit 6×6 block in the middle. */
function makeGrid(cols = 20, rows = 20) {
  const data = new Uint8ClampedArray(cols * rows * 3);
  for (let r = 7; r < 13; r++) {
    for (let c = 7; c < 13; c++) {
      const i = (r * cols + c) * 3;
      data[i] = 200; data[i + 1] = 80; data[i + 2] = 240;
    }
  }
  return { data, cols, rows };
}

function snapshot(world: PhysicsWorld): string {
  return world.particles
    .map((p) => `${p.position.x.toFixed(6)},${p.position.y.toFixed(6)},${p.velocity.x.toFixed(6)},${p.velocity.y.toFixed(6)}`)
    .join("|");
}

function run(seed: number, preset: "explode" | "scatter", steps: number): string {
  const { data, cols, rows } = makeGrid();
  const world = new PhysicsWorld({ seed });
  world.pixelize(data, cols, rows);
  if (preset === "explode") explode(world);
  else scatter(world);
  for (let i = 0; i < steps; i++) world.step(1 / 60);
  return snapshot(world);
}

console.log("Physics core smoke test\n");

// 1. Determinism — same seed, same inputs
const a1 = run(1234, "explode", 120);
const a2 = run(1234, "explode", 120);
check("determinism: same seed ⇒ identical explode result", a1 === a2);

const s1 = run(99, "scatter", 60);
const s2 = run(99, "scatter", 60);
check("determinism: same seed ⇒ identical scatter result", s1 === s2);

// 2. Different seeds diverge (proves RNG is wired in)
const d1 = run(1, "scatter", 60);
const d2 = run(2, "scatter", 60);
check("seeds matter: different seed ⇒ different scatter result", d1 !== d2);

// 3. pixelize / rasterize round-trip on a static scene
{
  const { data, cols, rows } = makeGrid();
  const world = new PhysicsWorld({ seed: 7 });
  const litBefore = data.reduce((acc, _v, i) => (i % 3 === 0 && (data[i] || data[i + 1] || data[i + 2]) ? acc + 1 : acc), 0);
  const count = world.pixelize(data, cols, rows);
  check("pixelize: particle count equals lit cell count", count === litBefore && count === 36);

  // make all bodies static so nothing moves, then rasterize back
  for (const p of world.particles) { p.type = BodyType.Static; p.inverseMass = 0; }
  const out = new Uint8ClampedArray(cols * rows * 3);
  world.rasterizeTo(out, cols, rows);
  let same = true;
  for (let i = 0; i < data.length; i++) if (data[i] !== out[i]) { same = false; break; }
  check("rasterize: static scene round-trips to the same grid", same);
}

// 4. gravityDrop stability — fall, settle, no NaN
{
  const { data, cols, rows } = makeGrid();
  const world = new PhysicsWorld({ seed: 3 });
  world.pixelize(data, cols, rows);
  const startY = world.particles.reduce((s, p) => s + p.position.y, 0) / world.particles.length;
  gravityDrop(world);
  for (let i = 0; i < 600; i++) world.step(1 / 60);
  const endY = world.particles.reduce((s, p) => s + p.position.y, 0) / world.particles.length;
  const anyNaN = world.particles.some((p) => !Number.isFinite(p.position.x) || !Number.isFinite(p.position.y));
  const inBounds = world.particles.every((p) => p.position.y >= 0 && p.position.y <= rows && p.position.x >= 0 && p.position.x <= cols);
  check("gravityDrop: pixels moved downward", endY > startY);
  check("gravityDrop: no NaN positions", !anyNaN);
  check("gravityDrop: all pixels settled within bounds", inBounds);
}

console.log(`\n${failures === 0 ? "ALL PASSED ✅" : `${failures} FAILED ❌`}`);
process.exit(failures === 0 ? 0 : 1);
