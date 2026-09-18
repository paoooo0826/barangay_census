export interface Frame { x: number; y: number; width: number; height: number }

export function idGuide(width: number, height: number): Frame {
  const cardWidth = Math.min(width * 0.82, height * 0.72 * 1.586);
  return { x: (width - cardWidth) / 2, y: (height - cardWidth / 1.586) / 2, width: cardWidth, height: cardWidth / 1.586 };
}

export function faceGuide(width: number, height: number): Frame {
  const frameWidth = Math.min(width * 0.72, height * 0.78 / 1.25);
  return { x: (width - frameWidth) / 2, y: (height - frameWidth * 1.25) / 2, width: frameWidth, height: frameWidth * 1.25 };
}

export function faceInsideGuide(box: Frame, width: number, height: number) {
  const guide = faceGuide(width, height);
  return box.x >= guide.x && box.y >= guide.y &&
    box.x + box.width <= guide.x + guide.width && box.y + box.height <= guide.y + guide.height &&
    box.width >= guide.width * 0.48 && box.height >= guide.height * 0.45;
}

export function inspectIdFrame(image: ImageData, previous?: Uint8Array) {
  const { width, height, data } = image;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) gray[i] = Math.round(data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114);
  const guide = idGuide(width, height);
  const sample = (x: number, y: number) => gray[Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)))];
  const edge = (horizontal: boolean, base: number, start: number, length: number) => {
    let best = 0;
    const band = Math.max(2, Math.round(length * 0.035));
    for (let offset = -band; offset <= band; offset += 1) {
      let hits = 0;
      let total = 0;
      for (let step = 0; step < 60; step += 1) {
        const along = start + length * (0.04 + step / 60 * 0.92);
        const before = horizontal ? sample(along, base + offset - 2) : sample(base + offset - 2, along);
        const after = horizontal ? sample(along, base + offset + 2) : sample(base + offset + 2, along);
        const contrast = Math.abs(after - before);
        if (contrast > 18) hits += 1;
        total += contrast;
      }
      if (total / 60 > 15) best = Math.max(best, hits / 60);
    }
    return best >= 0.68;
  };
  const edges = edge(true, guide.y, guide.x, guide.width) && edge(true, guide.y + guide.height, guide.x, guide.width) &&
    edge(false, guide.x, guide.y, guide.height) && edge(false, guide.x + guide.width, guide.y, guide.height);
  let light = 0; let sharp = 0; let motion = 0; let count = 0; let bright = 0;
  for (let y = Math.ceil(guide.y + guide.height * 0.08); y < guide.y + guide.height * 0.92; y += 2) {
    for (let x = Math.ceil(guide.x + guide.width * 0.08); x < guide.x + guide.width * 0.92; x += 2) {
      const index = y * width + x;
      const value = gray[index];
      light += value;
      if (value > 248) bright += 1;
      const lap = gray[index - width] + gray[index + width] + gray[index - 1] + gray[index + 1] - 4 * value;
      sharp += lap * lap;
      motion += previous?.length === gray.length ? Math.abs(value - previous[index]) : 255;
      count += 1;
    }
  }
  const lit = light / count > 45 && light / count < 240 && bright / count < 0.65;
  const crisp = sharp / count > 65;
  const stable = motion / count < 7;
  return {
    acceptable: edges && lit && crisp && stable,
    gray,
    message: !lit ? 'Use even lighting and avoid glare.' : !edges ? 'Align all four card edges with the guide on a contrasting background.' : !crisp ? 'Move into focus so the text is sharp.' : !stable ? 'Hold the ID still.' : 'Hold still — capturing automatically…',
  };
}
