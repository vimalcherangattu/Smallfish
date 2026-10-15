"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Something to do while a read runs.
 *
 * ## Which wait this is for
 *
 * Not the pool count, which is ten seconds and needs to feel brisk rather than
 * entertaining. This is for the **read**, which opens a few hundred websites
 * politely and takes minutes. A progress bar that creeps for four minutes
 * reads as broken however honest it is, and the owner's instinct is right:
 * the wait is the problem, and a wait with something in it is a different
 * wait.
 *
 * ## Three rules it must not break
 *
 * - **It never delays or hides the answer.** It is mounted beside the
 *   progress, not in front of it, and the parent unmounts it the moment the
 *   read lands. Nobody has to quit a game to see what they paid for.
 * - **It cannot be lost.** No game over, no score to protect, no restart. Eat
 *   a bigger fish and you shrink a little and carry on. A fail state would
 *   turn a wait for something they want into a small defeat, which is a
 *   strange thing to hand somebody.
 * - **It does not start itself.** Autoplaying motion at a person who is
 *   waiting for a list is presumptuous, and under `prefers-reduced-motion` it
 *   is worse than that. There is a button, and the still frame behind it says
 *   what it is.
 *
 * ## Why a fish
 *
 * The product's whole metaphor: a small fish looking for the right small fish
 * among a lot of them, and keeping clear of the big ones. It costs nothing to
 * have the idle moment say what the thing does.
 *
 * No library. A canvas, one animation frame loop, about two hundred lines.
 * Adding a game engine to a lead tool for a four minute wait would be a
 * dependency nobody could justify at the next audit.
 */

interface Fish {
  x: number;
  y: number;
  /** Radius in px. Bigger than the player eats, smaller gets eaten. */
  r: number;
  /** Pixels per second, signed: negative swims left. */
  vx: number;
  /** A gentle bob, so they do not travel in rulers. */
  bob: number;
  hue: string;
}

const INK = "#0E1520";
const LURE = "#C8F03C";
const MUTED = "#8A929B";
const SHOAL = ["#9FB4C7", "#B6C7B0", "#C9BBA8", "#A8B8C9"];

/** Starting radius. Small, because the point is to grow. */
const START_R = 9;
const MAX_R = 34;

export default function FishGame({ label = "A game while you wait" }: { label?: string }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [eaten, setEaten] = useState(0);

  // Everything the loop mutates lives in refs. State here would re-render at
  // sixty frames a second, on a page that is already polling a job.
  const player = useRef({ x: 0, y: 0, r: START_R, tx: 0, ty: 0 });
  const shoal = useRef<Fish[]>([]);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const score = useRef(0);

  const reset = useCallback((w: number, h: number) => {
    player.current = { x: w / 2, y: h / 2, r: START_R, tx: w / 2, ty: h / 2 };
    shoal.current = [];
    score.current = 0;
    setEaten(0);
  }, []);

  const spawn = useCallback((w: number, h: number): Fish => {
    const fromLeft = Math.random() < 0.5;
    // Sized around the player, so there is always something to eat and
    // something to dodge however big they have grown.
    const me = player.current.r;
    const r = Math.max(5, me * (0.35 + Math.random() * 1.5));
    return {
      x: fromLeft ? -r * 3 : w + r * 3,
      y: r + Math.random() * Math.max(1, h - r * 2),
      r,
      vx: (fromLeft ? 1 : -1) * (26 + Math.random() * 46),
      bob: Math.random() * Math.PI * 2,
      hue: SHOAL[Math.floor(Math.random() * SHOAL.length)]!,
    };
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);

    const fish = (x: number, y: number, r: number, colour: string, facing: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(facing < 0 ? -1 : 1, 1);
      ctx.fillStyle = colour;
      // Body.
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.68, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tail.
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, 0);
      ctx.lineTo(-r * 1.7, -r * 0.6);
      ctx.lineTo(-r * 1.7, r * 0.6);
      ctx.closePath();
      ctx.fill();
      // Eye, which is what makes it read as a fish at nine pixels.
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(r * 0.42, -r * 0.16, Math.max(1, r * 0.13), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    for (const f of shoal.current) fish(f.x, f.y, f.r, f.hue, f.vx);
    const me = player.current;
    fish(me.x, me.y, me.r, LURE, me.tx - me.x >= 0 ? 1 : -1);
  }, []);

  /** One frame. Movement, eating, spawning, drawing. */
  const step = useCallback(
    (now: number) => {
      const el = canvas.current;
      const ctx = el?.getContext("2d");
      if (!el || !ctx) return;

      const w = el.clientWidth;
      const h = el.clientHeight;
      const dt = Math.min(0.05, (now - (last.current || now)) / 1000);
      last.current = now;

      // Ease toward the pointer rather than snapping to it: a fish that
      // teleports is a cursor, and this should feel like swimming.
      const me = player.current;
      me.x += (me.tx - me.x) * Math.min(1, dt * 7);
      me.y += (me.ty - me.y) * Math.min(1, dt * 7);

      for (const f of shoal.current) {
        f.x += f.vx * dt;
        f.bob += dt * 2.2;
        f.y += Math.sin(f.bob) * 10 * dt;
      }

      // Eat, or be nudged. Compared on centre distance against the sum of the
      // radii, which is forgiving at the edges and reads as fair.
      shoal.current = shoal.current.filter((f) => {
        const hit = Math.hypot(f.x - me.x, f.y - me.y) < f.r + me.r * 0.72;
        if (!hit) return true;
        if (f.r < me.r) {
          me.r = Math.min(MAX_R, me.r + f.r * 0.09);
          score.current += 1;
          setEaten(score.current);
          return false;
        }
        // Bigger fish: shrink, never end. Carry on swimming.
        me.r = Math.max(START_R, me.r - 2.2);
        return true;
      });

      shoal.current = shoal.current.filter((f) => f.x > -f.r * 5 && f.x < w + f.r * 5);
      if (shoal.current.length < 9 && Math.random() < dt * 5) {
        shoal.current.push(spawn(w, h));
      }

      draw(ctx, w, h);
      raf.current = requestAnimationFrame(step);
    },
    [draw, spawn],
  );

  // Size the backing store to the device pixel ratio, or the fish are mush on
  // a retina screen. Re-measured on resize, because the column is fluid.
  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const fit = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = box.clientWidth;
      const h = el.clientHeight || 240;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.max(1, Math.floor(h * dpr));
      el.style.width = `${w}px`;
      const ctx = el.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!playing) {
        reset(w, h);
        // A still frame, so the button sits on something that looks like what
        // pressing it gets you.
        shoal.current = [spawn(w, h), spawn(w, h), spawn(w, h)];
        shoal.current.forEach((f, i) => {
          f.x = w * (0.25 + i * 0.25);
        });
        if (ctx) draw(ctx, w, h);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [draw, playing, reset, spawn]);

  useEffect(() => {
    if (!playing) return;
    last.current = 0;
    raf.current = requestAnimationFrame(step);
    // A loop left running behind a hidden tab burns battery for nobody.
    const onHide = () => {
      if (document.hidden && raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      } else if (!document.hidden && !raf.current) {
        last.current = 0;
        raf.current = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [playing, step]);

  const aim = (clientX: number, clientY: number) => {
    const el = canvas.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    player.current.tx = clientX - box.left;
    player.current.ty = clientY - box.top;
  };

  return (
    <div ref={wrap} style={{ marginTop: 22, maxWidth: 520 }}>
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvas}
          style={{
            height: 240,
            width: "100%",
            display: "block",
            borderRadius: 14,
            background: "#F2F4EF",
            touchAction: "none",
            cursor: playing ? "none" : "default",
          }}
          onPointerMove={(e) => playing && aim(e.clientX, e.clientY)}
          onPointerDown={(e) => playing && aim(e.clientX, e.clientY)}
        />
        {/* The button is styled inline rather than with a class, for two
            reasons. This mounts on screens drawn from two different
            stylesheets (the kit on `/app/find`, the `.sf-*` utilities on the
            run page), and a `.btn` would pick up the lure colour on one of
            them, which `check_lure.mjs` counts and §12 allows only one of per
            screen. A game is not the one thing a screen wants you to press. */}
        {!playing && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              background: "#FFFFFF",
              border: `1px solid ${MUTED}`,
              borderRadius: 999,
              padding: "9px 18px",
              font: "500 13.5px 'Libre Franklin', system-ui, sans-serif",
              color: INK,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        )}
      </div>
      <p className="t-s" style={{ marginTop: 8 }}>
        {playing
          ? `Eat the smaller ones, dodge the big ones. ${eaten} so far.`
          : "Your reading carries on either way."}
      </p>
    </div>
  );
}
