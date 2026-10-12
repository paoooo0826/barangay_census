/** Render raw camera pixels with the identity transform: no horizontal flip. */
export function drawCameraFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  source: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, width, height);
  context.restore();
}
