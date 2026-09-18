import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { faceGuide, idGuide } from '../lib/captureGuide';

export default function VideoGuide({ videoRef, kind, ready = false }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  kind: 'face' | 'id';
  ready?: boolean;
}) {
  const [style, setStyle] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const scale = Math.min(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
      const frame = (kind === 'id' ? idGuide : faceGuide)(video.videoWidth, video.videoHeight);
      setStyle({
        left: (video.clientWidth - video.videoWidth * scale) / 2 + frame.x * scale,
        top: (video.clientHeight - video.videoHeight * scale) / 2 + frame.y * scale,
        width: frame.width * scale,
        height: frame.height * scale,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(video);
    video.addEventListener('loadedmetadata', update);
    update();
    return () => { observer.disconnect(); video.removeEventListener('loadedmetadata', update); };
  }, [videoRef, kind]);
  return style && <div aria-hidden="true" style={style} className={`pointer-events-none absolute border-[3px] shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] ${kind === 'face' ? 'rounded-[45%]' : 'rounded-xl'} ${ready ? 'border-emerald-400' : 'border-white/90'}`} />;
}
