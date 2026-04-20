import { useState, useRef, useCallback } from "react";
import { SessionRecorder, RecordingState, sessionRecorder } from "../lib/sessionRecorder";

export interface UseSessionRecordingConfig {
  getGridData: () => Uint8ClampedArray | null;
  onRedraw: () => void;
  onClearRecordingExt: () => void;
}

export function useSessionRecording({ getGridData, onRedraw, onClearRecordingExt }: UseSessionRecordingConfig) {
  const sessionRecRef = useRef<SessionRecorder>(sessionRecorder);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recFrameCount, setRecFrameCount] = useState(0);
  const [recDuration, setRecDuration] = useState(0);
  const [recPlaybackFrame, setRecPlaybackFrame] = useState(0);
  const [recHasRecording, setRecHasRecording] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const configureRecorder = useCallback((cols: number, rows: number) => {
    const rec = sessionRecRef.current;
    rec.configure({
      cols,
      rows,
      captureFps: 30,
      getGridData,
      setGridData: () => {
         // handled by event emission now, we should let LEDBoard just re-render, 
         // wait! LEDBoard handled this manually in useEffect. 
         // For hooks, we can pass it in via config.
      },
      redraw: onRedraw,
      onStateChange: (state) => {
        setRecordingState(state);
        setRecHasRecording(rec.frameCount > 0);
        setRecFrameCount(rec.frameCount);
        setRecDuration(rec.duration);
      },
      onPlaybackFrame: (frame, total) => {
        setRecPlaybackFrame(frame);
        setRecFrameCount(total);
        setRecDuration(rec.duration);
      },
    });
  }, [getGridData, onRedraw]);

  // Expose these as pure functions first
  const handleStartRecording = useCallback(() => sessionRecRef.current.startRecording(), []);
  const handleStopRecording = useCallback(() => sessionRecRef.current.stopRecording(), []);
  
  const handleStartPlayback = useCallback(() => sessionRecRef.current.startPlayback(loopEnabled), [loopEnabled]);
  const handlePausePlayback = useCallback(() => sessionRecRef.current.pausePlayback(), []);
  const handleStopPlayback = useCallback(() => sessionRecRef.current.stopPlayback(), []);
  
  const handleToggleLoop = useCallback(() => {
    setLoopEnabled((prev) => {
      const next = !prev;
      sessionRecRef.current.setLooping(next);
      return next;
    });
  }, []);

  const handleExportRecording = useCallback(() => sessionRecRef.current.downloadRecording(), []);
  
  const handleImportRecording = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sessionRecRef.current.loadFromFileInput(file)
      .then(() => setRecHasRecording(sessionRecRef.current.frameCount > 0))
      .catch((err) => alert("Failed to import recording: " + err.message));
    e.target.value = "";
  }, []);

  const handleClearRecording = useCallback(() => {
    sessionRecRef.current.clear();
    setRecHasRecording(false);
    onClearRecordingExt();
  }, [onClearRecordingExt]);

  return {
    sessionRecRef,
    recordingState,
    recFrameCount,
    recDuration,
    recPlaybackFrame,
    recHasRecording,
    loopEnabled,
    setRecordingState,
    setRecFrameCount,
    setRecDuration,
    setRecPlaybackFrame,
    setRecHasRecording,
    setLoopEnabled,
    configureRecorder,
    handleStartRecording,
    handleStopRecording,
    handleStartPlayback,
    handlePausePlayback,
    handleStopPlayback,
    handleToggleLoop,
    handleExportRecording,
    handleImportRecording,
    handleClearRecording
  };
}
