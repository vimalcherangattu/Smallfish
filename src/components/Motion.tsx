"use client";

import { useEffect } from "react";

/**
 * The home page's choreography, installed once.
 *
 * Four behaviours, all from the design document and none of them decoration
 * for its own sake:
 *
 *   1. **Reveal on scroll.** Blocks arrive as you reach them, and a group with
 *      `.stagger` arrives a child at a time — which is how the junk list draws
 *      its strike-throughs one row after another.
 *   2. **Count up the measured numbers.** The numbers *are* the argument on
 *      this page, so they are the thing that moves. Only elements carrying
 *      `data-count`, and the value it counts to is the value already rendered
 *      server-side — a reader with no JavaScript sees the final number, not a
 *      zero.
 *   3. **Cards lean toward the pointer.** A couple of degrees, on a mouse only.
 *   4. **The big buttons drift toward the cursor.** Twelve pixels at most.
 *
 * ## The two things this is careful about
 *
 * **`.js` goes on `<html>` from here**, not from the server, and the CSS hides
 * nothing until it is present. If this component never runs — a bundle that
 * failed, a browser that refused — the page is fully readable and simply
 * still. Content does not depend on script.
 *
 * **Everything checks `prefers-reduced-motion` first**, and pointer effects
 * also check `hover: hover`, so a touch screen never gets a tilt it cannot
 * aim and a laptop in low-power mode is left alone.
 */
export default function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js");

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const canHover = window.matchMedia?.("(hover: hover)").matches ?? false;
    const cleanups: Array<() => void> = [() => root.classList.remove("js")];

    // --- 1. reveal ---------------------------------------------------------
    //
    // An observer alone is not enough, and this was found by measuring rather
    // than reasoning. IntersectionObserver fires when the *intersection
    // changes*. Jump the scroll to the bottom — Cmd+End, a hash link, a hard
    // flick on a trackpad — and an element goes from "below the viewport, not
    // intersecting" straight to "above it, not intersecting". The ratio was 0
    // and is still 0, so no callback runs and the element stays at opacity 0
    // for as long as the page is open. A first render of this left 21 blocks
    // permanently invisible after one jump to the foot of the page.
    //
    // So: the observer for the ordinary case, and a cheap sweep on scroll for
    // everything it cannot see. Both stop as soon as nothing is left hidden.
    const revealables = Array.from(
      document.querySelectorAll<HTMLElement>(".rise, .stagger, .dotfield"),
    );
    const show = (el: Element) => el.classList.add("in");

    if (!("IntersectionObserver" in window) || reduce) {
      revealables.forEach(show);
    } else {
      const pending = new Set(revealables);

      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            show(e.target);
            pending.delete(e.target as HTMLElement);
            io.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
      );
      revealables.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());

      // The sweep: anything whose top has reached the bottom of the window has
      // been arrived at, whether or not the observer ever saw it happen.
      let raf: number | null = null;
      const sweep = () => {
        raf = null;
        for (const el of Array.from(pending)) {
          if (el.getBoundingClientRect().top < window.innerHeight) {
            show(el);
            pending.delete(el);
            io.unobserve(el);
          }
        }
        if (!pending.size) stop();
      };
      const onScroll = () => {
        if (raf === null) raf = requestAnimationFrame(sweep);
      };
      const stop = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (raf !== null) cancelAnimationFrame(raf);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      cleanups.push(stop);
      sweep();
    }

    // --- 2. count up -------------------------------------------------------
    //
    // The target is read from the attribute, and the element's own text is
    // already that number — so this only ever replays a value the server
    // rendered. It cannot invent one, and if the observer never fires the
    // correct figure is what stays on screen.
    const counters = document.querySelectorAll<HTMLElement>("[data-count]");
    if (counters.length && "IntersectionObserver" in window && !reduce) {
      const nio = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            nio.unobserve(e.target);
            const el = e.target as HTMLElement;
            const to = Number(el.dataset.count ?? 0);
            if (!Number.isFinite(to) || to <= 0) continue;
            let t0 = 0;
            const step = (ts: number) => {
              if (!t0) t0 = ts;
              const p = Math.min((ts - t0) / 1100, 1);
              const eased = 1 - Math.pow(1 - p, 3);
              el.textContent = Math.round(to * eased).toLocaleString();
              if (p < 1) requestAnimationFrame(step);
            };
            el.textContent = "0";
            requestAnimationFrame(step);
          }
        },
        { threshold: 0.5 },
      );
      counters.forEach((el) => nio.observe(el));
      cleanups.push(() => nio.disconnect());
    }

    // --- 3 and 4. pointer effects -----------------------------------------
    if (!reduce && canHover) {
      const bind = (
        el: HTMLElement,
        move: (ev: PointerEvent, r: DOMRect) => void,
        reset: () => void,
      ) => {
        let raf: number | null = null;
        const onMove = (ev: PointerEvent) => {
          if (raf) return;
          const r = el.getBoundingClientRect();
          raf = requestAnimationFrame(() => {
            raf = null;
            move(ev, r);
          });
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", reset);
        cleanups.push(() => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", reset);
          if (raf) cancelAnimationFrame(raf);
        });
      };

      document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) =>
        bind(
          el,
          (ev, r) => {
            const nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
            const ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
            el.style.setProperty("--ry", `${(nx * 2.6).toFixed(2)}deg`);
            el.style.setProperty("--rx", `${(-ny * 1.9).toFixed(2)}deg`);
          },
          () => {
            el.style.setProperty("--ry", "0deg");
            el.style.setProperty("--rx", "0deg");
          },
        ),
      );

      document.querySelectorAll<HTMLElement>("[data-magnet]").forEach((el) =>
        bind(
          el,
          (ev, r) => {
            const x = ((ev.clientX - r.left) / r.width - 0.5) * 12;
            const y = ((ev.clientY - r.top) / r.height - 0.5) * 8;
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          },
          () => {
            el.style.transform = "";
          },
        ),
      );
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
