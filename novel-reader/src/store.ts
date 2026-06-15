import { create } from "zustand";

export interface Chapter {
  index: number;
  title: string;
  start_pos: number;
  end_pos: number;
}

export interface BookData {
  id: string;
  title: string;
  file_path: string;
  file_type: string;
  total_chapters: number;
  current_chapter: number;
  progress: number;
  chapters: Chapter[];
  favorite?: boolean;
}

type ThemeMode = "light" | "dark";
type ReadingMode = "scroll" | "page";

const DEFAULT_KEYBINDINGS = {
  fontSizeUp: "Ctrl+=",
  fontSizeDown: "Ctrl+-",
};

interface AppStore {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  readingMode: ReadingMode;
  setReadingMode: (m: ReadingMode) => void;
  books: BookData[];
  setBooks: (books: BookData[]) => void;
  reading: boolean;
  currentBook: BookData | null;
  currentChapter: number;
  openReader: (book: BookData) => void;
  closeReader: () => void;
  setChapter: (idx: number) => void;
  fontSize: number;
  setFontSize: (s: number) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (o: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  windowSize: number;
  setWindowSize: (s: number) => void;
  debugPanelOpen: boolean;
  setDebugPanelOpen: (o: boolean) => void;
  onlineSearchOpen: boolean;
  setOnlineSearchOpen: (o: boolean) => void;
  keybindings: { fontSizeUp: string; fontSizeDown: string };
  setKeybinding: (action: "fontSizeUp" | "fontSizeDown", key: string) => void;
}

export const useStore = create<AppStore>((set, get) => ({
  theme: (localStorage.getItem("nr-theme") as ThemeMode) || "dark",
  setTheme: (t) => {
    localStorage.setItem("nr-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    set({ theme: t });
  },
  readingMode: (localStorage.getItem("nr-reading-mode") as ReadingMode) || "page",
  setReadingMode: (m) => {
    localStorage.setItem("nr-reading-mode", m);
    set({ readingMode: m });
  },
  books: [],
  setBooks: (books) => set({ books }),
  reading: false,
  currentBook: null,
  currentChapter: 0,
  openReader: (book) =>
    set({
      reading: true,
      currentBook: book,
      currentChapter: book.current_chapter || 0,
      sidebarOpen: false,
      settingsOpen: false,
    }),
  closeReader: () =>
    set({ reading: false, currentBook: null, currentChapter: 0, sidebarOpen: false, settingsOpen: false }),
  setChapter: (idx) => set({ currentChapter: idx }),
  fontSize: 1.2,
  setFontSize: (s) => set({ fontSize: Math.min(2, Math.max(0.8, s)) }),
  sidebarOpen: false,
  setSidebarOpen: (o) => set({ sidebarOpen: o }),
  settingsOpen: false,
  setSettingsOpen: (o) => set({ settingsOpen: o }),
  refreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  windowSize: 2,
  setWindowSize: (s) => set({ windowSize: Math.max(0, Math.min(4, s)) }),
  debugPanelOpen: false,
  setDebugPanelOpen: (o) => set({ debugPanelOpen: o }),
  onlineSearchOpen: false,
  setOnlineSearchOpen: (o) => set({ onlineSearchOpen: o }),
  keybindings: (() => {
    try {
      return JSON.parse(localStorage.getItem("nr-keybindings") || "null") || DEFAULT_KEYBINDINGS;
    } catch { return DEFAULT_KEYBINDINGS; }
  })(),
  setKeybinding: (action, key) => {
    const cur = get().keybindings;
    const next = { ...cur, [action]: key };
    localStorage.setItem("nr-keybindings", JSON.stringify(next));
    set({ keybindings: next });
  },
}));
