/** Quality screening on a small crop, not a biometric or authenticity decision. */
export function captureQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (width < 3 || height < 3 || data.length < width * height * 4)
    return { brightness: 0, sharpness: 0, acceptable: false };
  const gray = new Float32Array(width * height);
  let total = 0;
  for (let p = 0; p < gray.length; p++) {
    gray[p] =
      0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
    total += gray[p];
  }
  let sum = 0,
    squares = 0,
    n = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x,
        lap =
          gray[p - width] +
          gray[p + width] +
          gray[p - 1] +
          gray[p + 1] -
          4 * gray[p];
      sum += lap;
      squares += lap * lap;
      n++;
    }
  const brightness = total / gray.length,
    sharpness = squares / n - (sum / n) ** 2;
  return {
    brightness,
    sharpness,
    acceptable: brightness >= 35 && brightness <= 247 && sharpness >= 18,
  };
}
export function inspectCaptureCrop(
  source: CanvasImageSource,
  box: { x: number; y: number; width: number; height: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = Math.max(3, Math.round((256 * box.height) / box.width));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to check capture clarity. Please retry.");
  ctx.drawImage(
    source,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return captureQuality(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
}
