"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The 44-second explainer, in a frame that belongs to this site.
 *
 * ## Why it is served from `public/` and not embedded
 *
 * It arrived as a Google Drive link. A Drive iframe would have been one line,
 * and would have cost a third-party frame, Google's cookies on our visitors, a
 * player wearing Drive's chrome instead of ours, and a dependency on a sharing
 * setting somebody could change by accident. At **2.08 MB** the file is smaller
 * than a couple of the photographs on most marketing sites, so it is simply
 * ours: `public/video/explainer.mp4`, H.264 and AAC.
 *
 * ## Autoplay, and the three things that make it acceptable
 *
 * Asked for, and fine here — but only because of what the video is. Measured
 * rather than assumed: the audio is bass-dominant (−22.7 dB below 200 Hz
 * against −30.8 dB in the 1.5 kHz speech band) with a single pause in
 * forty-four seconds, which is a music bed and not narration. So **nothing is
 * lost by starting it muted**, which is the only way any browser will start it
 * at all.
 *
 *   1. **Muted.** Autoplay with sound is blocked everywhere and deserves to be.
 *      The sound control is on the frame, not hidden behind a hover.
 *   2. **Only when it is on screen.** An `IntersectionObserver` starts it when
 *      it comes into view and pauses it when it leaves. Otherwise every visitor
 *      who came to read the page pays 2 MB for a video they scrolled past.
 *   3. **Never under `prefers-reduced-motion`.** Somebody who has asked their
 *      operating system to stop things moving has asked for this too. They get
 *      the poster and a play button, and the decision stays theirs.
 *
 * ## The controls are ours
 *
 * The native bar is a different product's design language on our page — the
 * screenshot that prompted this had iOS chrome sitting across the frame. These
 * are a mono label, a lure progress line and two buttons, which is what the
 * rest of the site is made of. They are real buttons with real labels, so
 * keyboard and screen-reader users get the same thing.
 */

const DURATION_LABEL = "44 seconds";

export default function Explainer({
  src = "/video/explainer.mp4",
  poster = "/video/explainer-poster.jpg",
  label = "What it does",
}: {
  src?: string;
  poster?: string;
  label?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  /** True once it has played at all, so the poster overlay can retire. */
  const [touched, setTouched] = useState(false);

  /**
   * Held in state, not read during render.
   *
   * The first version computed this inline. On the server `window` is absent,
   * so it rendered `false`, and React kept the server's attributes through
   * hydration — which meant a visitor who had asked for no motion still got
   * `preload="auto"` and downloaded the whole file. Measured, not guessed: a
   * reduced-motion page reported `preload: auto` until this moved into an
   * effect.
   */
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  // Play while visible, pause while not. `autoPlay` on the element would start
  // it on load wherever it sits on the page; this ties it to being looked at.
  useEffect(() => {
    const v = video.current;
    const f = frame.current;
    if (!v || !f || reduceMotion) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // `catch` and not `void`: a browser can still refuse, and an
          // unhandled rejection in the console is a worse outcome than a video
          // that waits for a click.
          v.play().catch(() => undefined);
        } else {
          v.pause();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(f);
    return () => io.disconnect();
  }, [reduceMotion]);

  return (
    <figure style={{ margin: 0 }}>
      <div
        ref={frame}
        style={{
          border: "1px solid var(--line)",
          background: "#0E1520",
          overflow: "hidden",
        }}
      >
        {/* The label strip. Mono, uppercase, tracked — the same voice the app
            uses for anything we computed, and the thing that makes this read as
            part of the site rather than a video dropped onto it. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "10px 14px",
            borderBottom: "1px solid #26303C",
            background: "#131C29",
          }}
        >
          <span className="lab" style={{ color: "#8A929B" }}>{label}</span>
          <span className="lab" style={{ color: "#5B6470" }}>{DURATION_LABEL}</span>
        </div>

        <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#0E1520" }}>
          <video
            ref={video}
            src={src}
            poster={poster}
            muted={muted}
            loop
            playsInline
            // Always metadata, for everybody. `play()` fetches what it needs
            // when the observer fires, so nobody pays 2 MB for a video they
            // scrolled past — and the reduced-motion case cannot regress into
            // downloading a file it will never play.
            preload="metadata"
            onPlay={() => {
              setPlaying(true);
              setTouched(true);
            }}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress((v.currentTime / v.duration) * 100);
            }}
            onClick={toggle}
            style={{ width: "100%", height: "100%", display: "block", cursor: "pointer" }}
          >
            <p className="small" style={{ padding: 24, color: "#B9BFB6" }}>
              Your browser will not play this video.{" "}
              <a href={src} style={{ textDecoration: "underline" }}>
                Download it instead
              </a>
              .
            </p>
          </video>

          {/* Shown until it has played once — which, with autoplay on, is only
              the reduced-motion case and the moment before the observer fires.
              Without it there is a beat of dark frame that looks like a stall. */}
          {!touched && (
            <button
              type="button"
              aria-label={`Play the explainer, ${DURATION_LABEL}`}
              onClick={toggle}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                border: 0,
                background: "rgba(14, 21, 32, 0.55)",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  background: "var(--lure)",
                  color: "#0E1520",
                  borderRadius: 999,
                  padding: "14px 24px",
                  font: "600 15px var(--font-sans), sans-serif",
                }}
              >
                <svg width="13" height="15" viewBox="0 0 14 16" aria-hidden>
                  <path d="M1 1.5v13l12-6.5z" fill="currentColor" />
                </svg>
                Watch it — {DURATION_LABEL}
              </span>
            </button>
          )}
        </div>

        {/* Our controls, not the browser's. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 14px",
            borderTop: "1px solid #26303C",
            background: "#131C29",
          }}
        >
          <Control onClick={toggle} label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                <path d="M0 0h3v12H0zM7 0h3v12H7z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
                <path d="M0 0v12l10-6z" fill="currentColor" />
              </svg>
            )}
          </Control>

          {/* A line, not a scrubber. It says where you are; the video is
              forty-four seconds and nobody needs to seek within it. */}
          <div
            style={{ flex: 1, height: 2, background: "#26303C", overflow: "hidden" }}
            aria-hidden
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: "var(--lure)",
                transition: "width 0.2s linear",
              }}
            />
          </div>

          <Control
            onClick={() => {
              const v = video.current;
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
            label={muted ? "Sound on" : "Sound off"}
          >
            <span className="lab" style={{ color: "inherit" }}>
              {muted ? "Sound on" : "Sound off"}
            </span>
          </Control>
        </div>
      </div>
    </figure>
  );
}

function Control({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid #26303C",
        background: "transparent",
        color: "#B9BFB6",
        borderRadius: 999,
        padding: "5px 12px",
        cursor: "pointer",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}
