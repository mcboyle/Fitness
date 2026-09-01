import { useEffect, useRef } from 'react';

/**
 * A one-shot confetti burst on a canvas. No library — consistent with the
 * hand-rolled rings, and a dependency for eighty lines of particles isn't worth
 * the bytes on a phone.
 */
export type Intensity = 'big' | 'small';

/** Big for a completed day; small for a rolling goal, which happens far more. */
const PROFILE = {
  big: { count: 220, spread: 1.0, speed: 13, size: 6, lifetime: 3200 },
  small: { count: 60, spread: 0.45, speed: 8, size: 4, lifetime: 1600 },
} as const;

function burst(
  canvas: HTMLCanvasElement,
  colours: string[],
  intensity: Intensity,
  onDone: () => void,
) {
  const profile = PROFILE[intensity];
  const context = canvas.getContext('2d');
  if (!context) return onDone();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  context.scale(dpr, dpr);

  const pieces = Array.from({ length: profile.count }, () => ({
    // The big burst spans the whole width; the small one stays near the middle.
    x: width / 2 + (Math.random() - 0.5) * width * profile.spread,
    y: height * (intensity === 'big' ? 0.5 : 0.35) + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * profile.speed,
    vy: -Math.random() * profile.speed - 3,
    size: profile.size + Math.random() * profile.size,
    spin: (Math.random() - 0.5) * 0.35,
    angle: Math.random() * Math.PI,
    colour: colours[Math.floor(Math.random() * colours.length)],
  }));

  const started = performance.now();
  const LIFETIME = profile.lifetime;

  const frame = (now: number) => {
    const elapsed = now - started;
    context.clearRect(0, 0, width, height);

    for (const piece of pieces) {
      piece.vy += 0.22; // gravity
      piece.vx *= 0.995;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.angle += piece.spin;

      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.globalAlpha = Math.max(0, 1 - elapsed / LIFETIME);
      context.fillStyle = piece.colour;
      context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
      context.restore();
    }

    if (elapsed < LIFETIME) requestAnimationFrame(frame);
    else {
      context.clearRect(0, 0, width, height);
      onDone();
    }
  };

  requestAnimationFrame(frame);
}

export function Confetti({
  fire,
  onDone,
}: {
  /** A new object each time means a new burst, so repeats re-fire. */
  fire: { intensity: Intensity; key: number } | null;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;

    // Skipped entirely, not merely shortened: a full-screen particle burst is
    // exactly what prefers-reduced-motion is asking about.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return;
    }
    if (!canvas.current) return;

    const styles = getComputedStyle(document.documentElement);
    const colours = [
      '--ring-water', '--ring-reading', '--ring-steps', '--ring-workout',
      '--ring-journal', '--ring-sleep', '--ring-eating', '--ring-alcohol',
      '--ring-selfcare',
    ]
      .map((token) => styles.getPropertyValue(token).trim())
      .filter(Boolean);

    burst(canvas.current, colours.length ? colours : ['#ff2d78'], fire.intensity, onDone);
    // `fire.key` is in the dependency list on purpose: completing the same day
    // twice must play twice.
  }, [fire, onDone]);

  if (!fire) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
