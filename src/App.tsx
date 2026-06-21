import React from "react";
import ParticleCanvas from "./components/ParticleCanvas";
import Header from "./components/Header";
import Library from "./components/Library";
import Reader from "./components/Reader";
import DebugPanel, { initDebugCapture } from "./components/DebugPanel";
import MangaLibrary from "./components/MangaLibrary";
import MangaReader from "./components/MangaReader";
import ImportToast from "./components/ImportToast";
import { useStore } from "./store";

initDebugCapture();

export default function App() {
  const theme = useStore((s) => s.theme);
  const reading = useStore((s) => s.reading);
  const viewMode = useStore((s) => s.viewMode);
  const mangaReading = useStore((s) => s.mangaReading);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [viewMode]);

  React.useEffect(() => {
    const saved = localStorage.getItem("nr-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    useStore.getState().setTheme(saved as any);
    // 恢复毛玻璃强度
    const glass = localStorage.getItem("nr-glass-intensity");
    if (glass) {
      document.documentElement.style.setProperty("--glass-blur", glass + "px");
    }
    // 恢复圆角强度
    const radius = localStorage.getItem("nr-radius-intensity");
    if (radius) {
      const v = Number(radius);
      const sm = Math.max(2, Math.round(v * 0.5));
      const md = v;
      const lg = Math.min(32, Math.round(v * 1.4));
      const xl = Math.min(40, Math.round(v * 2));
      document.documentElement.style.setProperty("--radius-sm", sm + "px");
      document.documentElement.style.setProperty("--radius-md", md + "px");
      document.documentElement.style.setProperty("--radius-lg", lg + "px");
      document.documentElement.style.setProperty("--radius-xl", xl + "px");
    }
  }, []);

  return (
    <>
      <ParticleCanvas />
      <div
        className="theme-fade"
        id="theme-fade"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 0.5s ease",
          background: "radial-gradient(circle at 50% 50%, rgba(var(--accent-rgb),0.08) 0%, transparent 60%)",
        }}
      />
      <Header />
      <div ref={scrollRef} style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr",
        overflow: "hidden",
      }}>
        <div style={{
          gridArea: "1 / 1",
          opacity: viewMode === "library" && !reading ? 1 : 0,
          pointerEvents: viewMode === "library" && !reading ? "auto" : "none",
          transition: "opacity 0.4s ease",
          overflowY: "auto",
        }}>
          <Library />
        </div>
        <div style={{
          gridArea: "1 / 1",
          opacity: viewMode === "manga" && !mangaReading ? 1 : 0,
          pointerEvents: viewMode === "manga" && !mangaReading ? "auto" : "none",
          transition: "opacity 0.4s ease",
          overflowY: "auto",
        }}>
          <MangaLibrary />
        </div>
      </div>
      {reading && <Reader />}
      {mangaReading && <MangaReader />}
      <DebugPanel />
      <ImportToast />
    </>
  );
}

export function flashThemeFade(x?: number, y?: number) {
  const el = document.getElementById("theme-fade");
  if (!el) return;
  if (x !== undefined) {
    el.style.setProperty("--tx", x + "px");
    el.style.setProperty("--ty", y + "px");
  }
  el.classList.remove("active");
  void el.offsetHeight;
  el.classList.add("active");
  clearTimeout((el as any)._t);
  (el as any)._t = setTimeout(() => el.classList.remove("active"), 500);
}
