import { useState, useRef, useCallback, RefObject } from "react";
import { GestureLoadState } from "../components/GestureController";

export interface UseGesturesConfig {
  onCursorMove: (cols: number, rows: number) => void;
  onPinchAt: (x: number, y: number) => void;
  onPinchRelease: () => void;
  onScroll: (delta: number) => void;
  onSwipeClear: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}

export function useGestures({
  onCursorMove,
  onPinchAt,
  onPinchRelease,
  onScroll,
  onSwipeClear,
  panelRef,
}: UseGesturesConfig) {
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [gestureLoadState, setGestureLoadState] = useState<GestureLoadState>("loading");
  const [gestureStatusMsg, setGestureStatusMsg] = useState("");
  const [gesturePinching, setGesturePinching] = useState(false);
  const [gesturePinchThreshold, setGesturePinchThreshold] = useState(0.08);
  const [gestureShowCamera, setGestureShowCamera] = useState(true);
  const [gestureCursorScreen, setGestureCursorScreen] = useState<{ x: number, y: number } | null>(null);
  const [gestureDrawing, setGestureDrawing] = useState(false);
  
  const gestureVideoRef = useRef<HTMLVideoElement>(null);

  const handleGestureStatus = useCallback(
    (state: GestureLoadState, msg: string, pinching: boolean) => {
      setGestureLoadState(state);
      setGestureStatusMsg(msg);
      setGesturePinching(pinching);
    },
    [],
  );

  const handleToggleGesture = useCallback(() => {
    setGestureEnabled((prev) => {
      if (prev) {
        setGestureCursorScreen(null);
        setGestureDrawing(false);
      }
      return !prev;
    });
  }, []);

  const handleGesturePinchThresholdChange = useCallback((v: number) => {
    setGesturePinchThreshold(v);
  }, []);

  const handleGestureCursorMove = useCallback((x: number, y: number) => {
    setGestureCursorScreen({ x, y });
    onCursorMove(x, y);
  }, [onCursorMove]);

  const handleGesturePinchAt = useCallback(
    (x: number, y: number) => {
      setGestureDrawing(true);
      // See if they pinched over a UI panel button
      if (panelRef.current) {
        const rect = panelRef.current.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          const els = document.elementsFromPoint(x, y);
          const clickable = els.find(
            (el) =>
              el.tagName === "BUTTON" ||
              el.tagName === "INPUT" ||
              el.hasAttribute("data-gesture-clickable"),
          ) as HTMLElement;
          if (clickable) {
            clickable.click();
          }
          return;
        }
      }
      onPinchAt(x, y);
    },
    [onPinchAt, panelRef],
  );

  return {
    // State
    gestureEnabled,
    gestureLoadState,
    gestureStatusMsg,
    gesturePinching,
    gesturePinchThreshold,
    gestureShowCamera,
    gestureCursorScreen,
    gestureDrawing,
    // Refs
    gestureVideoRef,
    // Methods
    setGestureEnabled,
    setGestureLoadState,
    setGestureStatusMsg,
    setGesturePinching,
    setGesturePinchThreshold,
    setGestureShowCamera,
    setGestureCursorScreen,
    setGestureDrawing,
    handleGestureStatus,
    handleToggleGesture,
    handleGesturePinchThresholdChange,
    handleGestureCursorMove,
    handleGesturePinchAt,
    handleGesturePinchRelease: onPinchRelease,
    handleGestureScroll: onScroll,
    handleGestureSwipeClear: onSwipeClear,
  };
}
