# Tenix — Timeline Feature Task Tracker (Phase 7)

## 1. Timeline Core Logic
- `[x]` Create `app/lib/timelineManager.ts`
  - `[x]` Define `TimelineClip`, `TimelineTrack`, `TimelineManager` interfaces
  - `[x]` Implement `tick()` to composite active clips onto layers
  - `[x]` Support Add/Move/Resize clip logic

## 2. Playback Hook
- `[x]` Create `app/hooks/useTimelineEngine.ts`
  - `[x]` Wrap the `TimelineManager` instantiation
  - `[x]` Return scrub, play, pause, update track bindings

## 3. Timeline UI Component
- `[x]` Create `app/components/TimelinePanel.tsx`
  - `[x]` Playhead scrubber bar
  - `[x]` Tracks list (linked to layers)
  - `[x]` Draggable clips map
  - `[x]` "Add Clip" button mapping to Effects, Patterns, Animations, Text

## 4. Main App Integration
- `[x]` Modify `app/components/LEDBoard.tsx`
  - `[x]` Add `<TimelinePanel />` layout overlay
  - `[x]` Override standard `useAnimationEngine` loop when timeline is playing
  - `[x]` Pass the current `LayerManager` and `EffectsEngine` to the timeline tick
