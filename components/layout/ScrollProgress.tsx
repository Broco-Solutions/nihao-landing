"use client";

import { useEffect, useState } from "react";

export function ScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        const next = max > 0 ? (h.scrollTop / max) * 100 : 0;
        setP(next);
        raf = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-paper/0 pointer-events-none"
    >
      <div
        className="h-full bg-nihao"
        style={{
          transform: `scaleX(${p / 100})`,
          transformOrigin: "left center",
          transition: "transform 80ms linear",
        }}
      />
    </div>
  );
}
