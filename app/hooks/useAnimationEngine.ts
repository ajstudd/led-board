import { useState, useRef, useEffect, useCallback } from "react";
import { AnimationManager, AnimationState } from "../lib/animation";
import { AnimationConfig } from "../types";

export const STORAGE_KEY_ANIM = "tenix-anim";

export function useAnimationEngine(
  onDrawFrame: () => void,
  onStateChange: (state: AnimationState) => void
) {
  const animRef = useRef<AnimationManager | null>(null);

  const [animState, setAnimState] = useState<AnimationState>("stopped");
  const [currentAnim, setCurrentAnim] = useState<AnimationConfig | null>(null);
  const [animFps, setAnimFps] = useState(15);
  const [animFrame, setAnimFrame] = useState(0);

  useEffect(() => {
    const mgr = new AnimationManager(
      onDrawFrame,
      (state) => {
        setAnimState(state);
        onStateChange(state);
      },
      (frame) => setAnimFrame(frame)
    );
    animRef.current = mgr;

    return () => {
      mgr.destroy();
    };
  }, [onDrawFrame, onStateChange]);

  const handleAnimPlay = useCallback(() => {
    animRef.current?.play();
  }, []);

  const handleAnimPause = useCallback(() => {
    animRef.current?.pause();
  }, []);

  const handleAnimFpsChange = useCallback((fps: number) => {
    setAnimFps(fps);
    animRef.current?.setFps(fps);
  }, []);

  return {
    animRef,
    animState,
    currentAnim,
    setCurrentAnim,
    animFps,
    setAnimFps,
    animFrame,
    setAnimFrame,
    handleAnimPlay,
    handleAnimPause,
    handleAnimFpsChange
  };
}
