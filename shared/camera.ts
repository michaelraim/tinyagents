/** Orthographic zoom doesn't change distance. Keep the camera ahead of the whole
 * ground footprint, even at a low viewing angle, so its near plane cannot cut it. */
export function cameraDistance(width: number, depth: number, viewportHeight = 1080) { return Math.max(600, Math.hypot(width, depth) * 2 + 160, viewportHeight / 8 * 5 + 160); }
export function cameraFar(width: number, depth: number, viewportHeight = 1080) { return cameraDistance(width, depth, viewportHeight) + Math.hypot(width, depth) + 4000; }
