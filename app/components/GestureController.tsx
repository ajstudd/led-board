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
    useEffect(() => { statusRef.current = onStatusChange; }, [onStatusChange]);

    // Per-frame gesture state - all refs, zero React re-renders from here
    const wasPinchingRef = useRef(false);
    const lastPinchXRef = useRef(-1);
    const lastPinchYRef = useRef(-1);
    const lastScrollYRef = useRef<number | null>(null);

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
