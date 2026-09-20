import { useEffect, useRef, useState } from 'react';
import { Camera, FlipHorizontal2, Loader2, X } from 'lucide-react';
import VideoGuide from './VideoGuide';
import { idGuide, inspectIdFrame } from '../lib/captureGuide';

interface Props { side: 'front' | 'back'; disabled?: boolean; onCapture: (file: File) => void }

export default function IdCameraCapture({ side, disabled, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const accepted = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Align all four card edges with the guide.');
  const [progress, setProgress] = useState(0);
  const [captured, setCaptured] = useState<File | null>(null);
  const [preview, setPreview] = useState('');

  function stop() {
    generation.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }
  function close() { stop(); setOpen(false); setBusy(false); setCaptured(null); setError(''); setProgress(0); }
  useEffect(() => () => stop(), []);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);
  useEffect(() => {
    if (!captured) { setPreview(''); return; }
    const url = URL.createObjectURL(captured); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [captured]);

  async function start(nextFacing = facing) {
    stop();
    const token = generation.current;
    accepted.current = false;
    setFacing(nextFacing); setOpen(true); setCaptured(null); setBusy(true); setError(''); setProgress(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser. You can still upload an ID image.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (generation.current !== token) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error('Unable to open the camera preview.');
      video.srcObject = stream;
      await video.play();
      if (generation.current !== token) return;
      setBusy(false);
      const analysis = document.createElement('canvas');
      const context = analysis.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser cannot analyze camera images.');
      let previous: Uint8Array | undefined;
      let stableFrames = 0;
      const requiredStableFrames = 4;
      while (generation.current === token) {
        if (video.readyState >= 2 && video.videoWidth) {
          analysis.width = Math.min(480, video.videoWidth);
          analysis.height = Math.round(analysis.width * video.videoHeight / video.videoWidth);
          context.drawImage(video, 0, 0, analysis.width, analysis.height);
          const result = inspectIdFrame(context.getImageData(0, 0, analysis.width, analysis.height), previous);
          previous = result.gray;
          if (result.acceptable) stableFrames = Math.min(requiredStableFrames, stableFrames + 1);
          else if (result.alignmentReady) stableFrames = Math.max(0, stableFrames - 1);
          else stableFrames = 0;
          setMessage(stableFrames > 0 ? `Hold still — capturing ${stableFrames}/${requiredStableFrames}…` : result.message);
          setProgress(stableFrames);
          if (stableFrames >= requiredStableFrames) {
            const crop = idGuide(video.videoWidth, video.videoHeight);
            const canvas = document.createElement('canvas');
            const margin = Math.min(crop.width, crop.height) * 0.06;
            canvas.width = Math.round(crop.width + margin * 2);
            canvas.height = Math.round(crop.height + margin * 2);
            const captureContext = canvas.getContext('2d');
            if (!captureContext) throw new Error('Unable to capture the ID image.');
            captureContext.drawImage(video, crop.x - margin, crop.y - margin, crop.width + margin * 2, crop.height + margin * 2, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to capture the image. Please retry.')), 'image/jpeg', 0.92));
            if (generation.current !== token) return;
            stop();
            setCaptured(new File([blob], `government-id-${side}-${Date.now()}.jpg`, { type: 'image/jpeg' }));
            return;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    } catch (caught) {
      if (generation.current === token) {
        stop();
        setError(caught instanceof Error ? caught.message : 'Unable to open camera. Allow camera permission or upload a photo.');
      }
    } finally {
      if (generation.current === token || !streamRef.current) setBusy(false);
    }
  }

  return <>
    <button type="button" disabled={disabled || busy} onClick={() => void start()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Camera size={18}/>Take live photo</button>
    {open && <div role="dialog" aria-modal="true" aria-label={`Photograph ID ${side}`} className="fixed inset-0 z-[260] flex flex-col bg-slate-950 p-3 text-white sm:p-5">
      <div className="mb-3 flex justify-between gap-4"><div><p className="font-bold">Photograph ID {side}</p><p className="mt-1 text-xs text-slate-300">{captured ? 'Check that every detail is readable before using this photo.' : 'Capture is automatic. Keep the whole card aligned and steady.'}</p></div><button type="button" onClick={close} aria-label="Close camera" className="rounded-xl bg-white/10 p-3"><X size={20}/></button></div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
        {preview ? <img src={preview} alt="Captured ID preview" className="h-full w-full object-contain"/> : <><video ref={videoRef} muted playsInline className="h-full w-full object-contain"/><VideoGuide videoRef={videoRef} kind="id" ready={progress > 0}/></>}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Loader2 className="animate-spin" size={40}/></div>}
      </div>
      <p role={error ? 'alert' : 'status'} className={`my-3 text-center text-sm ${error ? 'text-red-300' : 'text-slate-200'}`}>{error || (!captured ? message : 'Photo captured. Retake if blurry or cropped.')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {!captured && <button type="button" disabled={busy} onClick={() => void start(facing === 'environment' ? 'user' : 'environment')} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3"><FlipHorizontal2 size={18}/>Switch camera</button>}
        {(captured || error) && <button type="button" onClick={() => void start()} className="rounded-xl bg-white/10 px-5 py-3">Retry photo</button>}
        {captured && <button type="button" onClick={() => { if (accepted.current) return; accepted.current = true; onCapture(captured); close(); }} className="rounded-xl bg-blue-600 px-5 py-3 font-bold">Use this photo</button>}
      </div>
    </div>}
  </>;
}
