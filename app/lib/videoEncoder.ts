/**
 * videoEncoder — tiered video export for LED grid recordings.
 *
 * Tier 1: WebCodecs API (hardware-accelerated, ~80% of users)
 *   Produces a WebM file with VP8/VP9 codec.
 *
 * Tier 2: MediaRecorder API (~97% of users)
 *   Replays frames on a canvas and captures via MediaRecorder.
 *   Lower control over quality, but universally supported.
 *
 * The caller doesn't need to know which tier is used — `encodeVideo()`
 * auto-detects and falls back as needed.
 */

// ── Types ────────────────────────────────────────────────

export interface VideoEncoderOptions {
  width: number;
  height: number;
  fps: number;
  /** Target bitrate in bits/second (default: 2Mbps) */
  bitrate?: number;
  /** Whether to enable alpha/transparent background */
  transparent?: boolean;
}

// ── WebM Muxer (minimal) ──────────────────────────────────
// The WebCodecs API gives us raw encoded chunks — we need to wrap
// them in a WebM container (EBML/Matroska) for browsers to play them.

/**
 * Minimal WebM muxer — writes a valid WebM file from VP8 encoded chunks.
 * This is enough to produce playable WebM files; it doesn't handle seeking.
 */
class SimpleWebMMuxer {
  private _chunks: Uint8Array[] = [];
  private _width: number;
  private _height: number;
  private _clusterData: Uint8Array[] = [];
  private _clusterTimestamp = 0;
  private _duration = 0;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
  }

  addChunk(chunk: EncodedVideoChunk | { data: Uint8Array; timestamp: number; type: string }): void {
    let data: Uint8Array;
    let timestamp: number;
    let isKey: boolean;

    if ('copyTo' in chunk) {
      data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      timestamp = chunk.timestamp;
      isKey = chunk.type === 'key';
    } else {
      data = chunk.data;
      timestamp = chunk.timestamp;
      isKey = chunk.type === 'key';
    }

    const timeMs = Math.round(timestamp / 1000); // ns → ms

    // Start a new cluster on keyframes
    if (isKey && this._clusterData.length > 0) {
      this._flushCluster();
    }

    if (this._clusterData.length === 0) {
      this._clusterTimestamp = timeMs;
    }

    const relTime = timeMs - this._clusterTimestamp;
    this._clusterData.push(this._makeSimpleBlock(data, relTime, isKey));
    this._duration = Math.max(this._duration, timeMs);
  }

  finish(): Blob {
    if (this._clusterData.length > 0) {
      this._flushCluster();
    }

    // Build EBML header + Segment
    const parts: Uint8Array[] = [];

    // EBML Header
    parts.push(this._ebmlHeader());

    // Segment (contains Tracks + Clusters)
    const segmentContent: Uint8Array[] = [];
    segmentContent.push(this._segmentInfo());
    segmentContent.push(this._tracks());
    segmentContent.push(...this._chunks);

    const segmentData = this._concat(segmentContent);
    parts.push(this._ebmlElement(0x18538067, segmentData)); // Segment

    const blobParts = parts.map((part) => {
      const copy = new Uint8Array(part.byteLength);
      copy.set(part);
      return copy.buffer;
    });
    return new Blob(blobParts, { type: "video/webm" });
  }

  private _flushCluster(): void {
    const clusterContent: Uint8Array[] = [];
    // Timecode
    clusterContent.push(this._ebmlElement(0xe7, this._encodeUint(this._clusterTimestamp)));
    clusterContent.push(...this._clusterData);

    this._chunks.push(this._ebmlElement(0x1f43b675, this._concat(clusterContent))); // Cluster
    this._clusterData = [];
  }

  private _makeSimpleBlock(data: Uint8Array, relTimeMs: number, isKey: boolean): Uint8Array {
    // SimpleBlock: [track number (1 byte)] [timecode (2 bytes)] [flags (1 byte)] [data]
    const header = new Uint8Array(4);
    header[0] = 0x81; // Track 1 (EBML-encoded)
    header[1] = (relTimeMs >> 8) & 0xff;
    header[2] = relTimeMs & 0xff;
    header[3] = isKey ? 0x80 : 0x00; // Keyframe flag

    const block = new Uint8Array(header.length + data.length);
    block.set(header);
    block.set(data, header.length);

    return this._ebmlElement(0xa3, block); // SimpleBlock
  }

  private _ebmlHeader(): Uint8Array {
    const content: Uint8Array[] = [];
    content.push(this._ebmlElement(0x4286, new Uint8Array([1]))); // EBMLVersion
    content.push(this._ebmlElement(0x42f7, new Uint8Array([1]))); // EBMLReadVersion
    content.push(this._ebmlElement(0x42f2, new Uint8Array([4]))); // EBMLMaxIDLength
    content.push(this._ebmlElement(0x42f3, new Uint8Array([8]))); // EBMLMaxSizeLength
    // DocType = "webm"
    content.push(this._ebmlElement(0x4282, new TextEncoder().encode("webm")));
    content.push(this._ebmlElement(0x4287, new Uint8Array([4]))); // DocTypeVersion
    content.push(this._ebmlElement(0x4285, new Uint8Array([2]))); // DocTypeReadVersion
    return this._ebmlElement(0x1a45dfa3, this._concat(content)); // EBML
  }

  private _segmentInfo(): Uint8Array {
    const content: Uint8Array[] = [];
    // TimecodeScale = 1000000 (1ms)
    content.push(this._ebmlElement(0x2ad7b1, this._encodeUint(1000000)));
    // MuxingApp
    content.push(this._ebmlElement(0x4d80, new TextEncoder().encode("Tenix")));
    // WritingApp
    content.push(this._ebmlElement(0x5741, new TextEncoder().encode("Tenix")));
    // Duration (float)
    content.push(this._ebmlElement(0x4489, this._encodeFloat64(this._duration)));
    return this._ebmlElement(0x1549a966, this._concat(content)); // Info
  }

  private _tracks(): Uint8Array {
    const trackContent: Uint8Array[] = [];
    // TrackNumber = 1
    trackContent.push(this._ebmlElement(0xd7, new Uint8Array([1])));
    // TrackUID = 1
    trackContent.push(this._ebmlElement(0x73c5, new Uint8Array([1])));
    // TrackType = 1 (video)
    trackContent.push(this._ebmlElement(0x83, new Uint8Array([1])));
    // CodecID = V_VP8
    trackContent.push(this._ebmlElement(0x86, new TextEncoder().encode("V_VP8")));

    // Video settings
    const videoContent: Uint8Array[] = [];
    videoContent.push(this._ebmlElement(0xb0, this._encodeUint(this._width))); // PixelWidth
    videoContent.push(this._ebmlElement(0xba, this._encodeUint(this._height))); // PixelHeight
    trackContent.push(this._ebmlElement(0xe0, this._concat(videoContent))); // Video

    const trackEntry = this._ebmlElement(0xae, this._concat(trackContent)); // TrackEntry
    return this._ebmlElement(0x1654ae6b, trackEntry); // Tracks
  }

  // ── EBML utility methods ────────────────────────────────

  private _ebmlElement(id: number, data: Uint8Array): Uint8Array {
    const idBytes = this._encodeEBMLId(id);
    const sizeBytes = this._encodeEBMLSize(data.length);
    const result = new Uint8Array(idBytes.length + sizeBytes.length + data.length);
    result.set(idBytes, 0);
    result.set(sizeBytes, idBytes.length);
    result.set(data, idBytes.length + sizeBytes.length);
    return result;
  }

  private _encodeEBMLId(id: number): Uint8Array {
    if (id <= 0xff) return new Uint8Array([id]);
    if (id <= 0xffff) return new Uint8Array([(id >> 8) & 0xff, id & 0xff]);
    if (id <= 0xffffff) return new Uint8Array([(id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
    return new Uint8Array([(id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]);
  }

  private _encodeEBMLSize(size: number): Uint8Array {
    if (size < 0x7f) return new Uint8Array([0x80 | size]);
    if (size < 0x3fff) return new Uint8Array([0x40 | ((size >> 8) & 0x3f), size & 0xff]);
    if (size < 0x1fffff) return new Uint8Array([0x20 | ((size >> 16) & 0x1f), (size >> 8) & 0xff, size & 0xff]);
    return new Uint8Array([
      0x10 | ((size >> 24) & 0x0f),
      (size >> 16) & 0xff,
      (size >> 8) & 0xff,
      size & 0xff,
    ]);
  }

  private _encodeUint(value: number): Uint8Array {
    if (value <= 0xff) return new Uint8Array([value]);
    if (value <= 0xffff) return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
    if (value <= 0xffffff) return new Uint8Array([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setUint32(0, value, false);
    return buf;
  }

  private _encodeFloat64(value: number): Uint8Array {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, value, false);
    return buf;
  }

  private _concat(arrays: Uint8Array[]): Uint8Array {
    let totalLen = 0;
    for (const a of arrays) totalLen += a.length;
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const a of arrays) {
      result.set(a, offset);
      offset += a.length;
    }
    return result;
  }
}

// ── Tier 1: WebCodecs ────────────────────────────────────

async function encodeWithWebCodecs(
  frames: { data: Uint8ClampedArray; width: number; height: number }[],
  options: VideoEncoderOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const muxer = new SimpleWebMMuxer(options.width, options.height);

  const encoder = new VideoEncoder({
    output: (chunk) => {
      muxer.addChunk(chunk);
    },
    error: (e) => {
      throw e;
    },
  });

  encoder.configure({
    codec: "vp8",
    width: options.width,
    height: options.height,
    bitrate: options.bitrate ?? 2_000_000,
    framerate: options.fps,
  });

  const frameDurationUs = Math.round(1_000_000 / options.fps);
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = options.width;
  frameCanvas.height = options.height;
  const frameCtx = frameCanvas.getContext("2d");
  if (!frameCtx) {
    throw new Error("Failed to create frame canvas for WebCodecs encoding");
  }

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];

    // Create RGBA ImageData
    const rgba = new Uint8ClampedArray(f.width * f.height * 4);
    for (let p = 0, r = 0; p < f.width * f.height; p++, r += 3) {
      const off = p * 4;
      rgba[off] = f.data[r];
      rgba[off + 1] = f.data[r + 1];
      rgba[off + 2] = f.data[r + 2];
      rgba[off + 3] = 255;
    }

    const imgData = new ImageData(rgba, f.width, f.height);
    frameCtx.putImageData(imgData, 0, 0);
    const vf = new VideoFrame(frameCanvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });

    const keyFrame = i % (options.fps * 2) === 0; // keyframe every 2 seconds
    encoder.encode(vf, { keyFrame });
    vf.close();

    onProgress?.(((i + 1) / frames.length) * 100);
  }

  await encoder.flush();
  encoder.close();

  return muxer.finish();
}

// ── Tier 2: MediaRecorder ────────────────────────────────

async function encodeWithMediaRecorder(
  frames: { data: Uint8ClampedArray; width: number; height: number }[],
  options: VideoEncoderOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  // Create an offscreen canvas to draw frames onto
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d")!;

  const stream = canvas.captureStream(0); // 0 = manual frame requests
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8",
    videoBitsPerSecond: options.bitrate ?? 2_000_000,
  });

  const recordedChunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(recordedChunks, { type: "video/webm" }));
    };
    mediaRecorder.onerror = () => {
      reject(new Error("MediaRecorder error"));
    };

    mediaRecorder.start();

    const frameInterval = 1000 / options.fps;
    let frameIdx = 0;

    const drawNext = () => {
      if (frameIdx >= frames.length) {
        mediaRecorder.stop();
        return;
      }

      const f = frames[frameIdx];
      const imgData = ctx.createImageData(f.width, f.height);
      for (let p = 0, r = 0; p < f.width * f.height; p++, r += 3) {
        const off = p * 4;
        imgData.data[off] = f.data[r];
        imgData.data[off + 1] = f.data[r + 1];
        imgData.data[off + 2] = f.data[r + 2];
        imgData.data[off + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      // For canvas.captureStream(0), we need to manually request a frame
      const track = stream.getVideoTracks()[0];
      if (track && "requestFrame" in track) {
        (track as { requestFrame(): void }).requestFrame();
      }

      frameIdx++;
      onProgress?.(((frameIdx) / frames.length) * 100);

      setTimeout(drawNext, frameInterval);
    };

    drawNext();
  });
}

// ── Auto-detect and export ───────────────────────────────

/** Check if WebCodecs VideoEncoder is available */
export function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

/** Check if MediaRecorder is available */
export function hasMediaRecorder(): boolean {
  return typeof MediaRecorder !== "undefined";
}

/**
 * Encode video frames using the best available method.
 *
 * @param frames Array of RGB frame data (flat Uint8ClampedArray, 3 bytes/pixel)
 * @param options Encoding options
 * @param onProgress Optional progress callback (0-100)
 * @returns WebM video Blob
 */
export async function encodeVideo(
  frames: { data: Uint8ClampedArray; width: number; height: number }[],
  options: VideoEncoderOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  if (hasWebCodecs()) {
    try {
      return await encodeWithWebCodecs(frames, options, onProgress);
    } catch {
      // Fall through to MediaRecorder
    }
  }

  if (hasMediaRecorder()) {
    return await encodeWithMediaRecorder(frames, options, onProgress);
  }

  throw new Error("No video encoding API available. Try exporting as GIF instead.");
}
