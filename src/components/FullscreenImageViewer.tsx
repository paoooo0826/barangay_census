import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";

export default function FullscreenImageViewer({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useDialogFocus<HTMLDivElement>(true, onClose, null);
  const stage = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, distance: 0, zoom: 1, px: 0, py: 0 });
  const moved = useRef(false);
  const pressedImage = useRef(false);

  function clamp(zoom: number, x: number, y: number) {
    const image = picture.current;
    const container = stage.current;
    const dx = Math.max(0, ((image?.offsetWidth ?? 0) * zoom - (container?.clientWidth ?? 0)) / 2);
    const dy = Math.max(0, ((image?.offsetHeight ?? 0) * zoom - (container?.clientHeight ?? 0)) / 2);
    return { zoom, x: Math.max(-dx, Math.min(dx, x)), y: Math.max(-dy, Math.min(dy, y)) };
  }
  function zoomTo(value: number) {
    const zoom = Math.max(1, Math.min(4, value));
    setView(current => clamp(zoom, current.x, current.y));
  }
  useEffect(() => {
    setView({ zoom: 1, x: 0, y: 0 });
    setLoaded(false);
    setFailed(false);
  }, [src, retry]);
  useEffect(() => {
    const fit = () => setView({ zoom: 1, x: 0, y: 0 });
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} full-screen image`}
      tabIndex={-1}
      className="fixed inset-0 z-[350] flex h-[100dvh] flex-col bg-slate-950 text-white"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <header className="flex shrink-0 items-center justify-between gap-4 p-3 sm:p-5" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
        <h2 className="min-w-0 break-words text-sm font-semibold sm:text-lg">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close full-screen image" className="shrink-0 rounded-xl bg-white/10 p-3 hover:bg-white/20"><X size={22} /></button>
      </header>
      <div
        ref={stage}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
        onClick={event => { if (event.target === event.currentTarget && !moved.current && !pressedImage.current) onClose(); }}
        onPointerDown={event => {
          moved.current = false;
          pressedImage.current = event.target === picture.current;
          points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const touches = [...points.current.values()];
          gesture.current = {
            x: event.clientX, y: event.clientY, px: view.x, py: view.y, zoom: view.zoom,
            distance: touches.length > 1 ? Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y) : 0,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={event => {
          if (!points.current.has(event.pointerId)) return;
          points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const touches = [...points.current.values()];
          const start = gesture.current;
          if (touches.length > 1 && start.distance > 0) {
            moved.current = true;
            zoomTo(start.zoom * Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y) / start.distance);
          } else if (view.zoom > 1) {
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            moved.current ||= Math.abs(dx) + Math.abs(dy) > 5;
            setView(clamp(view.zoom, start.px + dx, start.py + dy));
          }
        }}
        onPointerUp={event => {
          points.current.delete(event.pointerId);
          const remaining = [...points.current.values()][0];
          if (remaining) gesture.current = { ...gesture.current, x: remaining.x, y: remaining.y, px: view.x, py: view.y, distance: 0 };
        }}
        onPointerCancel={event => points.current.delete(event.pointerId)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          setView(current => clamp(current.zoom, current.x + (event.key === "ArrowLeft" ? -40 : event.key === "ArrowRight" ? 40 : 0), current.y + (event.key === "ArrowUp" ? -40 : event.key === "ArrowDown" ? 40 : 0)));
        }}
        tabIndex={0}
        aria-label="Full image; zoom then drag or use arrow keys to pan"
      >
        {!loaded && !failed && src && <p role="status" className="absolute">Loading image…</p>}
        {failed || !src ? (
          <div role="alert" className="max-w-sm p-6 text-center">
            <p>The attached image is unavailable. Check your connection or reopen the announcement.</p>
            <button type="button" className="mt-4 rounded-xl bg-white/10 px-4 py-3" onClick={() => setRetry(value => value + 1)}>Retry Image</button>
          </div>
        ) : (
          <img
            key={retry}
            ref={picture}
            src={src}
            alt={title}
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            onClick={event => event.stopPropagation()}
            className="max-h-full max-w-full select-none object-contain"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, imageOrientation: "from-image", cursor: view.zoom > 1 ? "grab" : "default" }}
          />
        )}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5">
        <button type="button" disabled={!loaded || view.zoom <= 1} aria-label="Zoom Out" onClick={() => zoomTo(view.zoom - 0.25)} className="rounded-xl bg-white/10 p-3 disabled:opacity-40"><Minus size={20} /></button>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-12 tabular-nums">{Math.round(view.zoom * 100)}%</span>
          <input type="range" aria-label="Image Zoom" min="1" max="4" step="0.05" value={view.zoom} disabled={!loaded} onChange={event => zoomTo(Number(event.target.value))} className="w-28 sm:w-44" />
        </label>
        <button type="button" disabled={!loaded || view.zoom >= 4} aria-label="Zoom In" onClick={() => zoomTo(view.zoom + 0.25)} className="rounded-xl bg-white/10 p-3 disabled:opacity-40"><Plus size={20} /></button>
        <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm"><RotateCcw size={18} />Fit Image</button>
        <p className="w-full text-center text-xs text-slate-300">Zoom to inspect details. Drag, pinch, or use arrow keys to adjust the view.</p>
      </footer>
    </div>
  );
}
