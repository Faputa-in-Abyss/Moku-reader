import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useWindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    (async () => {
      try { setMaximized(await win.isMaximized()); } catch {}
    })();
    const onResize = () => {
      (async () => {
        try { setMaximized(await win.isMaximized()); } catch {}
      })();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [win]);

  const handleMinimize = async () => { try { await win.minimize(); } catch {} };
  const handleMaximizeToggle = async () => {
    try {
      const m = await win.isMaximized();
      if (m) { await win.unmaximize(); setMaximized(false); }
      else { await win.maximize(); setMaximized(true); }
    } catch {}
  };
  const handleClose = async () => { try { await win.close(); } catch {} };

  return { maximized, handleMinimize, handleMaximizeToggle, handleClose };
}
