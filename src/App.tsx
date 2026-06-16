import React from "react";
import ParticleCanvas from "./components/ParticleCanvas";
import Header from "./components/Header";
import Library from "./components/Library";
import Reader from "./components/Reader";
import DebugPanel, { initDebugCapture } from "./components/DebugPanel";
import OnlineSearch from "./components/OnlineSearch";
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

  React.useEffect(() => {
    const saved = localStorage.getItem("nr-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    useStore.getState().setTheme(saved as any);
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
      {viewMode === "library" && !reading && <Library />}
      {viewMode === "manga" && !mangaReading && <MangaLibrary />}
      {reading && <Reader />}
      {mangaReading && <MangaReader />}
      <DebugPanel />
      <OnlineSearch />
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
