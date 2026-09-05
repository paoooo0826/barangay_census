import { useEffect, useRef, useState } from 'react';
import { Camera, FlipHorizontal2, Loader2, X } from 'lucide-react';

interface IdCameraCaptureProps {
  side: 'front' | 'back';
  disabled?: boolean;
  onCapture: (file: File) => void;
}

type CameraFacing = 'environment' | 'user';

export default function IdCameraCapture({
  side,
  disabled,
  onCapture,
}: IdCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<CameraFacing>('environment');

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const closeCamera = () => {
    stopStream();
    setOpen(false);
    setBusy(false);
    setError('');
  };

  const startCamera = async (cameraFacing: CameraFacing = facing) => {
    setBusy(true);
    setError('');
    stopStream();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (!videoRef.current) throw new Error('Unable to initialize the ID camera preview.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (caughtError) {
      stopStream();
      setOpen(true);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to open the camera.',
      );
    } finally {
      setBusy(false);
    }
  };

  const switchCamera = async () => {
    const nextFacing: CameraFacing = facing === 'environment' ? 'user' : 'environment';
    setFacing(nextFacing);
    await startCamera(nextFacing);
  };

  const captureId = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready. Wait a moment and try again.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Unable to capture the ID image.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('ID photo capture failed.')),
        'image/jpeg',
        0.92,
      );
    });

    const file = new File([blob], `government-id-${side}-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });
    onCapture(file);
    closeCamera();
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void startCamera()}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Camera size={18} />
        Take live photo
      </button>

      {open && (
        <div className="fixed inset-0 z-[260] flex flex-col bg-slate-950 p-3 text-white sm:p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="font-bold">Photograph ID {side}</p>
              <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                Place the entire card inside the guide. Avoid glare and keep all text readable.
              </p>
            </div>
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20"
            >
              <X size={18} />
              Close
            </button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/20 bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
            {!error && (
              <div className="pointer-events-none absolute inset-[8%] rounded-2xl border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="animate-spin" size={42} />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-200">
                {error}
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void switchCamera()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-50"
            >
              <FlipHorizontal2 size={19} />
              Switch camera
            </button>
            <button
              type="button"
              onClick={() => void captureId()}
              disabled={busy || Boolean(error)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
            >
              <Camera size={19} />
              Capture ID {side}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
