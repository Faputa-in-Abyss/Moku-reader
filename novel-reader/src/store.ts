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

type ThemeMode = "light" | "dark" | "auto";
type ReadingMode = "scroll" | "page";

interface AppStore {
  // 主题
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;

  // 阅读模式
  readingMode: ReadingMode;
  setReadingMode: (m: ReadingMode) => void;

  // 书库
  books: BookData[];
  setBooks: (books: BookData[]) => void;

  // 阅读状态
  reading: boolean;
  currentBook: BookData | null;
  currentChapter: number;
  openReader: (book: BookData) => void;
  closeReader: () => void;
  setChapter: (idx: number) => void;

  // 字号
  fontSize: number;
  setFontSize: (s: number) => void;

  // 侧栏/设置
  sidebarOpen: boolean;
  setSidebarOpen: (o: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;

  // 书库刷新标记
  refreshKey: number;
  triggerRefresh: () => void;
}

export const useStore = create<AppStore>((set, get) => ({
  theme: (localStorage.getItem("nr-theme") as ThemeMode) || "auto",

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
    set({
      reading: false,
      currentBook: null,
      currentChapter: 0,
      sidebarOpen: false,
      settingsOpen: false,
    }),

  setChapter: (idx) => set({ currentChapter: idx }),

  fontSize: 1.2,
  setFontSize: (s) => set({ fontSize: Math.min(2, Math.max(0.8, s)) }),

  sidebarOpen: false,
  setSidebarOpen: (o) => set({ sidebarOpen: o }),
  settingsOpen: false,
  setSettingsOpen: (o) => set({ settingsOpen: o }),

  refreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
