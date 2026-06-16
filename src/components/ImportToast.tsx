import { useEffect, useRef } from "react";
import { useStore } from "../store";

export default function ImportToast() {
  const importProgress = useStore((s) => s.importProgress);
  const setImportProgress = useStore((s) => s.setImportProgress);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    async function init() {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ title: string; status: string; message: string }>(
        "comic-import-progress",
        (event) => {
          const { status, message, title } = event.payload;
          setImportProgress({ title, status, message });

          clearTimeout(timerRef.current);
          if (status === "done" || status === "error") {
            timerRef.current = window.setTimeout(() => {
              setImportProgress(null);
            }, status === "error" ? 6000 : 4000);
          }
        }
      );
    }
    init();
    return () => { clearTimeout(timerRef.current); };
  }, []);

  if (!importProgress) return null;

  const isProcessing = importProgress.status === "processing";

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9998,
      background: isProcessing
        ? "var(--glass-bg)"
        : importProgress.status === "error"
          ? "rgba(200,60,50,0.15)"
          : "rgba(var(--accent-rgb),0.12)",
      backdropFilter: "blur(24px) saturate(1.5)",
      border: "1px solid var(--border-glass)",
      borderRadius: 14,
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
          width: 18, height: 18, borderRadius: "50%",
          border: "2px solid var(--accent)",
          borderTopColor: "transparent",
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
