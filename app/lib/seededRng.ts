let activeSeed = Date.now() >>> 0;
let generator = createMulberry32(activeSeed);

function createMulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let n = Math.imul(t ^ (t >>> 15), t | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeed(): number {
  return (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
}

export function setSeed(seed: number): void {
  activeSeed = seed >>> 0;
  generator = createMulberry32(activeSeed);
}

export function getSeed(): number {
  return activeSeed >>> 0;
}

export function random(): number {
  return generator();
}

export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(random() * maxExclusive);
}

export function randomRange(min: number, max: number): number {
  return min + random() * (max - min);
}
