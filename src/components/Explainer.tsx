"use client";

import { useRef, useState } from "react";

/**
 * The 44-second explainer.
 *
 * ## Why it is served from `public/` and not embedded
 *
 * It arrived as a Google Drive link. A Drive iframe would have been one line,
 * and would have cost a third-party frame, Google's cookies on our visitors, a
 * player wearing Drive's chrome instead of ours, and a dependency on a sharing
 * setting somebody could change by accident. At **2.08 MB** the file is smaller
 * than a couple of the photographs on most marketing sites, so it is simply
 * ours: `public/video/explainer.mp4`, H.264 and AAC, which every browser made
 * this decade plays.
 *
 * ## It does not autoplay
 *
 * There is a real audio track. Autoplay with sound is blocked by every browser
 * and deserves to be; autoplay muted would start a 44-second download for
 * everybody who came to read the page. So: a poster frame, a play button, and
 * `preload="metadata"` — a few kilobytes of header, and the rest only if
 * somebody asks for it.
 *
 * The poster is the frame at 26 seconds, where the query being typed is the
 * same sentence block 2 uses as its example. It is chosen rather than left to
 * the browser because the opening frames are nearly empty, and a player that
 * looks like a black rectangle looks broken.
 */

export default function Explainer({
  src = "/video/explainer.mp4",
  poster = "/video/explainer-poster.jpg",
}: {
  src?: string;
  poster?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          position: "relative",
          // Declared, not measured. Without it the page reflows the moment the
          // metadata lands and everything below the video jumps.
          aspectRatio: "16 / 9",
          background: "#0E1520",
          border: "1px solid var(--line)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <video
          ref={ref}
          src={src}
          poster={poster}
          controls={started}
          preload="metadata"
          playsInline
          onPlay={() => setStarted(true)}
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {/* Said in the markup, not only in a caption: a browser that cannot
              play this should offer the file rather than an empty box. */}
          <p className="small" style={{ padding: 24, color: "#B9BFB6" }}>
            Your browser will not play this video.{" "}
            <a href={src} style={{ textDecoration: "underline" }}>
              Download it instead
            </a>
            .
          </p>
        </video>

        {/* Our own play affordance until it starts, so the first thing on
            screen is the brand's shape rather than the browser's grey triangle.
            It is a real button with a real label, so it is reachable by
            keyboard and announced properly. */}
        {!started && (
          <button
            type="button"
            aria-label="Play the 44-second explainer"
            onClick={() => {
              setStarted(true);
              void ref.current?.play();
            }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              width: "100%",
              border: 0,
              // A scrim over the poster. Without it the button lands on top of
              // the sentence being typed in the frame behind it, and the two
              // compete — the poster stays readable, it just stops arguing
              // with the only thing on screen you are meant to click.
              background: "rgba(14, 21, 32, 0.55)",
              cursor: "pointer",
              transition: "background 0.2s ease",
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
              <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden>
                <path d="M1 1.5v13l12-6.5z" fill="currentColor" />
              </svg>
              Watch it — 44 seconds
            </span>
          </button>
        )}
      </div>
    </figure>
  );
}
