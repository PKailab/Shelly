/**
 * useTtydConnection — TTYタブ用の接続管理フック
 *
 * ttydへのfetch HEAD接続チェックを行い、3秒間隔で最大5回リトライ。
 * リトライ上限後にセットアップガイドを表示する。
 * AppState連携でフォアグラウンド復帰時にリトライカウンターをリセットして再接続。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useTerminalStore } from '@/store/terminal-store';

type TtydStatus = 'connecting' | 'connected' | 'error';

const RETRY_INTERVAL = 3000;
const MAX_RETRIES = 5;

export function useTtydConnection() {
  const { termuxSettings } = useTerminalStore();
  const ttyUrl = termuxSettings.ttyUrl || 'http://localhost:7681';

  const [status, setStatus] = useState<TtydStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);

  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>('active');
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(ttyUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }, [ttyUrl]);

  const startRetryLoop = useCallback(() => {
    clearTimer();
    retryCountRef.current = 0;
    if (mountedRef.current) {
      setRetryCount(0);
      setStatus('connecting');
    }

    const tick = async () => {
      if (!mountedRef.current) return;
      if (retryCountRef.current >= MAX_RETRIES) {
        setStatus('error');
        return;
      }

      const ok = await checkConnection();
      if (!mountedRef.current) return;

      if (ok) {
        setStatus('connected');
        return;
      }

      retryCountRef.current += 1;
      setRetryCount(retryCountRef.current);

      if (retryCountRef.current >= MAX_RETRIES) {
        setStatus('error');
        return;
      }

      timerRef.current = setTimeout(tick, RETRY_INTERVAL);
    };

    tick();
  }, [checkConnection, clearTimer]);

  // Manual retry — reset counters and restart
  const retry = useCallback(() => {
    startRetryLoop();
  }, [startRetryLoop]);

  // Called by WebView onLoadEnd — mark connected
  const onWebViewLoad = useCallback(() => {
    clearTimer();
    if (mountedRef.current) {
      setStatus('connected');
    }
  }, [clearTimer]);

  // Called by WebView onError — start retry loop
  const onWebViewError = useCallback(() => {
    startRetryLoop();
  }, [startRetryLoop]);

  // Start on mount
  useEffect(() => {
    mountedRef.current = true;
    startRetryLoop();
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [ttyUrl]);

  // AppState: reset retry counter on foreground resume
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && prev !== 'active') {
        // Foreground resume — reset and reconnect
        startRetryLoop();
      }
    });
    return () => sub.remove();
  }, [startRetryLoop]);

  return {
    status,
    retryCount,
    retry,
    onWebViewLoad,
    onWebViewError,
    ttyUrl,
  };
}
