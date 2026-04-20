# Timeline Implementation Plan (Phase 7)

This plan outlines the architecture for introducing a visual Timeline editor, which allows users to explicitly sequence animations, patterns, and effects over time instead of running them indefinitely.

## User Review Required

> [!WARNING]
> This phase will transition the Animation Manager from a "real-time unrecorded loop" into a deterministic "Time-aware" sequence. Existing animations that rely on real-time physics bounds or simple snapshots will need minor patching to be stateless based purely on the `currentTime` to support scrubbing/seeking accurately. 
> 
> Please review the data structures and UI panel integration described below to ensure it aligns with your vision for the visual editor.

## Proposed Changes

---

### Timeline Core Data Structures

#### [NEW] `app/lib/timelineManager.ts`

This will be the central orchestrator that replaces the indefinite animation loop when the user switches to the 'Timeline Editor' view.

*   **`TimelineClip`**: Defines a block of time where a specific function fires.
    *   `id`: string
    *   `type`: `'animation'` | `'pattern'` | `'effect'` | `'text'`
    *   `config`: `AnimationConfig | PatternConfig | EffectPreset | TextAnimationConfig`
    *   `startTime`: number (ms)
    *   `duration`: number (ms)
    *   `layerId`: string (optional, for targeting specific component layers)
*   **`TimelineTrack`**: Organizes clips visually.
    *   `id`, `name`, `clips[]`, `muted`
*   **`TimelineManager`**: 
    *   `play()`, `pause()`, `seek(timeMs)`
    *   `tick(layers: LayerManager, effects: EffectsEngine)`: Resolves active clips for the exact `seeking` position and projects them into the `layerManager` buffers to guarantee frame-perfect scrubbing.

### Timeline User Interface

#### [NEW] `app/components/TimelinePanel.tsx`

A bottom-docked video-editor style pane containing:
*   **Playhead**: A scrubbable vertical red bar mapped to `timelineManager.currentTime`.
*   **Tracks Lane**: Horizontal rows representing tracks or layers.
*   **Clips**: Colored divs rendering inside tracks based on their start position and width.
*   **Drag & Drop Context**: We will add simple `onMouseDown`/`onMouseMove` block dragging to reposition or resize clips.
*   **Integration**: Placed beneath the `LEDCanvas` component, replacing or shifting the main playback bar.

### App Engine Hook

#### [NEW] `app/hooks/useTimelineEngine.ts`

A custom hook separating timeline lifecycle states from the underlying DOM:
*   Exports `timelineRef`, `currentTime`, `duration`, `isPlaying`.
*   Exposes `handleScrub`, `handlePlay`, `handlePause`, `handleAddClip`.
*   Will hook directly into `useAnimationEngine`'s `requestAnimationFrame` loop. If a timeline clip is active, `useTimelineEngine` will preempt the global animation engine to ensure Timeline clips drive the compositing.

### Wiring Updates

#### [MODIFY] `app/components/LEDBoard.tsx`
*   **Injection**: Add `<TimelinePanel />` layout beneath the drawing canvas.
*   **Loop Binding**: Update the `useAnimationEngine` hook callback or tick to hand control over to the `TimelineManager` if the mode is enabled. When the user clicks "Play" on the timeline, the `TimelineManager` applies the appropriate effect based on the scrubber.

## Verification Plan

### Automated Tests
*   **Build Scripts**: Verify the architecture imports securely without cyclical dependencies.

### Manual Verification
1.  **Scrubbing Tests**: I will add an overlapping text and color effect clip. As I scrub left and right on the UI timeline playhead, the Canvas must immediately jump to the deterministic state.
2.  **Stateless Render Checks**: Ensure that patterns completely rewrite their target layer independently so that repeating patterns do not accumulate incorrectly over time when scrubbing backwards.
3.  **UI Layout**: The layout handles sidebars and bottom sheets dynamically so the Canvas shrinks accordingly when the Timeline unfolds.
