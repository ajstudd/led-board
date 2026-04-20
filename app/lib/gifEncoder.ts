/**
 * gifEncoder — zero-dependency GIF89a encoder for LED grid animations.
 *
 * Produces standard GIF files with:
 *  - Median-cut color quantization (256-color palette per frame)
 *  - LZW compression
 *  - Configurable loop count (0 = infinite)
 *  - Optional transparency (key out a specific color)
 *
 * Designed for pixel-grid content where:
 *  - Frames are small (typically <300×200 px)
 *  - Color count is usually low (LED grids rarely use >64 unique colors)
 *  - Speed matters more on short recordings, quality on long ones
 */

// ── Types ────────────────────────────────────────────────

export interface GifEncoderOptions {
  width: number;
  height: number;
  /** Delay between frames in ms (converted to centiseconds for GIF) */
  delay: number;
  /** 0 = infinite loop, 1 = play once, N = play N times */
  loop?: number;
  /** If set, pixels matching this RGB color become transparent */
  transparentColor?: [number, number, number];
}

// ── GIF Encoder ──────────────────────────────────────────

export class GifEncoder {
  private _width: number;
  private _height: number;
  private _delay: number;
  private _loop: number;
  private _transparentColor: [number, number, number] | null;
  private _chunks: Uint8Array[] = [];
  private _frameCount = 0;

  constructor(options: GifEncoderOptions) {
    this._width = options.width;
    this._height = options.height;
    this._delay = Math.max(1, Math.round(options.delay / 10)); // ms → centiseconds
    this._loop = options.loop ?? 0;
    this._transparentColor = options.transparentColor ?? null;

    this._writeHeader();
    this._writeNetscapeExt();
  }

  /** Add a frame from RGBA pixel data (4 bytes per pixel) */
  addFrame(rgba: Uint8ClampedArray | Uint8Array): void {
    const pixels = this._width * this._height;
    if (rgba.length < pixels * 4) {
      throw new Error(`Expected ${pixels * 4} bytes, got ${rgba.length}`);
    }

    // Quantize to 256 colors
    const { palette, indices, transparentIndex } = this._quantize(rgba);

    // Write Graphic Control Extension (for delay + transparency)
    this._writeGCE(transparentIndex);

    // Write Image Descriptor
    this._writeImageDescriptor();

    // Write Local Color Table
    this._writePalette(palette);

    // Write LZW-compressed pixel data
    this._writeLZW(indices, Math.max(2, Math.ceil(Math.log2(palette.length / 3))));

    this._frameCount++;
  }

  /** Finish the GIF and return the complete file as a Blob */
  finish(): Blob {
    // GIF trailer
    this._chunks.push(new Uint8Array([0x3b]));
    const parts = this._chunks.map((chunk) => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    });
    return new Blob(parts, { type: "image/gif" });
  }

  // ── Header ─────────────────────────────────────────────

  private _writeHeader(): void {
    const buf = new Uint8Array(13);
    // Signature + Version
    buf[0] = 0x47; buf[1] = 0x49; buf[2] = 0x46; // GIF
    buf[3] = 0x38; buf[4] = 0x39; buf[5] = 0x61; // 89a

    // Logical Screen Descriptor
    buf[6] = this._width & 0xff;
    buf[7] = (this._width >> 8) & 0xff;
    buf[8] = this._height & 0xff;
    buf[9] = (this._height >> 8) & 0xff;
    buf[10] = 0x00; // No global color table
    buf[11] = 0x00; // Background color index
    buf[12] = 0x00; // Pixel aspect ratio

    this._chunks.push(buf);
  }

  private _writeNetscapeExt(): void {
    // NETSCAPE2.0 application extension for looping
    const buf = new Uint8Array(19);
    buf[0] = 0x21;  // Extension Introducer
    buf[1] = 0xff;  // Application Extension
    buf[2] = 0x0b;  // Block Size
    // "NETSCAPE2.0"
    const ns = "NETSCAPE2.0";
    for (let i = 0; i < 11; i++) buf[3 + i] = ns.charCodeAt(i);
    buf[14] = 0x03; // Sub-block size
    buf[15] = 0x01; // Sub-block ID
    buf[16] = this._loop & 0xff;
    buf[17] = (this._loop >> 8) & 0xff;
    buf[18] = 0x00; // Block terminator

    this._chunks.push(buf);
  }

  // ── Per-Frame ──────────────────────────────────────────

  private _writeGCE(transparentIndex: number): void {
    const buf = new Uint8Array(8);
    buf[0] = 0x21; // Extension Introducer
    buf[1] = 0xf9; // Graphic Control Label
    buf[2] = 0x04; // Block Size
    // Packed: disposal=0, user input=0, transparent flag
    buf[3] = transparentIndex >= 0 ? 0x01 : 0x00;
    buf[4] = this._delay & 0xff;
    buf[5] = (this._delay >> 8) & 0xff;
    buf[6] = transparentIndex >= 0 ? transparentIndex : 0x00;
    buf[7] = 0x00; // Block terminator

    this._chunks.push(buf);
  }

  private _writeImageDescriptor(): void {
    const buf = new Uint8Array(10);
    buf[0] = 0x2c; // Image Separator
    // Left, Top = 0, 0
    buf[1] = 0; buf[2] = 0;
    buf[3] = 0; buf[4] = 0;
    // Width, Height
    buf[5] = this._width & 0xff;
    buf[6] = (this._width >> 8) & 0xff;
    buf[7] = this._height & 0xff;
    buf[8] = (this._height >> 8) & 0xff;
    // Packed: local color table flag=1, interlace=0, size=7 (2^(7+1)=256 colors)
    buf[9] = 0x87; // 10000111

    this._chunks.push(buf);
  }

  private _writePalette(palette: Uint8Array): void {
    // 256 colors × 3 bytes = 768 bytes (pad to 256 entries if less)
    const padded = new Uint8Array(768);
    padded.set(palette.subarray(0, Math.min(palette.length, 768)));
    this._chunks.push(padded);
  }

  // ── Color Quantization (Median Cut) ────────────────────

  private _quantize(rgba: Uint8ClampedArray | Uint8Array): {
    palette: Uint8Array;
    indices: Uint8Array;
    transparentIndex: number;
  } {
    const pixels = this._width * this._height;
    const tc = this._transparentColor;

    // Collect unique colors (skip transparent pixels)
    const colorMap = new Map<number, number>(); // packed RGB → count
    for (let i = 0; i < pixels; i++) {
      const off = i * 4;
      const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2], a = rgba[off + 3];
      if (a < 128) continue; // Skip transparent/semi-transparent
      if (tc && r === tc[0] && g === tc[1] && b === tc[2]) continue;
      const key = (r << 16) | (g << 8) | b;
      colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
    }

    // If <= 255 unique colors (common for LED grids), use them directly
    const maxColors = tc ? 255 : 256;
    let paletteRGB: number[];

    if (colorMap.size <= maxColors) {
      paletteRGB = Array.from(colorMap.keys());
    } else {
      // Median cut quantization
      paletteRGB = this._medianCut(colorMap, maxColors);
    }

    // Build palette bytes and lookup
    const palette = new Uint8Array(768); // 256 * 3
    const paletteLookup = new Map<number, number>(); // packed RGB → index

    let transparentIndex = -1;
    let pIdx = 0;

    // Reserve index 0 for transparent if needed
    if (tc) {
      palette[0] = tc[0];
      palette[1] = tc[1];
      palette[2] = tc[2];
      transparentIndex = 0;
      pIdx = 1;
    }

    for (const rgb of paletteRGB) {
      if (pIdx >= 256) break;
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = rgb & 0xff;
      const off = pIdx * 3;
      palette[off] = r;
      palette[off + 1] = g;
      palette[off + 2] = b;
      paletteLookup.set(rgb, pIdx);
      pIdx++;
    }

    // Map each pixel to the nearest palette index
    const indices = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      const off = i * 4;
      const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2], a = rgba[off + 3];

      if (a < 128 || (tc && r === tc[0] && g === tc[1] && b === tc[2])) {
        indices[i] = transparentIndex >= 0 ? transparentIndex : 0;
        continue;
      }

      const key = (r << 16) | (g << 8) | b;
      const exact = paletteLookup.get(key);
      if (exact !== undefined) {
        indices[i] = exact;
      } else {
        // Find nearest color in palette
        indices[i] = this._nearestColor(r, g, b, palette, pIdx, tc ? 1 : 0);
      }
    }

    return { palette, indices, transparentIndex };
  }

  /** Median-cut color quantization — splits color space recursively */
  private _medianCut(
    colorMap: Map<number, number>,
    maxColors: number,
  ): number[] {
    interface ColorBox {
      colors: number[]; // packed RGB values
      counts: number[]; // corresponding counts
    }

    // Initial box with all colors
    const allColors = Array.from(colorMap.keys());
    const allCounts = allColors.map((c) => colorMap.get(c)!);
    const boxes: ColorBox[] = [{ colors: allColors, counts: allCounts }];

    while (boxes.length < maxColors) {
      // Find the box with the widest range to split
      let bestBoxIdx = 0;
      let bestRange = 0;
      let bestChannel = 0;

      for (let bi = 0; bi < boxes.length; bi++) {
        const box = boxes[bi];
        if (box.colors.length <= 1) continue;

        for (let ch = 0; ch < 3; ch++) {
          const shift = (2 - ch) * 8;
          let mn = 255, mx = 0;
          for (const c of box.colors) {
            const v = (c >> shift) & 0xff;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          const range = mx - mn;
          if (range > bestRange) {
            bestRange = range;
            bestBoxIdx = bi;
            bestChannel = ch;
          }
        }
      }

      if (bestRange === 0) break;

      // Split the selected box along the selected channel
      const box = boxes[bestBoxIdx];
      const shift = (2 - bestChannel) * 8;

      // Sort by the selected channel
      const paired = box.colors.map((c, i) => ({ c, cnt: box.counts[i] }));
      paired.sort((a, b) => ((a.c >> shift) & 0xff) - ((b.c >> shift) & 0xff));

      const mid = Math.floor(paired.length / 2);
      const boxA: ColorBox = {
        colors: paired.slice(0, mid).map((p) => p.c),
        counts: paired.slice(0, mid).map((p) => p.cnt),
      };
      const boxB: ColorBox = {
        colors: paired.slice(mid).map((p) => p.c),
        counts: paired.slice(mid).map((p) => p.cnt),
      };

      boxes.splice(bestBoxIdx, 1, boxA, boxB);
    }

    // Average each box to get the palette color
    return boxes.map((box) => {
      let tr = 0, tg = 0, tb = 0, total = 0;
      for (let i = 0; i < box.colors.length; i++) {
        const c = box.colors[i];
        const cnt = box.counts[i];
        tr += ((c >> 16) & 0xff) * cnt;
        tg += ((c >> 8) & 0xff) * cnt;
        tb += (c & 0xff) * cnt;
        total += cnt;
      }
      if (total === 0) return 0;
      const r = Math.round(tr / total);
      const g = Math.round(tg / total);
      const b = Math.round(tb / total);
      return (r << 16) | (g << 8) | b;
    });
  }

  /** Find nearest color in palette (Euclidean distance in RGB) */
  private _nearestColor(
    r: number, g: number, b: number,
    palette: Uint8Array,
    paletteSize: number,
    startIdx: number,
  ): number {
    let bestIdx = startIdx;
    let bestDist = Infinity;
    for (let i = startIdx; i < paletteSize; i++) {
      const off = i * 3;
      const dr = r - palette[off];
      const dg = g - palette[off + 1];
      const db = b - palette[off + 2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        if (dist === 0) break;
      }
    }
    return bestIdx;
  }

  // ── LZW Compression ────────────────────────────────────

  private _writeLZW(indices: Uint8Array, minCodeSize: number): void {
    const codeSize = Math.max(2, minCodeSize);

    // LZW Minimum Code Size
    this._chunks.push(new Uint8Array([codeSize]));

    const clearCode = 1 << codeSize;
    const eoiCode = clearCode + 1;

    // Output buffer (sub-blocks of max 255 bytes)
    const output: number[] = [];
    let bitBuf = 0;
    let bitPos = 0;

    let currentBitWidth = codeSize + 1;
    const maxCode = 4095; // 12-bit max

    const emit = (code: number) => {
      bitBuf |= code << bitPos;
      bitPos += currentBitWidth;
      while (bitPos >= 8) {
        output.push(bitBuf & 0xff);
        bitBuf >>= 8;
        bitPos -= 8;
      }
    };

    // Initialize code table
    let nextCode = eoiCode + 1;
    const table = new Map<string, number>();

    const resetTable = () => {
      table.clear();
      for (let i = 0; i < clearCode; i++) {
        table.set(String(i), i);
      }
      nextCode = eoiCode + 1;
      currentBitWidth = codeSize + 1;
    };

    // Start with clear code
    emit(clearCode);
    resetTable();

    let prev = String(indices[0]);

    for (let i = 1; i < indices.length; i++) {
      const curr = prev + "," + indices[i];
      if (table.has(curr)) {
        prev = curr;
      } else {
        // Emit code for prev
        emit(table.get(prev)!);

        // Add new code
        if (nextCode <= maxCode) {
          table.set(curr, nextCode);
          nextCode++;
          // Increase bit width if needed
          if (nextCode > (1 << currentBitWidth) && currentBitWidth < 12) {
            currentBitWidth++;
          }
        } else {
          // Table full — emit clear code and reset
          emit(clearCode);
          resetTable();
        }

        prev = String(indices[i]);
      }
    }

    // Emit the last code
    if (prev.length > 0) {
      emit(table.get(prev)!);
    }

    // End of Information
    emit(eoiCode);

    // Flush remaining bits
    if (bitPos > 0) {
      output.push(bitBuf & 0xff);
    }

    // Write as GIF sub-blocks (max 255 bytes each)
    let pos = 0;
    while (pos < output.length) {
      const blockSize = Math.min(255, output.length - pos);
      const block = new Uint8Array(blockSize + 1);
      block[0] = blockSize;
      for (let i = 0; i < blockSize; i++) {
        block[i + 1] = output[pos + i];
      }
      this._chunks.push(block);
      pos += blockSize;
    }

    // Block terminator
    this._chunks.push(new Uint8Array([0x00]));
  }
}
