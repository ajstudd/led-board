import { useState, useRef, useCallback, useEffect } from "react";
import { TimelineManager, TimelineClip, TimelineTrack } from "../lib/timelineManager";
import { LayerManager } from "../lib/layerManager";
import { EffectsEngine } from "../lib/effects";

export function useTimelineEngine(onRedraw: () => void) {
    const timelineRef = useRef<TimelineManager | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(30000);
    const [isPlaying, setIsPlaying] = useState(false);
    const [tracks, setTracks] = useState<TimelineTrack[]>([]);

    useEffect(() => {
        if (!timelineRef.current) {
            timelineRef.current = new TimelineManager(
                onRedraw,
                (t) => setCurrentTime(t)
            );
            // Default track
            timelineRef.current.addTrack("Track 1");
            setDuration(timelineRef.current.duration);
            setTracks([...timelineRef.current.tracks]);
        }
    }, [onRedraw]);

    const forceUpdateTracks = useCallback(() => {
        if (timelineRef.current) setTracks([...timelineRef.current.tracks]);
    }, []);

    const handlePlay = useCallback((lm: LayerManager, ee: EffectsEngine) => {
        if (timelineRef.current) {
            timelineRef.current.play(lm, ee);
            setIsPlaying(true);
        }
    }, []);

    const handlePause = useCallback(() => {
        if (timelineRef.current) {
            timelineRef.current.pause();
            setIsPlaying(false);
        }
    }, []);

    const handleStop = useCallback((lm: LayerManager, ee: EffectsEngine) => {
        if (timelineRef.current) {
            timelineRef.current.stop(lm, ee);
            setIsPlaying(false);
            forceUpdateTracks();
        }
    }, []);

    const handleSeek = useCallback((timeMs: number, lm: LayerManager, ee: EffectsEngine) => {
        if (timelineRef.current) {
            timelineRef.current.seek(timeMs, lm, ee);
        }
    }, []);

    const handleAddClip = useCallback((trackId: string, clipData: Omit<TimelineClip, "id">) => {
        if (timelineRef.current) {
            timelineRef.current.addClip(trackId, clipData);
            forceUpdateTracks();
        }
    }, []);

    const handleMoveClip = useCallback((trackId: string, clipId: string, newStartTime: number) => {
        if (timelineRef.current) {
            timelineRef.current.moveClip(trackId, clipId, newStartTime);
            forceUpdateTracks();
        }
    }, []);

    const handleResizeClip = useCallback((trackId: string, clipId: string, newDuration: number) => {
        if (timelineRef.current) {
            timelineRef.current.resizeClip(trackId, clipId, newDuration);
            forceUpdateTracks();
        }
    }, []);

    const handleDeleteClip = useCallback((trackId: string, clipId: string) => {
        if (timelineRef.current) {
            timelineRef.current.removeClip(trackId, clipId);
            forceUpdateTracks();
        }
    }, []);

    const handleAddTrack = useCallback((name: string) => {
         if (timelineRef.current) {
            timelineRef.current.addTrack(name);
            forceUpdateTracks();
         }
    }, []);

    return {
        timelineRef,
        currentTime,
        duration,
        isPlaying,
        tracks,
        handlePlay,
        handlePause,
        handleStop,
        handleSeek,
        handleAddClip,
        handleMoveClip,
        handleResizeClip,
        handleDeleteClip,
        handleAddTrack
    };
}
