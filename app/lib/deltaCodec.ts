/**
 * deltaCodec — pure utility functions for delta-encoding grid frame data.
 *
 * Instead of storing a full copy of every frame (cols × rows × 3 bytes),
 * delta compression stores only the cells that *changed* since the previous
 * frame.  A recording that is mostly static (e.g. an LED sign with an
 * occasional ripple effect) can shrink by 80-95%.
 *
 * Two primitives:
 *  1. `encodeDelta(prev, curr)` — compares two full frames, returns the
 *     list of changed cell indices and their new RGB values.
 *  2. `applyDelta(target, indices, values)` — patches a full frame buffer
 *     in-place with the given delta.
 *
 * All buffers use the project's standard flat-RGB layout:
 *   index = (row * cols + col) * 3;   // offset into Uint8ClampedArray
 *   data[index]   = R
 *   data[index+1] = G
 *   data[index+2] = B
 */

// ── Types ────────────────────────────────────────────────

export interface DeltaResult {
  /** Flat cell indices that changed (NOT byte offsets — cell index = row*cols+col) */
  changedIndices: Uint32Array;
  /** RGB values for each changed cell (length = changedIndices.length * 3) */
  changedValues: Uint8ClampedArray;
}

// ── Encoding ─────────────────────────────────────────────

/**
 * Compare two full-frame buffers and return only the cells that differ.
 *
 * Both `prev` and `curr` must be the same length (cols * rows * 3).
 * Returns empty arrays when the frames are identical.
 */
export function encodeDelta(
  prev: Uint8ClampedArray,
  curr: Uint8ClampedArray,
): DeltaResult {
  const totalCells = (curr.length / 3) | 0;

  // First pass: count changed cells so we can pre-allocate exact sizes.
  // This avoids push-based dynamic arrays which would trigger GC pressure
  // on every capture tick.
  let changeCount = 0;
  for (let i = 0; i < totalCells; i++) {
    const off = i * 3;
    if (
      prev[off] !== curr[off] ||
      prev[off + 1] !== curr[off + 1] ||
      prev[off + 2] !== curr[off + 2]
    ) {
      changeCount++;
    }
  }

  const changedIndices = new Uint32Array(changeCount);
  const changedValues = new Uint8ClampedArray(changeCount * 3);

  // Second pass: collect the actual data.
  let ptr = 0;
  for (let i = 0; i < totalCells; i++) {
    const off = i * 3;
    if (
      prev[off] !== curr[off] ||
      prev[off + 1] !== curr[off + 1] ||
      prev[off + 2] !== curr[off + 2]
    ) {
      changedIndices[ptr] = i;
      const vOff = ptr * 3;
      changedValues[vOff] = curr[off];
      changedValues[vOff + 1] = curr[off + 1];
      changedValues[vOff + 2] = curr[off + 2];
      ptr++;
    }
  }

  return { changedIndices, changedValues };
}

// ── Decoding ─────────────────────────────────────────────

/**
 * Patch a full-frame buffer in-place with a set of changed cells.
 *
 * `target` is mutated directly — the caller should maintain a persistent
 * "reconstructed frame" buffer and apply deltas sequentially to it.
 */
export function applyDelta(
  target: Uint8ClampedArray,
  changedIndices: Uint32Array,
  changedValues: Uint8ClampedArray,
): void {
  const count = changedIndices.length;
  for (let i = 0; i < count; i++) {
    const cellIdx = changedIndices[i];
    const tOff = cellIdx * 3;
    const vOff = i * 3;
    target[tOff] = changedValues[vOff];
    target[tOff + 1] = changedValues[vOff + 1];
    target[tOff + 2] = changedValues[vOff + 2];
  }
}

// ── Serialisation helpers ────────────────────────────────

/**
 * Pack a delta into a single contiguous Uint8Array for efficient storage
 * in the recording file format.
 *
 * Layout:
 *   [4 bytes: change count (uint32 LE)]
 *   [changeCount × 4 bytes: cell indices (uint32 LE each)]
 *   [changeCount × 3 bytes: RGB values]
 */
export function packDelta(delta: DeltaResult): Uint8Array {
  const count = delta.changedIndices.length;
  // 4 (count header) + count*4 (indices) + count*3 (values)
  const buf = new Uint8Array(4 + count * 4 + count * 3);
  const view = new DataView(buf.buffer);

  // Header
  view.setUint32(0, count, true);

  // Indices
  let offset = 4;
  for (let i = 0; i < count; i++) {
    view.setUint32(offset, delta.changedIndices[i], true);
    offset += 4;
  }

  // Values
  buf.set(delta.changedValues, offset);

  return buf;
}

/**
 * Unpack a delta from the binary format produced by `packDelta`.
 */
export function unpackDelta(packed: Uint8Array, byteOffset = 0): DeltaResult {
  const view = new DataView(packed.buffer, packed.byteOffset + byteOffset);
  const count = view.getUint32(0, true);

  const changedIndices = new Uint32Array(count);
  let offset = 4;
  for (let i = 0; i < count; i++) {
    changedIndices[i] = view.getUint32(offset, true);
    offset += 4;
  }

  const changedValues = new Uint8ClampedArray(
    packed.buffer,
    packed.byteOffset + byteOffset + offset,
    count * 3,
  );

  return { changedIndices, changedValues };
}

/**
 * Calculate the byte size of a packed delta for a given change count.
 */
export function packedDeltaSize(changeCount: number): number {
  return 4 + changeCount * 4 + changeCount * 3;
}
