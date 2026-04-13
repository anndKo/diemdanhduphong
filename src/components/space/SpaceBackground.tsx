import { useRef, useEffect, memo } from "react";

const isMobile =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const STAR_COUNT = isMobile ? 120 : 300;

const SpaceBackground = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Generate stars once
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 0.0002 + 0.0001,
      alpha: Math.random() * 0.6 + 0.4,
      twinkleSpeed: Math.random() * 0.003 + 0.001,
    }));

    let t = 0;
    const draw = () => {
      t++;
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const flicker = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed);
        ctx.globalAlpha = s.alpha * flicker;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();

        // Slow drift
        s.y += s.speed;
        if (s.y > 1) s.y = 0;
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ background: "linear-gradient(to bottom, #0a0a1a, #1a1a2e, #0f0f23)" }}
    />
  );
});

SpaceBackground.displayName = "SpaceBackground";
export default SpaceBackground;
