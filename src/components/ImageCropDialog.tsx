import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { validateResidentImage } from "../lib/imageValidation";
export type CropKind = "announcement" | "id" | "household" | "profile";
export function cropRectangle(
  width: number,
  height: number,
  ratio: number,
  zoom: number,
  x: number,
  y: number,
  selection?: { width: number; height: number },
) {
  const baseWidth = Math.min(width, height * ratio),
    w = (selection ? width * selection.width : baseWidth) / zoom,
    h = selection ? (height * selection.height) / zoom : w / ratio;
  return {
    x: Math.max(0, Math.min(1, x)) * (width - w),
    y: Math.max(0, Math.min(1, y)) * (height - h),
    width: w,
    height: h,
  };
}
async function decode(
  file: File,
): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const b = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: b,
      width: b.width,
      height: b.height,
      close: () => b.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(
          new Error(
            "This image cannot be decoded. Choose a JPG, PNG, or WebP photo.",
          ),
        );
      img.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
export default function ImageCropDialog({
  file,
  kind,
  onConfirm,
  onCancel,
}: {
  file: File;
  kind: CropKind;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}) {
  const [image, setImage] = useState<Awaited<ReturnType<typeof decode>> | null>(
      null,
    ),
    [zoom, setZoom] = useState(1),
    [position, setPosition] = useState({ x: 0.5, y: 0.5 }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [aspect, setAspect] = useState("original"),
    [selection, setSelection] = useState({ width: 1, height: 1 });
  const canvas = useRef<HTMLCanvasElement>(null),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    ),
    active = useRef(true);
  const cancel = () => {
    active.current = false;
    onCancel();
  };
  const ref = useDialogFocus<HTMLDivElement>(true, cancel, null);
  const ratio =
    kind === "announcement"
      ? 16 / 7
      : kind === "profile" || aspect === "square"
        ? 1
        : aspect === "id-card"
          ? 85.6 / 53.98
          : aspect === "landscape"
            ? 4 / 3
        : image
          ? (image.width * (aspect === "free" ? selection.width : 1)) / (image.height * (aspect === "free" ? selection.height : 1))
          : 4 / 3;
  const freeSelection = aspect === "free" ? selection : undefined;
  useEffect(() => {
    let mounted = true;
    active.current = true;
    let loaded: Awaited<ReturnType<typeof decode>> | null = null;
    void decode(file).then(
      (value) => {
        loaded = value;
        if (!mounted) {
          value.close();
          return;
        }
        if (value.width < 240 || value.height < 150) {
          setError(
            "Image resolution is too low. Upload a clearer image of at least 240 × 150 pixels.",
          );
          value.close();
          loaded = null;
          return;
        }
        setImage(value);
      },
      () => {
        if (mounted)
          setError(
            "Unable to read this image. Choose a different JPG, PNG, or WebP file.",
          );
      },
    );
    return () => {
      mounted = false;
      active.current = false;
      loaded?.close();
    };
  }, [file]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const r = cropRectangle(
        image.width,
        image.height,
        ratio,
        zoom,
        position.x,
        position.y,
        freeSelection,
      ),
      c = canvas.current;
    const factor = Math.min(1, 1200 / Math.max(r.width, r.height));
    c.width = Math.max(1, Math.round(r.width * factor));
    c.height = Math.max(1, Math.round(r.height * factor));
    const ctx = c.getContext("2d");
    if (!ctx) {
      setError(
        "Image editing is unavailable in this browser. Try another browser.",
      );
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(
      image.source,
      r.x,
      r.y,
      r.width,
      r.height,
      0,
      0,
      c.width,
      c.height,
    );
  }, [image, ratio, zoom, position, aspect, selection]);
  async function confirm() {
    if (!image || saving || !canvas.current) return;
    const r = cropRectangle(
      image.width,
      image.height,
      ratio,
      zoom,
      position.x,
      position.y,
      freeSelection,
    );
    if (r.width < 240 || r.height < 150) {
      setError(
        "This crop is too small. Reduce zoom to keep the image readable.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const output = document.createElement("canvas");
      const factor = Math.min(1, (kind === "id" ? 2400 : 1600) / Math.max(r.width, r.height));
      output.width = Math.max(1, Math.round(r.width * factor));
      output.height = Math.max(1, Math.round(r.height * factor));
      if (output.width < 240 || output.height < 150) throw new Error("The saved crop would be too small. Use a wider crop or a clearer image.");
      const ctx = output.getContext("2d");
      if (!ctx) throw new Error("Unable to prepare the crop.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.drawImage(
        image.source,
        r.x,
        r.y,
        r.width,
        r.height,
        0,
        0,
        output.width,
        output.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (b) =>
            b && b.size > 0
              ? resolve(b)
              : reject(new Error("Unable to save the crop. Retry.")),
          "image/jpeg",
          0.94,
        ),
      );
      if (!active.current) return;
      const confirmed = new File([blob], `${kind}-${Date.now()}.jpg`, { type: "image/jpeg" });
      validateResidentImage(confirmed);
      if (kind === "announcement" && confirmed.size > 5 * 1024 * 1024) throw new Error("The cropped banner exceeds 5 MB. Use a smaller or simpler image.");
      onConfirm(confirmed);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Unable to save image.");
    } finally {
      if (active.current) setSaving(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center bg-black/75 p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        tabIndex={-1}
        className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 sm:p-6"
      >
        <div className="flex justify-between gap-3">
          <h2 id="crop-title" className="text-xl font-bold">
            Crop{" "}
            {kind === "id"
              ? "Identification Image"
              : kind === "announcement"
                ? "Announcement Banner"
                : "Photo"}
          </h2>
          <button
            type="button"
            aria-label="Close crop"
            onClick={cancel}
            className="btn-secondary"
          >
            ✕
          </button>
        </div>
        <p className="my-3 text-sm text-slate-600">
          Drag the preview to position your image. Use zoom or arrow keys to
          adjust.
          {kind === "id" &&
            " Keep the entire ID and all readable details visible. Reset shows the full image."}
        </p>
        {kind === "announcement" || kind === "profile" ? (
          <p className="mb-3 text-xs font-semibold text-pine-700">{kind === "announcement" ? "Banner Proportions: 16:7" : "Profile Proportions: 1:1"}</p>
        ) : (
          <label className="label mb-3 block">Aspect Ratio
            <select aria-label="Crop Aspect Ratio" className="input mt-2" value={aspect} disabled={!image || saving} onChange={e => { setAspect(e.target.value); setZoom(1); setPosition({ x: 0.5, y: 0.5 }); setError(""); }}>
              <option value="original">Original Proportions</option>
              {kind === "id" ? <option value="id-card">ID Card (Landscape)</option> : <><option value="landscape">Landscape (4:3)</option><option value="square">Square (1:1)</option></>}
              <option value="free">Free Crop</option>
            </select>
          </label>
        )}
        {aspect === "free" && <div className="mb-3 grid gap-3 sm:grid-cols-2">
          {(["width", "height"] as const).map(dimension => <label key={dimension} className="label">Crop {dimension === "width" ? "Width" : "Height"}: {Math.round(selection[dimension] * 100)}%
            <input type="range" aria-label={`Crop ${dimension === "width" ? "Width" : "Height"}`} min="0.05" max="1" step="0.01" value={selection[dimension]} disabled={saving} onChange={e => setSelection(current => ({ ...current, [dimension]: Number(e.target.value) }))} className="mt-2 w-full" />
          </label>)}
        </div>}
        {!image && !error && (
          <p role="status">Preparing image and correcting orientation…</p>
        )}
        {image && (
          <canvas
            ref={canvas}
            aria-label="Crop preview; drag or use arrow keys to position"
            tabIndex={0}
            className="mx-auto max-h-[50dvh] max-w-full touch-none rounded-xl bg-slate-100 object-contain outline-pine-700"
            style={{ aspectRatio: ratio, width: `min(100%, ${50 * ratio}dvh)` }}
            onPointerDown={(e) => {
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                px: position.x,
                py: position.y,
              };
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const r = cropRectangle(
                  image.width,
                  image.height,
                  ratio,
                  zoom,
                  position.x,
                  position.y,
                  freeSelection,
                ),
                box = e.currentTarget.getBoundingClientRect();
              setPosition({
                x: Math.max(
                  0,
                  Math.min(
                    1,
                    drag.current.px -
                      (((e.clientX - drag.current.x) / Math.max(1, box.width)) *
                        r.width) /
                        Math.max(1, image.width - r.width),
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    1,
                    drag.current.py -
                      (((e.clientY - drag.current.y) /
                        Math.max(1, box.height)) *
                        r.height) /
                        Math.max(1, image.height - r.height),
                  ),
                ),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(e) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              setPosition((p) => ({
                x: Math.max(
                  0,
                  Math.min(
                    1,
                    p.x +
                      (e.key === "ArrowLeft"
                        ? -0.05
                        : e.key === "ArrowRight"
                          ? 0.05
                          : 0),
                  ),
                ),
                y: Math.max(
                  0,
                  Math.min(
                    1,
                    p.y +
                      (e.key === "ArrowUp"
                        ? -0.05
                        : e.key === "ArrowDown"
                          ? 0.05
                          : 0),
                  ),
                ),
              }));
            }}
          />
        )}
        <label className="my-4 block text-sm font-semibold">
          Zoom: {zoom.toFixed(1)}×
          <input
            aria-label="Crop zoom"
            type="range"
            min="1"
            max="4"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="mt-2 w-full"
            disabled={!image || saving}
          />
        </label>
        {error && (
          <p role="alert" className="my-3 text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setZoom(1);
              setAspect("original");
              setSelection({ width: 1, height: 1 });
              setPosition({ x: 0.5, y: 0.5 });
              setError("");
            }}
            disabled={!image || saving}
          >
            Reset
          </button>
          <button type="button" className="btn-secondary" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!image || saving}
            onClick={() => void confirm()}
          >
            {saving ? "Preparing…" : "Crop / Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
export function useImageCrop() {
  const [pending, setPending] = useState<{ file: File; kind: CropKind; id: number } | null>(
      null,
    ),
    resolver = useRef<((file: File | null) => void) | null>(null);
  const serial = useRef(0);
  useEffect(
    () => () => {
      resolver.current?.(null);
      resolver.current = null;
    },
    [],
  );
  function finish(file: File | null, id: number) {
    if (id !== serial.current) return;
    resolver.current?.(file);
    resolver.current = null;
    setPending(null);
  }
  async function crop(file: File, kind: CropKind): Promise<File | null> {
    validateResidentImage(file);
    if (kind === "announcement" && file.size > 5 * 1024 * 1024)
      throw new Error("Announcement images must be 5 MB or smaller.");
    resolver.current?.(null);
    setPending({ file, kind, id: ++serial.current });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }
  return {
    crop,
    cropDialog: pending ? (
      <ImageCropDialog
        key={pending.id}
        file={pending.file}
        kind={pending.kind}
        onConfirm={(file) => finish(file, pending.id)}
        onCancel={() => finish(null, pending.id)}
      />
    ) : null,
  };
}
