import { useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal2, Loader2, X } from "lucide-react";
import VideoGuide from "./VideoGuide";
import { idGuide, inspectIdFrame } from "../lib/captureGuide";

interface Props {
  side: "front" | "back";
  disabled?: boolean;
  autoOpen?: boolean;
  onCapture: (file: File) => void;
}

export default function IdCameraCapture({
  side,
  disabled,
  autoOpen = false,
  onCapture,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const captureInProgressRef = useRef(false);
  const autoOpenHandledRef = useRef(false);
  const finishTimerRef = useRef<number | null>(null);
  const previewUrlRef = useRef("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    "Align all four card edges with the guide.",
  );
  const [progress, setProgress] = useState(0);
  const [capturedPreview, setCapturedPreview] = useState("");

  function stop() {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (finishTimerRef.current !== null)
      window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  }
  function close() {
    stop();
    captureInProgressRef.current = false;
    setOpen(false);
    setBusy(false);
    setError("");
    setProgress(0);
    setCapturedPreview("");
  }

  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);
  useEffect(() => {
    if (!autoOpen) {
      autoOpenHandledRef.current = false;
      return;
    }
    if (!disabled && !open && !autoOpenHandledRef.current) {
      autoOpenHandledRef.current = true;
      void start();
    }
  }, [autoOpen, disabled, open]);

  async function start(nextFacing = facing) {
    stop();
    const token = generationRef.current;
    captureInProgressRef.current = false;
    setFacing(nextFacing);
    setOpen(true);
    setBusy(true);
    setCapturedPreview("");
    setError("");
    setMessage("Align all four card edges with the guide.");
    setProgress(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access requires HTTPS and a supported browser. You can still upload an ID image.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (generationRef.current !== token) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const video = videoRef.current;
      if (!video) throw new Error("Unable to open the camera preview.");
      video.srcObject = stream;
      await video.play();
      if (generationRef.current !== token) return;
      setBusy(false);
      const analysis = document.createElement("canvas");
      const context = analysis.getContext("2d", { willReadFrequently: true });
      if (!context)
        throw new Error("This browser cannot analyze camera images.");
      let previous: Uint8Array | undefined;
      let stableFrames = 0;
      const requiredStableFrames = 5;
      while (generationRef.current === token && !captureInProgressRef.current) {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          analysis.width = Math.min(480, video.videoWidth);
          analysis.height = Math.max(
            1,
            Math.round((analysis.width * video.videoHeight) / video.videoWidth),
          );
          context.drawImage(video, 0, 0, analysis.width, analysis.height);
          const result = inspectIdFrame(
            context.getImageData(0, 0, analysis.width, analysis.height),
            previous,
          );
          previous = result.gray;
          stableFrames = result.acceptable
            ? Math.min(requiredStableFrames, stableFrames + 1)
            : 0;
          setMessage(
            stableFrames > 0
              ? `Hold still — ${stableFrames} of ${requiredStableFrames}`
              : result.message,
          );
          setProgress(stableFrames);
          if (stableFrames >= requiredStableFrames) {
            captureInProgressRef.current = true;
            setBusy(true);
            setMessage("Capturing ID…");
            const crop = idGuide(video.videoWidth, video.videoHeight);
            const canvas = document.createElement("canvas");
            const margin = Math.min(crop.width, crop.height) * 0.04;
            const sx = Math.max(0, crop.x - margin);
            const sy = Math.max(0, crop.y - margin);
            const sw = Math.min(video.videoWidth - sx, crop.width + margin * 2);
            const sh = Math.min(
              video.videoHeight - sy,
              crop.height + margin * 2,
            );
            canvas.width = Math.max(1, Math.round(sw));
            canvas.height = Math.max(1, Math.round(sh));
            const captureContext = canvas.getContext("2d");
            if (!captureContext)
              throw new Error("Unable to capture the ID image.");
            captureContext.drawImage(
              video,
              sx,
              sy,
              sw,
              sh,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const blob = await new Promise<Blob>((resolve, reject) =>
              canvas.toBlob(
                (value) =>
                  value && value.size > 0
                    ? resolve(value)
                    : reject(new Error("No image was captured. Please retry.")),
                "image/jpeg",
                0.92,
              ),
            );
            if (generationRef.current !== token) return;
            const file = new File(
              [blob],
              `government-id-${side}-${Date.now()}.jpg`,
              { type: "image/jpeg" },
            );
            if (file.size === 0)
              throw new Error("The captured image is empty. Please retry.");
            const preview = URL.createObjectURL(file);
            previewUrlRef.current = preview;
            setCapturedPreview(preview);
            setBusy(false);
            setProgress(requiredStableFrames);
            setMessage("ID captured successfully. Saving image…");
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            finishTimerRef.current = window.setTimeout(() => {
              finishTimerRef.current = null;
              if (generationRef.current !== token || file.size === 0) return;
              onCapture(file);
              URL.revokeObjectURL(preview);
              previewUrlRef.current = "";
              setCapturedPreview("");
              setOpen(false);
              captureInProgressRef.current = false;
            }, 650);
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
    } catch (caught) {
      if (generationRef.current === token) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        captureInProgressRef.current = false;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to capture the ID. Allow camera permission or upload a photo.",
        );
      }
    } finally {
      if (generationRef.current === token) setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void start()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
      >
        <Camera size={18} />
        Take live photo
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photograph ID ${side}`}
          className="fixed inset-0 z-[260] flex flex-col bg-slate-950 p-3 text-white sm:p-5"
        >
          <div className="mb-3 flex justify-between gap-4">
            <div>
              <p className="font-bold">Photograph ID {side}</p>
              <p className="mt-1 text-xs text-slate-300">
                Capture is automatic. Keep the whole card aligned and steady.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close camera"
              className="rounded-xl bg-white/10 p-3"
            >
              <X size={20} />
            </button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
            {capturedPreview ? (
              <img
                src={capturedPreview}
                alt="Captured ID preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="h-full w-full object-contain"
                />
                <VideoGuide
                  videoRef={videoRef}
                  kind="id"
                  ready={progress > 0}
                />
              </>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="animate-spin" size={40} />
              </div>
            )}
          </div>
          <p
            role={error ? "alert" : "status"}
            className={`my-3 text-center text-sm ${error ? "text-red-300" : "text-slate-200"}`}
          >
            {error || message}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {!capturedPreview && !captureInProgressRef.current && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void start(facing === "environment" ? "user" : "environment")
                }
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3"
              >
                <FlipHorizontal2 size={18} />
                Switch camera
              </button>
            )}
            {error && (
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-xl bg-white/10 px-5 py-3"
              >
                Retry photo
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
