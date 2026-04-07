import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme-engine';
import { useBrowserStore } from '@/store/browser-store';
import PaneInputBar from '@/components/panes/PaneInputBar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'about:blank';
  // Already has a scheme
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  // Looks like a bare domain (contains a dot, no spaces)
  if (!trimmed.includes(' ') && trimmed.includes('.')) return `https://${trimmed}`;
  // Fall back to a search
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ---------------------------------------------------------------------------
// NavButton
// ---------------------------------------------------------------------------

interface NavButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent: string;
  muted: string;
  surface: string;
  border: string;
}

function NavButton({ label, onPress, disabled, accent, muted, surface, border }: NavButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.navButton,
        { backgroundColor: surface, borderColor: border },
        disabled && styles.navButtonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.navButtonText,
          { color: disabled ? muted : accent },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// BrowserPane
// ---------------------------------------------------------------------------

export interface BrowserPaneProps {
  initialUrl?: string;
}

export default function BrowserPane({ initialUrl = 'about:blank' }: BrowserPaneProps) {
  const theme = useTheme();
  const { background, surface, surfaceAlt, foreground, muted, accent, border } = theme.colors;

  const { bookmarks, addBookmark, loadBookmarks } = useBrowserStore();

  const webviewRef = useRef<WebView>(null);
  const [inputUrl, setInputUrl] = useState(initialUrl === 'about:blank' ? '' : initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    loadBookmarks();
  }, []);

  // Called when the user commits the URL bar
  const handleSubmit = useCallback(() => {
    const url = normalizeUrl(inputUrl);
    setCurrentUrl(url);
  }, [inputUrl]);

  // Sync URL bar with page navigations (e.g. link clicks inside WebView)
  const handleNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    if (state.url && state.url !== 'about:blank') {
      setInputUrl(state.url);
    }
    setCurrentUrl(state.url ?? 'about:blank');
  }, []);

  const handleBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const handleForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  const handleBottomBarSubmit = useCallback((text: string) => {
    const url = normalizeUrl(text);
    setInputUrl(url);
    setCurrentUrl(url);
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── URL bar ─────────────────────────────────────────────────── */}
      <View style={[styles.toolbar, { backgroundColor: surfaceAlt, borderBottomColor: border }]}>
        {/* Back */}
        <NavButton
          label="←"
          onPress={handleBack}
          disabled={!canGoBack}
          accent={accent}
          muted={muted}
          surface={surface}
          border={border}
        />

        {/* Forward */}
        <NavButton
          label="→"
          onPress={handleForward}
          disabled={!canGoForward}
          accent={accent}
          muted={muted}
          surface={surface}
          border={border}
        />

        {/* Refresh */}
        <NavButton
          label="↻"
          onPress={handleRefresh}
          accent={accent}
          muted={muted}
          surface={surface}
          border={border}
        />

        {/* URL TextInput */}
        <TextInput
          style={[
            styles.urlInput,
            {
              backgroundColor: surface,
              borderColor: border,
              color: foreground,
            },
          ]}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={handleSubmit}
          placeholder="Enter a URL"
          placeholderTextColor={muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
        />
      </View>

      {/* ── Bookmarks bar ───────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.bookmarksBar, { backgroundColor: surfaceAlt, borderBottomColor: border }]}
        contentContainerStyle={styles.bookmarksBarContent}
      >
        {bookmarks.map((bm) => (
          <TouchableOpacity
            key={bm.url}
            style={[styles.bookmarkPill, { borderColor: border, backgroundColor: surface }]}
            onPress={() => {
              setInputUrl(bm.url);
              setCurrentUrl(bm.url);
            }}
            accessibilityRole="button"
            accessibilityLabel={bm.label}
          >
            <MaterialIcons
              name={bm.icon as any}
              size={13}
              color={accent}
              style={{ marginRight: 3 }}
            />
            <Text style={[styles.bookmarkLabel, { color: foreground }]} numberOfLines={1}>
              {bm.label.length > 8 ? bm.label.slice(0, 8) : bm.label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* [+] add current URL */}
        <TouchableOpacity
          style={[styles.bookmarkPill, styles.bookmarkAddPill, { borderColor: accent, backgroundColor: surface }]}
          onPress={() => {
            const url = currentUrl && currentUrl !== 'about:blank' ? currentUrl : normalizeUrl(inputUrl);
            if (!url || url === 'about:blank') return;
            // derive a short label from hostname
            let label = url;
            try { label = new URL(url).hostname.replace(/^www\./, ''); } catch {}
            if (label.length > 8) label = label.slice(0, 8);
            addBookmark({ label, url, icon: 'bookmark' });
          }}
          accessibilityRole="button"
          accessibilityLabel="Add bookmark"
        >
          <Text style={[styles.bookmarkLabel, { color: accent }]}>[+]</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── WebView ─────────────────────────────────────────────────── */}
      {currentUrl === 'about:blank' ? (
        <View style={[styles.blankScreen, { backgroundColor: background }]}>
          <Text style={[styles.blankText, { color: muted }]}>Enter a URL above to browse</Text>
        </View>
      ) : (
        <WebView
          ref={webviewRef}
          source={{ uri: currentUrl }}
          style={[styles.webview, { backgroundColor: background }]}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.loadingOverlay, { backgroundColor: background }]}>
              <Text style={[styles.blankText, { color: muted }]}>Loading…</Text>
            </View>
          )}
        />
      )}

      {/* ── Bottom search / navigation bar ──────────────────────────── */}
      <PaneInputBar
        placeholder="Search or enter URL..."
        onSubmit={handleBottomBarSubmit}
      />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 6,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navButtonText: {
    fontSize: 16,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  urlInput: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  bookmarksBar: {
    height: 40,
    borderBottomWidth: 1,
    flexGrow: 0,
  },
  bookmarksBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
    height: 40,
  },
  bookmarkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    borderWidth: 1,
  },
  bookmarkAddPill: {
    borderStyle: 'dashed',
  },
  bookmarkLabel: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  webview: {
    flex: 1,
  },
  blankScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blankText: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
  } as any,
});
