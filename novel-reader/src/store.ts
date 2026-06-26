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
  last_read_at?: number;  // Unix 毫秒时间戳
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
  /** 系列 ID（纯前端标记），同一系列的多本漫画共享一个 seriesId */
  series_id?: string;
  last_read_at?: number;
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
  series_id?: string;
  last_read_at?: number;
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
  /** 段落索引（行级别书签） */
  paragraphIndex?: number;
  /** 段落文本预览（侧边栏显示） */
  textSnippet?: string;
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
  // 底部栏排版状态
  lineHeight: number;
  setLineHeight: (v: number) => void;
  letterSpacing: number;
  setLetterSpacing: (v: number) => void;
  textIndent: number;
  setTextIndent: (v: number) => void;
  textAlign: "left" | "center" | "justify";
  setTextAlign: (a: "left" | "center" | "justify") => void;
  autoFlipInterval: number;
  setAutoFlipInterval: (v: number) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (o: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  novelRefreshKey: number;
  triggerNovelRefresh: () => void;
  comicRefreshKey: number;
  triggerComicRefresh: () => void;
  windowSize: number;
  setWindowSize: (s: number) => void;
  debugPanelOpen: boolean;
  setDebugPanelOpen: (o: boolean) => void;
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
  seriesMap: Record<string, string[]>;
  setSeriesMap: (m: Record<string, string[]>) => void;
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
  importProgress: { title: string; status: string; message: string; current?: number; total?: number } | null;
  setImportProgress: (p: { title: string; status: string; message: string; current?: number; total?: number } | null) => void;
  // 扫描动画状态
  scanAnimating: boolean;
  setScanAnimating: (v: boolean) => void;
  // 扫描完成结果
  scanResult: { novels: number; comics: number; errors: string[] } | null;
  setScanResult: (r: { novels: number; comics: number; errors: string[] } | null) => void;
  // 翻页模式下的双页开关
  readerDoublePage: boolean;
  setReaderDoublePage: (v: boolean) => void;
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
  setBooks: (books) => {
    set({ books });
  },
  reading: false,
  currentBook: null,
  currentChapter: 0,
  openReader: (book) => {
    const state = get();
    const fullBook = state.books.find(b => b.id === book.id) || book;
    set({
      reading: true,
      currentBook: fullBook,
      currentChapter: fullBook.current_chapter || 0,
      sidebarOpen: false,
      settingsOpen: false,
    });
  },
  closeReader: () => {
    set({ reading: false, sidebarOpen: false, settingsOpen: false });
    const { triggerNovelRefresh } = get();
    triggerNovelRefresh();
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
  lineHeight: parseFloat(localStorage.getItem("nr-line-height") || "2"),
  setLineHeight: (v) => {
    localStorage.setItem("nr-line-height", String(v));
    set({ lineHeight: v });
  },
  letterSpacing: parseFloat(localStorage.getItem("nr-letter-spacing") || "0"),
  setLetterSpacing: (v) => {
    localStorage.setItem("nr-letter-spacing", String(v));
    set({ letterSpacing: v });
  },
  textIndent: parseFloat(localStorage.getItem("nr-text-indent") || "2"),
  setTextIndent: (v) => {
    localStorage.setItem("nr-text-indent", String(v));
    set({ textIndent: v });
  },
  textAlign: (localStorage.getItem("nr-text-align") || "justify") as "left" | "center" | "justify",
  setTextAlign: (a) => {
    localStorage.setItem("nr-text-align", a);
    set({ textAlign: a });
  },
  autoFlipInterval: 0,
  setAutoFlipInterval: (v) => set({ autoFlipInterval: v }),
  sidebarOpen: false,
  setSidebarOpen: (o) => set({ sidebarOpen: o }),
  settingsOpen: false,
  setSettingsOpen: (o) => set({ settingsOpen: o }),
  refreshKey: 0,
  novelRefreshKey: 0,
  comicRefreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1, novelRefreshKey: s.novelRefreshKey + 1, comicRefreshKey: s.comicRefreshKey + 1 })),
  triggerNovelRefresh: () => set((s) => ({ novelRefreshKey: s.novelRefreshKey + 1, refreshKey: s.refreshKey + 1 })),
  triggerComicRefresh: () => set((s) => ({ comicRefreshKey: s.comicRefreshKey + 1, refreshKey: s.refreshKey + 1 })),
  windowSize: 2,
  setWindowSize: (s) => set({ windowSize: Math.max(0, Math.min(4, s)) }),
  debugPanelOpen: false,
  setDebugPanelOpen: (o) => set({ debugPanelOpen: o }),
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
    if (cur.find(b => b.chapterIndex === chapterIndex && b.paragraphIndex === undefined)) return;
    const next = [...cur, { chapterIndex, chapterTitle, timestamp: Date.now() }];
    set({ bookmarks: next });
    const book = get().currentBook;
    if (book) localStorage.setItem(`nr-bookmarks-${book.id}`, JSON.stringify(next));
  },
  removeBookmark: (chapterIndex) => {
    const next = get().bookmarks.filter(b => !(b.chapterIndex === chapterIndex && b.paragraphIndex === undefined));
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
  comicsMeta: JSON.parse(localStorage.getItem("nr-comics-meta") || "[]") as ComicMeta[],
  seriesMap: JSON.parse(localStorage.getItem("nr-comic-series") || "{}") as Record<string, string[]>,
  setSeriesMap: (m) => {
    localStorage.setItem("nr-comic-series", JSON.stringify(m));
    set({ seriesMap: m });
  },
  viewMode: (localStorage.getItem("nr-view-mode") as "library" | "manga") || "library",
  setViewMode: (m) => {
    localStorage.setItem("nr-view-mode", m);
    set({ viewMode: m });
  },
  comics: [],
  setComics: (comics) => {
    const meta = comics.map((c): ComicMeta => ({
      id: c.id, title: c.title, source_type: c.source_type,
      total_pages: c.total_pages, current_page: c.current_page,
      direction: c.direction, favorite: c.favorite, book_icon: c.book_icon,
      series_id: c.series_id, last_read_at: c.last_read_at,
    }));
    localStorage.setItem("nr-comics-meta", JSON.stringify(meta));
    set({ comics, comicsMeta: meta });
  },
  mangaReading: false,
  currentManga: null,
  mangaCurrentPage: 0,
  openMangaReader: (manga) =>
    set({
      mangaReading: true,
      currentManga: manga,
      mangaCurrentPage: manga.current_page || 0,
    }),
  closeMangaReader: () => {
    set({ mangaReading: false });
    const { triggerComicRefresh } = get();
    triggerComicRefresh();
  },
  setMangaPage: (idx) => set({ mangaCurrentPage: idx }),
  mangaViewMode: (localStorage.getItem("nr-manga-view") as MangaViewMode) || "single",
  setMangaViewMode: (m) => {
    localStorage.setItem("nr-manga-view", m);
    set({ mangaViewMode: m });
  },
  mangaZoom: 1,
  setMangaZoom: (z) => set({ mangaZoom: Math.min(4, Math.max(0.25, z)) }),
  importProgress: null,
  setImportProgress: (p) => set({ importProgress: p }),
  scanAnimating: false,
  setScanAnimating: (v) => set({ scanAnimating: v }),
  scanResult: null,
  setScanResult: (r) => set({ scanResult: r }),
  readerDoublePage: localStorage.getItem("nr-reader-double") === "true",
  setReaderDoublePage: (v) => { localStorage.setItem("nr-reader-double", String(v)); set({ readerDoublePage: v }); },
}));
