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
  book_icon?: string;
}

export interface ComicPage {
  index: number;
  filename: string;
  width: number;
  height: number;
}

export interface ComicData {
  id: string;
  title: string;
  source_type: string;
  source_path: string;
  image_dir: string;
  pages: ComicPage[];
  total_pages: number;
  current_page: number;
  direction: string;
  favorite?: boolean;
  book_icon?: string;
}

/** comic_library.json 中除去 pages/image_dir 的轻量摘要，存 localStorage */
export interface ComicMeta {
  id: string;
  title: string;
  source_type: string;
  total_pages: number;
  current_page: number;
  direction: string;
  favorite?: boolean;
  book_icon?: string;
}

type ThemeMode = "light" | "dark";
type ReadingMode = "scroll" | "page";

const DEFAULT_KEYBINDINGS = {
  fontSizeUp: "Ctrl+=",
  fontSizeDown: "Ctrl+-",
};

export interface Bookmark {
  chapterIndex: number;
  chapterTitle: string;
  timestamp: number;
  note?: string;
}

type MangaViewMode = "single" | "double" | "scroll";

interface AppStore {
  // ... existing
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
  fontBold: boolean;
  setFontBold: (b: boolean) => void;
  readerFont: string;
  setReaderFont: (f: string) => void;
  readerTextColor: string;
  setReaderTextColor: (c: string) => void;
  readerBgColor: string;
  setReaderBgColor: (c: string) => void;
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
  bookmarks: Bookmark[];
  addBookmark: (chapterIndex: number, chapterTitle: string) => void;
  removeBookmark: (chapterIndex: number) => void;
  loadBookmarks: (bookId: string) => void;
  saveBookmarks: (bookId: string) => void;
  // Manga state
  viewMode: "library" | "manga";
  setViewMode: (m: "library" | "manga") => void;
  comics: ComicData[];
  setComics: (comics: ComicData[]) => void;
  comicsMeta: ComicMeta[];
  setComicsMeta: (meta: ComicMeta[]) => void;
  mangaReading: boolean;
  currentManga: ComicData | null;
  mangaCurrentPage: number;
  openMangaReader: (manga: ComicData) => void;
  closeMangaReader: () => void;
  setMangaPage: (idx: number) => void;
  mangaViewMode: MangaViewMode;
  setMangaViewMode: (m: MangaViewMode) => void;
  mangaZoom: number;
  setMangaZoom: (z: number) => void;
  // 导入进度
  importProgress: { title: string; status: string; message: string } | null;
  setImportProgress: (p: { title: string; status: string; message: string } | null) => void;
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
  closeReader: () => {
    set({ reading: false, currentBook: null, currentChapter: 0, sidebarOpen: false, settingsOpen: false });
    setTimeout(() => {
      const { triggerRefresh } = useStore.getState();
      triggerRefresh();
    }, 100);
  },
  setChapter: (idx) => set({ currentChapter: idx }),
  fontSize: 1.2,
  setFontSize: (s) => set({ fontSize: Math.min(2.5, Math.max(0.6, s)) }),
  fontBold: false,
  setFontBold: (b) => {
    localStorage.setItem("nr-font-bold", String(b));
    set({ fontBold: b });
  },
  readerFont: localStorage.getItem("nr-reader-font") || "",
  setReaderFont: (f) => {
    localStorage.setItem("nr-reader-font", f);
    set({ readerFont: f });
  },
  readerTextColor: localStorage.getItem("nr-text-color") || "",
  setReaderTextColor: (c) => {
    localStorage.setItem("nr-text-color", c);
    set({ readerTextColor: c });
  },
  readerBgColor: localStorage.getItem("nr-bg-color") || "",
  setReaderBgColor: (c) => {
    localStorage.setItem("nr-bg-color", c);
    set({ readerBgColor: c });
  },
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
  bookmarks: [],
  addBookmark: (chapterIndex, chapterTitle) => {
    const cur = get().bookmarks;
    if (cur.find(b => b.chapterIndex === chapterIndex)) return;
    const next = [...cur, { chapterIndex, chapterTitle, timestamp: Date.now() }];
    set({ bookmarks: next });
    const book = get().currentBook;
    if (book) localStorage.setItem(`nr-bookmarks-${book.id}`, JSON.stringify(next));
  },
  removeBookmark: (chapterIndex) => {
    const next = get().bookmarks.filter(b => b.chapterIndex !== chapterIndex);
    set({ bookmarks: next });
    const book = get().currentBook;
    if (book) localStorage.setItem(`nr-bookmarks-${book.id}`, JSON.stringify(next));
  },
  loadBookmarks: (bookId) => {
    try {
      const raw = localStorage.getItem(`nr-bookmarks-${bookId}`);
      if (raw) set({ bookmarks: JSON.parse(raw) });
      else set({ bookmarks: [] });
    } catch { set({ bookmarks: [] }); }
  },
  saveBookmarks: (bookId) => {
    localStorage.setItem(`nr-bookmarks-${bookId}`, JSON.stringify(get().bookmarks));
  },
  // 持久化漫画列表（仅存 id / title / source_type / total_pages / current_page / direction / favorite / book_icon，不含 pages 和 image_dir）
  comicsMeta: JSON.parse(localStorage.getItem("nr-comics-meta") || "[]") as ComicMeta[],
  setComicsMeta: (meta) => {
    localStorage.setItem("nr-comics-meta", JSON.stringify(meta));
    set({ comicsMeta: meta });
  },
  // Manga state
  viewMode: (localStorage.getItem("nr-view-mode") as "library" | "manga") || "library",
  setViewMode: (m) => {
    localStorage.setItem("nr-view-mode", m);
    set({ viewMode: m });
  },
  comics: [],
  setComics: (comics) => set({ comics }),
  mangaReading: false,
  currentManga: null,
  mangaCurrentPage: 0,
  openMangaReader: (manga) =>
    set({
      mangaReading: true,
      currentManga: manga,
      mangaCurrentPage: manga.current_page || 0,
    }),
  closeMangaReader: () =>
    set({ mangaReading: false, currentManga: null, mangaCurrentPage: 0 }),
  setMangaPage: (idx) => set({ mangaCurrentPage: idx }),
  mangaViewMode: (localStorage.getItem("nr-manga-view") as MangaViewMode) || "single",
  setMangaViewMode: (m) => {
    localStorage.setItem("nr-manga-view", m);
    set({ mangaViewMode: m });
  },
  mangaZoom: 1,
  setMangaZoom: (z) => set({ mangaZoom: Math.min(4, Math.max(0.25, z)) }),
  // 导入进度
  importProgress: null,
  setImportProgress: (p) => set({ importProgress: p }),
}));
