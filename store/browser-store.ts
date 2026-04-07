import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Bookmark = { label: string; url: string; icon: string };

interface BrowserState {
  bookmarks: Bookmark[];
  addBookmark: (b: Bookmark) => void;
  removeBookmark: (url: string) => void;
  loadBookmarks: () => Promise<void>;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { label: 'YouTube', url: 'https://youtube.com', icon: 'play-circle-outline' },
  { label: 'X', url: 'https://x.com', icon: 'alternate-email' },
  { label: 'GitHub', url: 'https://github.com', icon: 'code' },
  { label: 'localhost', url: 'http://localhost:3000', icon: 'computer' },
];

export const useBrowserStore = create<BrowserState>((set, get) => ({
  bookmarks: DEFAULT_BOOKMARKS,

  addBookmark: (b) => {
    set((s) => {
      const next = [...s.bookmarks, b];
      AsyncStorage.setItem('shelly_bookmarks', JSON.stringify(next)).catch(() => {});
      return { bookmarks: next };
    });
  },

  removeBookmark: (url) => {
    set((s) => {
      const next = s.bookmarks.filter((b) => b.url !== url);
      AsyncStorage.setItem('shelly_bookmarks', JSON.stringify(next)).catch(() => {});
      return { bookmarks: next };
    });
  },

  loadBookmarks: async () => {
    try {
      const raw = await AsyncStorage.getItem('shelly_bookmarks');
      if (raw) set({ bookmarks: JSON.parse(raw) });
    } catch {}
  },
}));
