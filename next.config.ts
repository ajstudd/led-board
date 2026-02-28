import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MediaPipe packages reference browser globals (HTMLVideoElement, WebGL, etc.)
  // at module evaluation time — exclude them from the server bundle entirely.
  serverExternalPackages: [
    "@mediapipe/hands",
    "@mediapipe/camera_utils",
    "@mediapipe/drawing_utils",
  ],
};

export default nextConfig;
