"use client";

import { useEffect, useRef } from "react";

// -- WASM/data assets served from jsDelivr (safe - binary, not JS) ------------
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/";

// Hysteresis band so pinch doesn't flicker at the threshold boundary
const PINCH_HYSTERESIS = 0.015;

export type GestureLoadState = "loading" | "ready" | "error";

// -- Props ---------------------------------------------------------------------
export interface GestureControllerProps {
    /** Video element that MediaPipe Camera reads from - rendered by the parent */
    videoRef: React.RefObject<HTMLVideoElement | null>;
    /** Normalised pinch threshold (0.03 - 0.15). */
    pinchThreshold: number;
    /**
     * Fired every frame: screen-pixel position of the gesture cursor.
     * Uses index-fingertip (open hand) or index+thumb midpoint (pinching).
     */
    onCursorMove: (x: number, y: number) => void;
    /**
     * Fired on pinch-start and every frame while pinching AND cursor has moved.
     * Equivalent to mousedown + mousemove-while-held. x/y are screen pixels.
     */
    onPinchAt: (x: number, y: number) => void;
    /** Fired once when the pinch is released (mouseup equivalent). */
    onPinchRelease: () => void;
    /**
     * Fired when a two-finger scroll gesture is detected.
     * delta > 0 -> scroll down, delta < 0 -> scroll up (in screen px).
     */
    onScroll: (delta: number) => void;
    /**
     * Fired when a "slap" gesture is detected (thumb spread away,
     * other 4 fingers straight and close together). Stops everything
     * and clears the board.
     */
    onSlapClear: () => void;
    /** Called whenever load/pinch state changes - drives the UI in the sidebar. */
    onStatusChange: (state: GestureLoadState, msg: string, pinching: boolean) => void;
}

// -- Component - renders nothing; all state lives in the sidebar ---------------
export default function GestureController({
    videoRef,
    pinchThreshold,
    onCursorMove,
    onPinchAt,
    onPinchRelease,
    onScroll,
    onSlapClear,
    onStatusChange,
}: GestureControllerProps) {
    // All callback props in refs so the MediaPipe closure never goes stale
    const threshRef = useRef(pinchThreshold);
    const moveRef = useRef(onCursorMove);
    const pinchAtRef = useRef(onPinchAt);
    const pinchReleaseRef = useRef(onPinchRelease);
    const scrollRef = useRef(onScroll);
    const statusRef = useRef(onStatusChange);

    useEffect(() => { threshRef.current = pinchThreshold; }, [pinchThreshold]);
    useEffect(() => { moveRef.current = onCursorMove; }, [onCursorMove]);
    useEffect(() => { pinchAtRef.current = onPinchAt; }, [onPinchAt]);
    useEffect(() => { pinchReleaseRef.current = onPinchRelease; }, [onPinchRelease]);
    useEffect(() => { scrollRef.current = onScroll; }, [onScroll]);
    const slapClearRef = useRef(onSlapClear);
    useEffect(() => { slapClearRef.current = onSlapClear; }, [onSlapClear]);
    useEffect(() => { statusRef.current = onStatusChange; }, [onStatusChange]);

    // Per-frame gesture state - all refs, zero React re-renders from here
    const wasPinchingRef = useRef(false);
    const lastPinchXRef = useRef(-1);
    const lastPinchYRef = useRef(-1);
    const lastScrollYRef = useRef<number | null>(null);

    // -- Slap gesture detection state --
    /** Consecutive frames slap pose has been held. */
    const slapFramesRef = useRef(0);
    /** Cooldown frames after slap fires (prevents re-trigger). */
    const slapCooldownRef = useRef(0);
    /** Number of consecutive slap frames required to trigger (≈0.4s at 30fps). */
    const SLAP_HOLD_FRAMES = 12;
    /** Cooldown after firing (≈2s at 30fps). */
    const SLAP_COOLDOWN = 60;

    // -- Open-hand swipe detection state --
    /** Previous wrist X position (normalised 0-1). */
    const swipePrevXRef = useRef<number | null>(null);
    /** Accumulated horizontal distance while swiping. */
    const swipeAccumRef = useRef(0);
    /** Cooldown frames after swipe fires. */
    const swipeCooldownRef = useRef(0);
    /** Min per-frame velocity (normalised) to count as movement. */
    const SWIPE_MIN_VEL = 0.04;
    /** Accumulated distance threshold to fire. */
    const SWIPE_DIST_THRESH = 0.25;
    /** Cooldown after firing (≈2s at 30fps). */
    const SWIPE_COOLDOWN = 60;

    // -- EMA smoothing for cursor position (reduces jitter) --
    // α close to 0 = very smooth but laggy; close to 1 = raw/responsive.
    const SMOOTH_ALPHA = 0.35;
    const smoothXRef = useRef<number | null>(null);
    const smoothYRef = useRef<number | null>(null);

    /** Apply exponential moving average; resets on first frame after hand loss. */
    const smooth = (raw: number, prev: number | null): number => {
        if (prev === null) return raw;
        return prev + SMOOTH_ALPHA * (raw - prev);
    };

    useEffect(() => {
        let active = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let cameraInst: any = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let handsInst: any = null;

        const run = async () => {
            try {
                statusRef.current("loading", "Loading MediaPipe...", false);

                const [{ Hands }, { Camera }] = await Promise.all([
                    import("@mediapipe/hands"),
                    import("@mediapipe/camera_utils"),
                ]);
                if (!active) return;

                statusRef.current("loading", "Starting camera...", false);

                handsInst = new Hands({
                    locateFile: (f: string) => `${WASM_BASE}${f}`,
                });
                handsInst.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.7,
                    minTrackingConfidence: 0.5,
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                handsInst.onResults((results: any) => {
                    if (!active) return;

                    // -- No hand visible --------------------------------------
                    if (!results.multiHandLandmarks?.length) {
                        if (wasPinchingRef.current) {
                            wasPinchingRef.current = false;
                            pinchReleaseRef.current();
                        }
                        lastScrollYRef.current = null;
                        lastPinchXRef.current = -1;
                        lastPinchYRef.current = -1;
                        // Reset smoothing so the cursor doesn't lerp from an old position
                        smoothXRef.current = null;
                        smoothYRef.current = null;
                        statusRef.current("ready", "Show hand to camera", false);
                        return;
                    }

                    const lm = results.multiHandLandmarks[0];
                    const indexTip = lm[8];   // index fingertip
                    const thumbTip = lm[4];   // thumb tip
                    const middleTip = lm[12];  // middle fingertip
                    const W = window.innerWidth;
                    const H = window.innerHeight;

                    // -- Slap gesture detection --------------------------------
                    // Slap = 4 fingers straight & close together, thumb spread away
                    // 1. Four fingers extended: each fingertip above its PIP joint
                    const indexStraight = lm[8].y < lm[6].y;
                    const middleStraight = lm[12].y < lm[10].y;
                    const ringStraight = lm[16].y < lm[14].y;
                    const pinkyStraight = lm[20].y < lm[18].y;
                    const fourStraight = indexStraight && middleStraight && ringStraight && pinkyStraight;

                    // 2. Four fingertips close together (small spread)
                    const fingerSpreadX = Math.max(
                        Math.abs(lm[8].x - lm[12].x),
                        Math.abs(lm[12].x - lm[16].x),
                        Math.abs(lm[16].x - lm[20].x),
                    );
                    const fingerSpreadY = Math.max(
                        Math.abs(lm[8].y - lm[12].y),
                        Math.abs(lm[12].y - lm[16].y),
                        Math.abs(lm[16].y - lm[20].y),
                    );
                    const fingersTight = fingerSpreadX < 0.09 && fingerSpreadY < 0.09;

                    // 3. Thumb is spread away from the index finger
                    const thumbToIndex = Math.hypot(
                        lm[4].x - lm[8].x,
                        lm[4].y - lm[8].y,
                    );
                    // Also check thumb is away from palm center (lm[9] = middle MCP)
                    const thumbToPalm = Math.hypot(
                        lm[4].x - lm[9].x,
                        lm[4].y - lm[9].y,
                    );
                    const thumbSpread = thumbToIndex > 0.12 && thumbToPalm > 0.10;

                    const isSlap = fourStraight && fingersTight && thumbSpread;

                    if (slapCooldownRef.current > 0) {
                        slapCooldownRef.current--;
                    }

                    if (isSlap && slapCooldownRef.current === 0) {
                        slapFramesRef.current++;
                        if (slapFramesRef.current >= SLAP_HOLD_FRAMES) {
                            // SLAP DETECTED — fire clear callback
                            slapClearRef.current();
                            slapFramesRef.current = 0;
                            slapCooldownRef.current = SLAP_COOLDOWN;
                            if (wasPinchingRef.current) {
                                wasPinchingRef.current = false;
                                pinchReleaseRef.current();
                            }
                            statusRef.current("ready", "🫲 Slap! Board cleared", false);
                            return;
                        }
                        // Show countdown while holding slap pose
                        const remaining = SLAP_HOLD_FRAMES - slapFramesRef.current;
                        statusRef.current("ready", `🫲 Hold slap... ${remaining}`, false);
                        return;
                    } else if (!isSlap) {
                        slapFramesRef.current = 0;
                    }

                    // -- Open-hand swipe detection ----------------------------
                    // 5 fingers extended (including thumb), slightly apart, hand moving L/R
                    const thumbExtended = thumbTip.y < lm[2].y;
                    const fiveExtended = fourStraight && thumbExtended;
                    // Fingers slightly apart: adjacent tips spaced > 0.03 apart
                    const slightSpread =
                        fingerSpreadX > 0.03 || fingerSpreadY > 0.03;
                    const isOpenHand = fiveExtended && slightSpread;

                    if (swipeCooldownRef.current > 0) {
                        swipeCooldownRef.current--;
                    }

                    if (isOpenHand && swipeCooldownRef.current === 0) {
                        const wristX = lm[0].x;
                        if (swipePrevXRef.current !== null) {
                            const dx = Math.abs(wristX - swipePrevXRef.current);
                            if (dx >= SWIPE_MIN_VEL) {
                                swipeAccumRef.current += dx;
                            } else {
                                // Slow / stationary — decay
                                swipeAccumRef.current *= 0.6;
                            }
                            if (swipeAccumRef.current >= SWIPE_DIST_THRESH) {
                                // SWIPE DETECTED — fire clear
                                slapClearRef.current();
                                swipeAccumRef.current = 0;
                                swipeCooldownRef.current = SWIPE_COOLDOWN;
                                swipePrevXRef.current = null;
                                if (wasPinchingRef.current) {
                                    wasPinchingRef.current = false;
                                    pinchReleaseRef.current();
                                }
                                statusRef.current("ready", "👋 Swipe! Board cleared", false);
                                return;
                            }
                        }
                        swipePrevXRef.current = wristX;
                    } else {
                        swipePrevXRef.current = null;
                        swipeAccumRef.current = 0;
                    }

                    // -- Two-finger scroll (index + middle up, ring + pinky curled) --
                    const indexUp = indexTip.y < lm[5].y;
                    const middleUp = middleTip.y < lm[9].y;
                    const ringDown = lm[16].y > lm[13].y;
                    const pinkyDown = lm[20].y > lm[17].y;
                    const isTwoFinger = indexUp && middleUp && ringDown && pinkyDown;

                    if (isTwoFinger) {
                        if (wasPinchingRef.current) {
                            wasPinchingRef.current = false;
                            pinchReleaseRef.current();
                        }
                        const midY = (indexTip.y + middleTip.y) / 2;
                        if (lastScrollYRef.current !== null) {
                            // Negate: fingers sweeping up → positive delta (scroll content down)
                            const dy = -(midY - lastScrollYRef.current) * H * 10;
                            if (Math.abs(dy) > 0.5) scrollRef.current(dy);
                        }
                        lastScrollYRef.current = midY;
                        const midX = 1 - (indexTip.x + middleTip.x) / 2;
                        // Smooth the scroll-mode cursor too
                        const sx = smooth(midX * W, smoothXRef.current);
                        const sy = smooth(midY * H, smoothYRef.current);
                        smoothXRef.current = sx;
                        smoothYRef.current = sy;
                        moveRef.current(sx, sy);
                        statusRef.current("ready", "Scrolling...", false);
                        return;
                    } else {
                        lastScrollYRef.current = null;
                    }

                    // -- Pinch detection with hysteresis ---------------------
                    const dist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                    const thresh = threshRef.current;
                    const isPinch = wasPinchingRef.current
                        ? dist < thresh + PINCH_HYSTERESIS
                        : dist < thresh - PINCH_HYSTERESIS;

                    // -- Screen-pixel cursor position -------------------------
                    const rawX = isPinch ? 1 - (indexTip.x + thumbTip.x) / 2 : 1 - indexTip.x;
                    const rawY = isPinch ? (indexTip.y + thumbTip.y) / 2 : indexTip.y;
                    // Apply EMA smoothing to reduce frame-to-frame jitter
                    const screenX = smooth(rawX * W, smoothXRef.current);
                    const screenY = smooth(rawY * H, smoothYRef.current);
                    smoothXRef.current = screenX;
                    smoothYRef.current = screenY;

                    moveRef.current(screenX, screenY);

                    // -- Mouse-like event model -------------------------------
                    const moved = Math.abs(screenX - lastPinchXRef.current) > 1
                        || Math.abs(screenY - lastPinchYRef.current) > 1;

                    if (isPinch) {
                        if (!wasPinchingRef.current || moved) {
                            pinchAtRef.current(screenX, screenY);
                        }
                    } else if (wasPinchingRef.current) {
                        pinchReleaseRef.current();
                    }

                    wasPinchingRef.current = isPinch;
                    lastPinchXRef.current = screenX;
                    lastPinchYRef.current = screenY;
                    statusRef.current("ready", isPinch ? "Pinching..." : "Gesture active", isPinch);
                });

                const video = videoRef.current;
                if (!video || !active) return;

                cameraInst = new Camera(video, {
                    onFrame: async () => {
                        if (handsInst && active) await handsInst.send({ image: video });
                    },
                    width: 320,
                    height: 240,
                });

                await cameraInst.start();
                if (active) statusRef.current("ready", "Show hand to camera", false);

            } catch (err) {
                if (active) {
                    statusRef.current(
                        "error",
                        err instanceof Error ? err.message : "Initialisation failed",
                        false,
                    );
                }
            }
        };

        run();

        return () => {
            active = false;
            try { cameraInst?.stop(); } catch { /* ignore */ }
            try { handsInst?.close(); } catch { /* ignore */ }
        };
        // videoRef is a stable useRef - only run once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null; // all UI lives in the sidebar
}
