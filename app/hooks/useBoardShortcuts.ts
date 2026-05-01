"use client";

import { useEffect, useCallback } from "react";
import type { AnimationManager } from "../lib/animation";

interface UseBoardShortcutsOptions {
    isFullscreen: boolean;
    setIsFullscreen: (v: boolean) => void;
    animRef: React.RefObject<AnimationManager | null>;
    handleUndo: () => void;
    handleAnimPause: () => void;
    handleAnimPlay: () => void;
}

/**
 * Registers keyboard shortcuts (Ctrl+Z, F, Space) and the fullscreen
 * change listener. Keeps all window.addEventListener calls out of LEDBoard.
 */
export function useBoardShortcuts({
    isFullscreen,
    setIsFullscreen,
    animRef,
    handleUndo,
    handleAnimPause,
    handleAnimPlay,
}: UseBoardShortcutsOptions) {
    // Track fullscreen state
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, [setIsFullscreen]);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const isInputFocused = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName;
            return (
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT" ||
                (el as HTMLElement).isContentEditable
            );
        };

        const onKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd+Z — undo (even in inputs)
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
                return;
            }

            if (isInputFocused()) return;

            // F — toggle fullscreen
            if (e.key === "f" || e.key === "F") {
                e.preventDefault();
                toggleFullscreen();
                return;
            }

            // Space — pause / resume animation
            if (e.key === " " && animRef.current) {
                const state = animRef.current.state;
                if (state === "playing") {
                    e.preventDefault();
                    handleAnimPause();
                } else if (state === "paused") {
                    e.preventDefault();
                    handleAnimPlay();
                }
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleUndo, toggleFullscreen, handleAnimPause, handleAnimPlay, animRef]);

    return { toggleFullscreen };
}
