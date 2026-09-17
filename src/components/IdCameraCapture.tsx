import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FlipHorizontal2, Loader2, RefreshCw, X } from 'lucide-react';

interface IdCameraCaptureProps { side: 'front' | 'back'; disabled?: boolean; onCapture: (file: File) => void; }
type CameraFacing = 'environment' | 'user';

export default function IdCameraCapture({ side, disabled, onCapture }: IdCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<number | null>(null);
  const capturedRef = useRef(false);
  const stableRef = useRef(0);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [facing, setFacing] = useState<CameraFacing>('environment'); const [positionReady, setPositionReady] = useState(false); const [status, setStatus] = useState('Place the entire ID inside the guide.');

  const stopMonitoring = () => { if (monitorRef.current) window.clearInterval(monitorRef.current); monitorRef.current = null; };
  const stopStream = () => { stopMonitoring(); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  useEffect(() => () => stopStream(), []);
  const closeCamera = () => { stopStream(); setOpen(false); setBusy(false); setError(''); setPositionReady(false); capturedRef.current = false; stableRef.current = 0; };

  const captureId = async () => {
    if (capturedRef.current) return;
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    capturedRef.current = true; stopMonitoring(); setBusy(true); setStatus('Capturing ID…');
    const targetRatio = 1.586;
    let width = video.videoWidth * 0.82; let height = width / targetRatio;
    if (height > video.videoHeight * 0.72) { height = video.videoHeight * 0.72; width = height * targetRatio; }
    const sx = (video.videoWidth - width) / 2; const sy = (video.videoHeight - height) / 2;
    canvas.width = Math.round(width); canvas.height = Math.round(height);
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError('Unable to capture the ID image.'); setBusy(false); capturedRef.current = false; return; }
    ctx.drawImage(video, sx, sy, width, height, 0, 0, canvas.width, canvas.height);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('ID photo capture failed.')), 'image/jpeg', 0.93));
      onCapture(new File([blob], `government-id-${side}-${Date.now()}.jpg`, { type:'image/jpeg' }));
      setStatus('ID captured automatically.'); window.setTimeout(closeCamera, 500);
    } catch (e) { setError(e instanceof Error ? e.message : 'Capture failed.'); setBusy(false); capturedRef.current = false; }
  };

  const inspectFrame = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || capturedRef.current) return;
    const sampleWidth = 320; const sampleHeight = 202; canvas.width = sampleWidth; canvas.height = sampleHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently:true }); if (!ctx) return;
    const targetRatio = 1.586; let width = video.videoWidth * 0.82; let height = width / targetRatio;
    if (height > video.videoHeight * 0.72) { height = video.videoHeight * 0.72; width = height * targetRatio; }
    ctx.drawImage(video, (video.videoWidth-width)/2, (video.videoHeight-height)/2, width, height, 0, 0, sampleWidth, sampleHeight);
    const pixels = ctx.getImageData(0,0,sampleWidth,sampleHeight).data;
    let brightness = 0; let edge = 0; let previous = 0;
    for (let i=0;i<pixels.length;i+=4) { const gray=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2]; brightness += gray; if (i>0) edge += Math.abs(gray-previous); previous=gray; }
    const count = pixels.length/4; brightness/=count; edge/=count;
    const acceptable = brightness > 55 && brightness < 225 && edge > 8;
    if (acceptable) { stableRef.current += 1; setPositionReady(true); setStatus(stableRef.current >= 2 ? 'Hold steady — capturing automatically…' : 'Position looks good. Hold steady.'); if (stableRef.current >= 4) void captureId(); }
    else { stableRef.current=0; setPositionReady(false); setStatus(brightness <=55 ? 'Move to brighter lighting.' : brightness >=225 ? 'Reduce glare on the ID.' : 'Fit the ID inside the frame and hold it steady.'); }
  };

  const startCamera = async (cameraFacing: CameraFacing = facing) => {
    setBusy(true); setError(''); stopStream(); capturedRef.current=false; stableRef.current=0;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not supported by this browser.');
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:cameraFacing}, width:{ideal:1920}, height:{ideal:1080} }, audio:false });
      streamRef.current=stream; setOpen(true); await new Promise<void>((resolve)=>requestAnimationFrame(()=>resolve()));
      if (!videoRef.current) throw new Error('Unable to initialize the ID camera preview.');
      videoRef.current.srcObject=stream; await videoRef.current.play(); setStatus('Place the entire ID inside the guide.');
      monitorRef.current=window.setInterval(inspectFrame,300);
    } catch (e) { stopStream(); setOpen(true); setError(e instanceof Error ? e.message : 'Unable to open the camera.'); }
    finally { setBusy(false); }
  };
  const switchCamera = async () => { const next: CameraFacing=facing==='environment'?'user':'environment'; setFacing(next); await startCamera(next); };
  const retry = () => { capturedRef.current=false; stableRef.current=0; setError(''); setPositionReady(false); setStatus('Place the entire ID inside the guide.'); if (!monitorRef.current) monitorRef.current=window.setInterval(inspectFrame,300); };

  return <><button type="button" disabled={disabled} onClick={()=>void startCamera()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"><Camera size={18}/>Take live photo</button>{open && <div className="fixed inset-0 z-[260] flex flex-col bg-slate-950 p-3 text-white sm:p-5"><div className="mb-3 flex items-start justify-between gap-4"><div><p className="font-bold">Photograph ID {side}</p><p className="mt-1 text-xs text-slate-300 sm:text-sm">The camera captures automatically after the card is well positioned and stable.</p></div><button type="button" onClick={closeCamera} className="rounded-xl bg-white/10 p-2"><X/></button></div><div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/20 bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-contain"/><div className={`pointer-events-none absolute left-1/2 top-1/2 aspect-[1.586/1] w-[82%] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 ${positionReady?'border-emerald-400':'border-white/90'} shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] transition-colors`}/>{busy && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="animate-spin" size={42}/></div>}<div className="absolute bottom-4 left-1/2 w-[90%] -translate-x-1/2 rounded-xl bg-black/70 px-4 py-3 text-center text-sm font-semibold">{positionReady && <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-400"/>}{error || status}</div></div><canvas ref={canvasRef} className="hidden"/><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={()=>void switchCamera()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold"><FlipHorizontal2 size={19}/>Switch camera</button><button type="button" onClick={retry} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-semibold"><RefreshCw size={19}/>Retry detection</button></div></div>}</>;
}
