import { useEffect, useRef } from "react";
import { useStore } from "../store";

export default function ImportToast() {
  const importProgress = useStore((s) => s.importProgress);
  const setImportProgress = useStore((s) => s.setImportProgress);
  const mangaReading = useStore((s) => s.mangaReading);
  const reading = useStore((s) => s.reading);
  const triggerRefresh = useStore((s) => s.triggerRefresh);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ title: string; status: string; message: string }>(
        "comic-import-progress",
        (event) => {
          const { status, message, title } = event.payload;
          setImportProgress({ title, status, message });

          // 渲染完成时刷新主页面
          if (status === "done") {
            triggerRefresh();
          }

          clearTimeout(timerRef.current);
          if (status === "done" || status === "error") {
            timerRef.current = window.setTimeout(() => {
              setImportProgress(null);
            }, status === "error" ? 6000 : 1500);
          }
        }
      );
    })();
    return () => {
      unlisten?.();
      clearTimeout(timerRef.current);
    };
  }, []);

  if (!importProgress || mangaReading || reading) return null;

  const isProcessing = importProgress.status === "processing";

  return (
    <div style={{
      position: "fixed",
      bottom: 64,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9998,
      background: isProcessing
        ? "var(--glass-bg)"
        : importProgress.status === "error"
          ? "rgba(200,60,50,0.15)"
          : "rgba(var(--accent-rgb),0.12)",
      backdropFilter: "blur(var(--glass-blur)) saturate(var(--glass-saturate))",
      border: "1px solid var(--border-glass)",
      borderRadius: "var(--radius-md)",
      padding: "14px 28px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: "0 8px 32px var(--shadow)",
      animation: "tipIn 0.35s ease",
      maxWidth: "90vw",
    }}>
      {isProcessing ? (
        <span style={{
          width: 18, height: 18, borderRadius: "var(--radius-full)",
          border: "2px solid rgba(var(--accent-rgb),0.2)",
          borderTopColor: "var(--accent)",
          animation: "spin 0.8s linear infinite",
          flexShrink: 0,
        }} />
      ) : importProgress.status === "error" ? (
        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>⚠️</span>
      ) : (
        <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>✅</span>
      )}
      <div style={{
        color: importProgress.status === "error" ? "#e07060" : "var(--text)",
        fontSize: ".85rem",
        lineHeight: 1.5,
        fontWeight: 400,
      }}>
        {importProgress.message}
      </div>
      {isProcessing && (
        <div style={{
          width: 80, height: 3, borderRadius: 2,
          background: "rgba(var(--accent-rgb),0.12)", overflow: "hidden", flexShrink: 0,
        }}>
          <div style={{
            width: "40%", height: "100%", borderRadius: 2,
            background: "var(--accent)",
            animation: "importBar 1.4s ease-in-out infinite",
          }} />
        </div>
      )}
    </div>
  );
}
