import { useEffect, useRef } from 'react';

export function useReaderKeyboard(
  keybindings: { fontSizeUp: string; fontSizeDown: string },
  fontSize: number,
  setFontSize: (s: number) => void,
  onArrowLeft: () => void,
  onArrowRight: () => void,
  recordingKey: string | null,
) {
  // 使用 ref 保持最新的回调引用
  const onArrowLeftRef = useRef(onArrowLeft);
  const onArrowRightRef = useRef(onArrowRight);
  useEffect(() => { onArrowLeftRef.current = onArrowLeft; }, [onArrowLeft]);
  useEffect(() => { onArrowRightRef.current = onArrowRight; }, [onArrowRight]);

  useEffect(() => {
    function matchKey(e: KeyboardEvent, shortcut: string): boolean {
      const parts = shortcut.toLowerCase().split('+');
      const key = parts.pop()!;
      if (e.key.toLowerCase() !== key) return false;
      return (
        parts.includes('ctrl') === (e.ctrlKey || e.metaKey) &&
        parts.includes('shift') === e.shiftKey &&
        parts.includes('alt') === e.altKey
      );
    }

    const handler = (e: KeyboardEvent) => {
      if (recordingKey) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (matchKey(e, keybindings.fontSizeUp)) {
        e.preventDefault();
        setFontSize(fontSize + 0.1);
      } else if (matchKey(e, keybindings.fontSizeDown)) {
        e.preventDefault();
        setFontSize(fontSize - 0.1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onArrowRightRef.current();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onArrowLeftRef.current();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fontSize, keybindings, setFontSize, recordingKey]);
}
