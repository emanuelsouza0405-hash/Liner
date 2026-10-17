import { useEffect, useRef, useState } from "react";
import { KawarpEngine } from "../engine/kawarpEngine";
import { getCoverElement, useCoverElement } from "@/features/covers";
import { isLite } from "@/shared/platform";

interface KawarpWrapperProps {
  src?: string;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}

export function KawarpWrapper({ src, onLoad, onError }: KawarpWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<KawarpEngine | null>(null);
  const [loaded, setLoaded] = useState(false);
  const coverElement = useCoverElement(src);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: KawarpEngine | null = null;
    let visibilityCleanup: (() => void) | null = null;
    try {
      engine = new KawarpEngine(canvas, {
        warpIntensity: 1.1,
        blurPasses: isLite() ? 3 : 8,
        transitionDuration: 1000,
        animationSpeed: 1.0,
        saturation: 1.3,
        scale: 1.18,
        dithering: 0.008,
      });
      engineRef.current = engine;
      engine.start();

      // Não gasta GPU com a tela apagada / app em 2º plano
      const onVisibility = () => {
        if (document.hidden) engine?.stop();
        else engine?.start();
      };
      document.addEventListener("visibilitychange", onVisibility);
      visibilityCleanup = () =>
        document.removeEventListener("visibilitychange", onVisibility);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    return () => {
      visibilityCleanup?.();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [onError]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = isLite() ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        engineRef.current?.resize();
      }
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    window.addEventListener("resize", updateSize, { passive: true });
    updateSize();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !src) return;

    let isCancelled = false;
    const element = coverElement || getCoverElement(src);

    engine
      .loadImage(src, element)
      .then(() => {
        if (isCancelled) return;
        setLoaded(true);
        onLoad?.();
      })
      .catch((err) => {
        if (isCancelled) return;
        onError?.(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      isCancelled = true;
    };
  }, [src, coverElement, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full block transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

export default KawarpWrapper;
