import CapturePortal from "./CapturePortal";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  SwitchCamera,
  FlipHorizontal2,
  Loader2,
  X,
} from "lucide-react";
import VideoGuide from "./VideoGuide";
import { idGuide, inspectIdFrame } from "../lib/captureGuide";
import { drawCameraFrame } from "../lib/cameraFrame";

const FRAME_TIMEOUT_MS = 8_000;
const STREAM_STOPPED_MESSAGE =
  "The camera stopped. Retry the photo, or close the camera and upload an ID image.";

function cameraErrorMessage(caught: unknown) {
  const name = caught instanceof DOMException ? caught.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission was denied. Allow camera access in browser settings, then retry, or close and upload a photo.";
  if (name === "NotFoundError")
    return "No camera is available. Connect a camera or close and upload an ID photo.";
  if (name === "NotReadableError")
    return "The camera is busy or unavailable. Close other apps using it, then retry.";
  return caught instanceof Error
    ? caught.message
    : "Unable to capture the ID. Allow camera permission or upload a photo.";
}

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
  const detachStreamListenersRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const captureInProgressRef = useRef(false);
  const autoOpenHandledRef = useRef(false);
  const capturedFile = useRef<File | null>(null);
  const manualCapture = useRef(false);
  const previewUrlRef = useRef("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mirroredPreview, setMirroredPreview] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    "Align all four card edges with the guide.",
  );
  const [progress, setProgress] = useState(0);
  const [capturedPreview, setCapturedPreview] = useState("");

  const dialogRef = useDialogFocus<HTMLDivElement>(open, close, null);

  function releaseStream() {
    detachStreamListenersRef.current?.();
    detachStreamListenersRef.current = null;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function stop() {
    generationRef.current += 1;
    releaseStream();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  }
  function close() {
    stop();
    captureInProgressRef.current = false;
    capturedFile.current = null;
    manualCapture.current = false;
    setOpen(false);
    setBusy(false);
    setError("");
    setProgress(0);
    setCapturedPreview("");
  }

  function failCapture(token: number, message: string) {
    if (generationRef.current !== token) return;
    stop();
    captureInProgressRef.current = false;
    manualCapture.current = false;
    setBusy(false);
    setProgress(0);
    setError(message);
  }

  useEffect(() => () => stop(), []);
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
    capturedFile.current = null;
    manualCapture.current = false;
    setFacing(nextFacing);
    setMirroredPreview(false);
    setOpen(true);
    setBusy(true);
    setCapturedPreview("");
    setError("");
    setMessage("Opening camera… Allow camera access when your browser asks.");
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
      const tracks = stream.getTracks();
      if (!tracks.length || tracks.some((track) => track.readyState === "ended"))
        throw new Error(STREAM_STOPPED_MESSAGE);
      const onEnded = () => failCapture(token, STREAM_STOPPED_MESSAGE);
      tracks.forEach((track) => track.addEventListener("ended", onEnded));
      detachStreamListenersRef.current = () =>
        tracks.forEach((track) => track.removeEventListener("ended", onEnded));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (generationRef.current !== token) return;
      const video = videoRef.current;
      if (!video) throw new Error("Unable to open the camera preview.");
      video.srcObject = stream;
      void video.play().catch((caught) => {
        if (streamRef.current === stream)
          failCapture(token, cameraErrorMessage(caught));
      });
      const analysis = document.createElement("canvas");
      const context = analysis.getContext("2d", { willReadFrequently: true });
      if (!context)
        throw new Error("This browser cannot analyze camera images.");
      let previous: Uint8Array | undefined;
      let stableFrames = 0;
      let waitingForFrame = true;
      let lastFrameAt = performance.now();
      const requiredStableFrames = 5;
      while (generationRef.current === token && !captureInProgressRef.current) {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          lastFrameAt = performance.now();
          if (waitingForFrame) {
            waitingForFrame = false;
            setBusy(false);
          }
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
          if (stableFrames >= requiredStableFrames || manualCapture.current) {
            manualCapture.current = false;
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
            drawCameraFrame(
              captureContext,
              video,
              { x: sx, y: sy, width: sw, height: sh },
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
            capturedFile.current = file;
            setMessage("Review your ID photo. Confirm it or retake.");
            releaseStream();
            return;
          }
        } else {
          if (performance.now() - lastFrameAt >= FRAME_TIMEOUT_MS)
            throw new Error(
              "No image came from the camera. Retry the photo, or close the camera and upload an ID image.",
            );
          if (!waitingForFrame) {
            waitingForFrame = true;
            previous = undefined;
            stableFrames = 0;
            manualCapture.current = false;
            setBusy(true);
            setProgress(0);
            setMessage("Waiting for a camera image…");
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
    } catch (caught) {
      failCapture(token, cameraErrorMessage(caught));
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void start()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-pine-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pine-800 disabled:opacity-50"
      >
        <Camera size={18} />
        Take live photo
      </button>
      {open && (
        <CapturePortal active>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Photograph ID ${side}`}
            className="camera-dialog camera-edge-to-edge fixed inset-0 z-[260] bg-black text-white"
          >
            <div className="capture-header flex items-start justify-between gap-4">
              <div>
                <p className="font-bold">Photograph ID {side}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Keep the whole card aligned and steady. Capture automatically
                  or press Capture.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close camera"
                className="self-start shrink-0 rounded-xl bg-white/10 p-3"
              >
                <X size={20} />
              </button>
            </div>
            <div className="camera-preview absolute inset-0 overflow-hidden bg-black">
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
                    style={{
                      transform: mirroredPreview ? "scaleX(-1)" : "none",
                    }}
                    data-orientation={
                      mirroredPreview ? "mirrored" : "unmirrored"
                    }
                    className="h-full w-full object-contain"
                  />
                  <VideoGuide
                    videoRef={videoRef}
                    kind="id"
                    borderless
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
            <div className="capture-controls">
              {!capturedPreview && (
                <p className="mt-3 text-center text-xs text-slate-300">
                  {mirroredPreview
                    ? "Selfie preview follows your movements. "
                    : "Normal camera preview. "}
                  Saved ID photos keep text readable.
                </p>
              )}
              <p
                role={error ? "alert" : "status"}
                className={`my-3 text-center text-sm ${error ? "text-red-300" : "text-slate-200"}`}
              >
                {error || message}
              </p>
              <div className="flex shrink-0 flex-wrap justify-center gap-3">
                {capturedPreview ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void start()}
                    >
                      Retake
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        const file = capturedFile.current;
                        if (file) {
                          onCapture(file);
                          close();
                        }
                      }}
                    >
                      Confirm Photo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !!error || !streamRef.current}
                    className="btn-primary"
                    onClick={() => {
                      manualCapture.current = true;
                    }}
                  >
                    Capture
                  </button>
                )}
                {!capturedPreview && !captureInProgressRef.current && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Mirror Preview"
                    aria-pressed={mirroredPreview}
                    onClick={() => setMirroredPreview((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3"
                  >
                    <FlipHorizontal2 size={18} />
                    Mirror Preview: {mirroredPreview ? "On" : "Off"}
                  </button>
                )}
                {!capturedPreview && !captureInProgressRef.current && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void start(
                        facing === "environment" ? "user" : "environment",
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3"
                  >
                    <SwitchCamera size={18} />
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
          </div>
        </CapturePortal>
      )}
    </>
  );
}
