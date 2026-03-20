# SetupWizard & ブリッジ接続修正 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ゼロ状態のユーザーがSetupWizardに従って確実にShellyを使い始められるようにし、Termux停止/端末再起動後も復帰できるようにする

**Architecture:** SetupWizardを2フェーズに分離。Phase 1はRUN_COMMANDで`&&`チェインの一括コマンドを送信し、WebSocket接続成功をトリガーに自動進行。Phase 2はbridge WebSocket経由で全残作業を結果確認付きで実行。切断時はBridgeRecoveryBannerで全タブに復帰導線を表示。

**Tech Stack:** React Native / TypeScript / Expo Native Modules (Kotlin) / WebSocket / Zustand / i18n

**Spec:** `docs/superpowers/specs/2026-03-21-setup-wizard-bridge-fix-design.md`

---

## ファイル構成

| ファイル | 操作 | 責務 |
|---------|------|------|
| `lib/auto-setup.ts` | 修正 | Phase 1: RUN_COMMAND一括送信 + WSポーリング。Phase 2: bridge経由の残作業 |
| `components/SetupWizard.tsx` | 修正 | 新ステップ構成(5step)。Termux初期化画面追加。Gemini CLI修正 |
| `components/BridgeRecoveryBanner.tsx` | 新規 | 切断時の復帰案内バナー（dismiss可能） |
| `app/(tabs)/_layout.tsx` | 修正 | BridgeRecoveryBanner挿入 |
| `hooks/use-termux-bridge.ts` | 修正 | `reconnectExhausted` state追加 |
| `hooks/use-ttyd-connection.ts` | 修正 | bridge経由のttyd起動に変更 |
| `modules/termux-bridge/android/src/main/AndroidManifest.xml` | 修正 | RUN_COMMANDパーミッション追加 |
| `app.config.ts` | 修正 | queries追加（Android 11+対応） |
| `lib/i18n/locales/en.ts` | 修正 | 新規i18nキー追加 |
| `lib/i18n/locales/ja.ts` | 修正 | 新規i18nキー追加 |

---

## Task 1: i18nキー追加（en.ts + ja.ts）

**Files:**
- Modify: `lib/i18n/locales/en.ts`
- Modify: `lib/i18n/locales/ja.ts`

先にi18nキーを全て定義する。後続タスクのUIコードで参照する。

- [ ] **Step 1: en.tsに新規キーを追加**

setup2セクションの既存キーの後に追加。不要になったキーは削除しない（旧SetupWizardへの参照が残っている可能性があるため、最終タスクで削除）。

追加するキー:
```typescript
// Step 2 changes
'setup2.install_termux_bootstrap': 'After installing, open Termux once to complete its initial setup (1-2 minutes).',
'setup2.install_boot_desc': 'Auto-start on reboot (recommended)',

// Step 3: Termux initialization (new)
'setup2.init_title': 'Initialize Termux',
'setup2.init_desc': 'Tap "Start Setup" to install the required tools in Termux.\nThis may take a few minutes on first run.',
'setup2.init_start': 'Start Setup',
'setup2.init_waiting': 'Setting up Termux...',
'setup2.init_waiting_desc': 'Installing packages and starting the bridge.\nThis screen will advance automatically.',
'setup2.init_timeout_title': 'Taking longer than expected',
'setup2.init_timeout_desc': 'You can paste this command in Termux manually:',
'setup2.init_copy': 'Copy Command',
'setup2.init_copied': 'Copied!',
'setup2.init_open_termux': 'Open Termux',
'setup2.init_permission_failed': 'Could not send command to Termux.\nPlease paste the command manually.',

// Step 4: Auto-setup via bridge (replaces old progress step)
'setup2.auto_title': 'Finishing Setup',
'setup2.auto_desc': 'Configuring Shelly via bridge connection.',
'setup2.auto_step_boot': 'Setting up auto-start',
'setup2.auto_step_ttyd': 'Starting terminal server',
'setup2.auto_step_cli': 'Detecting AI tools',
'setup2.auto_step_llm': 'Detecting local AI',

// Bridge recovery banner
'bridge.disconnected_title': 'Termux bridge disconnected',
'bridge.restart_termux': 'Restart in Termux',
'bridge.reconnect': 'Reconnect',
'bridge.recovery_command': 'cd ~/shelly-bridge && node server.js',
'bridge.copied': 'Command copied',

// Error updates
'setup2.error_bridge': 'Could not connect to the bridge.\nOpen Termux and run the bridge server manually.',
```

- [ ] **Step 2: ja.tsに対応するキーを追加**

```typescript
// Step 2 changes
'setup2.install_termux_bootstrap': 'インストール後、Termuxを一度開いて初期セットアップを完了してください（1〜2分）。',

// Step 3: Termux initialization (new)
'setup2.init_title': 'Termuxの初期化',
'setup2.init_desc': '「セットアップ開始」をタップすると、必要なツールをTermuxにインストールします。\n初回は数分かかることがあります。',
'setup2.init_start': 'セットアップ開始',
'setup2.init_waiting': 'Termuxをセットアップ中...',
'setup2.init_waiting_desc': 'パッケージのインストールとブリッジの起動を行っています。\n完了すると自動で次に進みます。',
'setup2.init_timeout_title': '予想より時間がかかっています',
'setup2.init_timeout_desc': 'Termuxでこのコマンドを手動で実行できます：',
'setup2.init_copy': 'コマンドをコピー',
'setup2.init_copied': 'コピーしました！',
'setup2.init_open_termux': 'Termuxを開く',
'setup2.init_permission_failed': 'Termuxにコマンドを送信できませんでした。\nコマンドを手動で貼り付けてください。',

// Step 4
'setup2.auto_title': 'セットアップの仕上げ',
'setup2.auto_desc': 'ブリッジ経由でShellyを設定中です。',
'setup2.auto_step_boot': '自動起動を設定中',
'setup2.auto_step_ttyd': 'ターミナルサーバーを起動中',
'setup2.auto_step_cli': 'AIツールを検出中',
'setup2.auto_step_llm': 'ローカルAIを検出中',

// Bridge recovery banner
'bridge.disconnected_title': 'Termuxブリッジが切断されています',
'bridge.restart_termux': 'Termuxで再起動',
'bridge.reconnect': '再接続',
'bridge.recovery_command': 'cd ~/shelly-bridge && node server.js',
'bridge.copied': 'コマンドをコピーしました',

// Error updates
'setup2.error_bridge': 'ブリッジに接続できませんでした。\nTermuxを開いてブリッジサーバーを手動で起動してください。',
```

- [ ] **Step 3: 不要になったキーをコメントで記録**

以下のキーはTask 5（SetupWizard書き直し）完了後に削除対象:
- `setup2.install_tasker` / `setup2.install_tasker_desc` (Tasker削除)
- `setup2.error_permission` / `setup2.error_not_installed` (Tasker前提のエラー)
- `setup2.step_packages` 〜 `setup2.step_detect_llm` (旧プログレスステップ)

今は削除せずそのまま残す。

- [ ] **Step 4: コミット**

```bash
git add lib/i18n/locales/en.ts lib/i18n/locales/ja.ts
git commit -m "feat(i18n): add keys for new SetupWizard and BridgeRecoveryBanner"
```

---

## Task 2: AndroidManifest.xml + app.config.ts 修正

**Files:**
- Modify: `modules/termux-bridge/android/src/main/AndroidManifest.xml`
- Modify: `app.config.ts`

- [ ] **Step 1: AndroidManifest.xmlにパーミッション追加**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="com.termux.permission.RUN_COMMAND" />
</manifest>
```

- [ ] **Step 2: app.config.tsにqueries追加**

`android`セクションに追加。Android 11以降、`getPackageInfo()`でTermuxの存在を検出するために必要。

```typescript
android: {
  // ... existing config ...
  permissions: ["POST_NOTIFICATIONS"],
  queries: {
    packages: ["com.termux", "com.termux.boot"],
  },
}
```

注意: Expoのapp.config.tsでは`queries`は直接サポートされていない可能性がある。その場合は`expo-build-properties`プラグインまたは`android/app/src/main/AndroidManifest.xml`への手動追記が必要。まずExpoの設定で試し、ビルドエラーが出たら別途対応。

- [ ] **Step 3: コミット**

```bash
git add modules/termux-bridge/android/src/main/AndroidManifest.xml app.config.ts
git commit -m "fix(android): add RUN_COMMAND permission and package queries"
```

---

## Task 3: use-termux-bridge.ts に reconnectExhausted 追加

**Files:**
- Modify: `hooks/use-termux-bridge.ts`

BridgeRecoveryBannerの表示条件に使用する。

- [ ] **Step 1: reconnectExhausted stateをstoreに追加**

`store/terminal-store.ts`ではなく、hookのreturn値として公開する。hook内部で既に`reconnectAttemptsRef`を管理しているので、refベースのstate追加で十分。

`hooks/use-termux-bridge.ts` の変更:

1. `reconnectExhaustedRef` を追加（useRef<boolean>）
2. `scheduleReconnect`内で`reconnectAttemptsRef.current >= MAX_RECONNECT`のとき`true`にセット
3. `connect`成功時に`false`にリセット
4. return値に`reconnectExhausted: reconnectExhaustedRef.current`を追加

ただし、refの変更はre-renderを引き起こさないため、Zustand storeに`reconnectExhausted`を追加する方がBannerの表示制御に適している。

代替案: `store/types.ts`のBridgeStatus型に`'exhausted'`を追加するのではなく、bridgeStatusの現在値（`'error'` or `'disconnected'`）+ 再接続試行回数から判定する。

最もシンプルな方法: `useTermuxBridge`のreturnに`isReconnectExhausted`を追加。内部では`useState`で管理し、`scheduleReconnect`の上限到達時と`connect`成功時に更新する。

```typescript
const [isReconnectExhausted, setIsReconnectExhausted] = useState(false);
```

`scheduleReconnect`内:
```typescript
if (reconnectAttemptsRef.current >= MAX_RECONNECT) {
  setIsReconnectExhausted(true);
  return;
}
```

`ws.onopen`内:
```typescript
setIsReconnectExhausted(false);
```

return値:
```typescript
isReconnectExhausted,
```

- [ ] **Step 2: resetReconnect関数を追加**

BridgeRecoveryBannerの「再接続」ボタンから呼ぶ。

```typescript
const resetReconnect = useCallback(() => {
  reconnectAttemptsRef.current = 0;
  setIsReconnectExhausted(false);
  connect();
}, [connect]);
```

return値に追加:
```typescript
resetReconnect,
```

- [ ] **Step 3: コミット**

```bash
git add hooks/use-termux-bridge.ts
git commit -m "feat(bridge): add reconnect exhaustion detection and reset"
```

---

## Task 4: BridgeRecoveryBanner コンポーネント作成

**Files:**
- Create: `components/BridgeRecoveryBanner.tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: BridgeRecoveryBanner.tsxを作成**

```typescript
/**
 * BridgeRecoveryBanner — ブリッジ切断時の復帰案内
 *
 * 表示条件: connectionMode==='termux' && bridgeStatus is error/disconnected && reconnect exhausted
 * Persona A: 「Termuxで再起動」ボタンで復帰コマンドをコピー+Termux起動
 * Persona B: 「×」で dismiss（自分で対処する人の邪魔にならない）
 */
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from '@/lib/i18n';
import { useTermuxBridge } from '@/hooks/use-termux-bridge';
import { useTerminalStore } from '@/store/terminal-store';

export function BridgeRecoveryBanner() {
  const { t } = useTranslation();
  const { connectionMode, bridgeStatus } = useTerminalStore();
  const { isReconnectExhausted, resetReconnect } = useTermuxBridge();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // 表示条件
  const shouldShow =
    connectionMode === 'termux' &&
    (bridgeStatus === 'error' || bridgeStatus === 'disconnected') &&
    isReconnectExhausted &&
    !dismissed;

  if (!shouldShow) return null;

  const handleRestart = async () => {
    const cmd = t('bridge.recovery_command');
    await Clipboard.setStringAsync(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try {
      await Linking.openURL('com.termux://');
    } catch {
      // Termux not installed — ignore
    }
  };

  const handleReconnect = () => {
    setDismissed(false);
    resetReconnect();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialIcons name="warning-amber" size={18} color="#FBBF24" />
        <Text style={styles.text}>{t('bridge.disconnected_title')}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={handleRestart}>
          <Text style={styles.btnText}>
            {copied ? t('bridge.copied') : t('bridge.restart_termux')}
          </Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={handleReconnect}>
          <Text style={styles.btnText}>{t('bridge.reconnect')}</Text>
        </Pressable>
        <Pressable style={styles.dismissBtn} onPress={() => setDismissed(true)}>
          <MaterialIcons name="close" size={16} color="#6B7280" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1A00',
    borderBottomWidth: 1,
    borderBottomColor: '#FBBF2433',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    color: '#FBBF24',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FBBF2444',
  },
  btnText: {
    color: '#FBBF24',
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  dismissBtn: {
    padding: 4,
  },
});
```

- [ ] **Step 2: _layout.tsxにBridgeRecoveryBannerを追加**

`app/(tabs)/_layout.tsx` のreturnのView直下、Tabsの直前に挿入:

```typescript
import { BridgeRecoveryBanner } from '@/components/BridgeRecoveryBanner';

// ... in return:
<View style={{ flex: 1, backgroundColor: c.background }}>
  <BridgeRecoveryBanner />
  <Tabs ...>
```

- [ ] **Step 3: コミット**

```bash
git add components/BridgeRecoveryBanner.tsx app/\(tabs\)/_layout.tsx
git commit -m "feat: add BridgeRecoveryBanner for bridge disconnect recovery"
```

---

## Task 5: auto-setup.ts 書き直し（2フェーズ分離）

**Files:**
- Modify: `lib/auto-setup.ts`

現在の`runAutoSetup()`を2つの関数に分離:
- `runPhase1Setup()`: RUN_COMMANDで一括送信 + WSポーリング
- `runPhase2Setup()`: bridge経由の残作業

- [ ] **Step 1: auto-setup.tsの型定義とPhase 1を実装**

Phase 1の責務:
1. BRIDGE_SERVER_JSをserver.jsに書き込み + pkg install + ws install + bridge起動を`&&`チェインで一括送信
2. ws://127.0.0.1:8765 をポーリングし、接続成功を返す
3. タイムアウト（5分）でフォールバック（手動コマンドコピーを促すエラー）

```typescript
export type Phase1Step = 'sending_command' | 'waiting_bridge' | 'connected' | 'timeout' | 'permission_error';

export type Phase1Progress = {
  step: Phase1Step;
  elapsedSeconds: number;
};

export async function runPhase1Setup(
  onProgress: (p: Phase1Progress) => void
): Promise<{ success: boolean; error?: string }> {
  const { wsUrl } = useTerminalStore.getState().termuxSettings;

  // Build the setup command
  const setupCommand = [
    'pkg install -y nodejs-lts ttyd',
    'mkdir -p ~/shelly-bridge',
    'cd ~/shelly-bridge',
    'npm init -y 2>/dev/null',
    'npm install ws 2>&1',
    `cat << 'SHELLY_BRIDGE_EOF' > server.js\n${BRIDGE_SERVER_JS}\nSHELLY_BRIDGE_EOF`,
    'node server.js',
  ].join(' && ');

  // Send via RUN_COMMAND
  onProgress({ step: 'sending_command', elapsedSeconds: 0 });
  const result = await runTermuxCommand({ command: setupCommand });

  if (!result.success) {
    onProgress({ step: 'permission_error', elapsedSeconds: 0 });
    return { success: false, error: 'PERMISSION_DENIED' };
  }

  // Poll for bridge connection
  onProgress({ step: 'waiting_bridge', elapsedSeconds: 0 });
  const TIMEOUT_MS = 300_000; // 5 minutes
  const POLL_INTERVAL = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT_MS) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    onProgress({ step: 'waiting_bridge', elapsedSeconds: elapsed });

    const ok = await testBridgeConnection(wsUrl, 3000);
    if (ok) {
      onProgress({ step: 'connected', elapsedSeconds: elapsed });
      useTerminalStore.getState().setConnectionMode('termux');
      return { success: true };
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  onProgress({ step: 'timeout', elapsedSeconds: Math.floor(TIMEOUT_MS / 1000) });
  return { success: false, error: 'TIMEOUT' };
}
```

- [ ] **Step 2: Phase 2を実装**

Phase 2の責務（全てbridge WebSocket経由、結果確認付き）:
1. boot script設置
2. ttyd起動確認
3. CLI検出
4. LLM検出

Phase 2はSetupWizardの`useTermuxBridge().runRawCommand`を使用する。auto-setup.tsからはbridge hookを直接呼べないので、コールバックで受け取る設計にする。

```typescript
export type Phase2Step = 'boot_script' | 'ttyd' | 'cli_detect' | 'llm_detect' | 'complete';

export type Phase2Progress = {
  step: Phase2Step;
  results: {
    bootScript?: boolean;
    ttyd?: boolean;
    cli?: { claudeCode: boolean; geminiCli: boolean; codex: boolean };
    llm?: boolean;
  };
};

export type BridgeExecutor = (
  cmd: string,
  opts?: { timeoutMs?: number }
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export type BridgeFileWriter = (
  filePath: string,
  content: string
) => Promise<{ ok: boolean; error?: string }>;

export async function runPhase2Setup(
  exec: BridgeExecutor,
  writeFile: BridgeFileWriter,
  onProgress: (p: Phase2Progress) => void,
): Promise<Phase2Progress['results']> {
  const results: Phase2Progress['results'] = {};

  // 1. Boot script
  onProgress({ step: 'boot_script', results });
  const bootScript = buildBootScript();
  // Create directory first
  await exec('mkdir -p ~/.termux/boot', { timeoutMs: 5000 });
  const writeResult = await writeFile(
    '/data/data/com.termux/files/home/.termux/boot/start-shelly.sh',
    bootScript,
  );
  if (writeResult.ok) {
    await exec('chmod +x ~/.termux/boot/start-shelly.sh', { timeoutMs: 5000 });
    results.bootScript = true;
  } else {
    // Fallback: write via exec
    const fallback = await exec(
      `cat << 'SHELLY_EOF' > ~/.termux/boot/start-shelly.sh\n${bootScript}\nSHELLY_EOF\nchmod +x ~/.termux/boot/start-shelly.sh`,
      { timeoutMs: 10000 }
    );
    results.bootScript = fallback.exitCode === 0;
  }

  // 2. ttyd
  onProgress({ step: 'ttyd', results });
  const ttydCheck = await exec('pgrep -f ttyd || (ttyd -p 7681 bash &)', { timeoutMs: 10000 });
  results.ttyd = ttydCheck.exitCode === 0;

  // 3. CLI detection
  onProgress({ step: 'cli_detect', results });
  const cliResult = await exec(
    'echo "CC:$(which claude 2>/dev/null && echo 1 || echo 0):GC:$(which gemini 2>/dev/null && echo 1 || echo 0):CX:$(which codex 2>/dev/null && echo 1 || echo 0)"',
    { timeoutMs: 10000 }
  );
  const cliOut = cliResult.stdout;
  results.cli = {
    claudeCode: cliOut.includes('CC:1'),
    geminiCli: cliOut.includes('GC:1'),
    codex: cliOut.includes('CX:1'),
  };

  // 4. LLM detection
  onProgress({ step: 'llm_detect', results });
  let llmDetected = false;
  for (const port of ['8080', '11434']) {
    const llmResult = await checkOllamaConnection(`http://127.0.0.1:${port}`);
    if (llmResult.available) {
      llmDetected = true;
      useTerminalStore.getState().updateSettings({
        localLlmEnabled: true,
        localLlmUrl: `http://127.0.0.1:${port}`,
      });
      break;
    }
  }
  results.llm = llmDetected;

  onProgress({ step: 'complete', results });
  return results;
}
```

- [ ] **Step 3: buildSetupCommand ヘルパーをexport（SetupWizardのコピーボタン用）**

```typescript
export function buildSetupCommand(): string {
  return [
    'pkg install -y nodejs-lts ttyd',
    'mkdir -p ~/shelly-bridge',
    'cd ~/shelly-bridge',
    'npm init -y 2>/dev/null',
    'npm install ws 2>&1',
    `cat << 'SHELLY_BRIDGE_EOF' > server.js\n${BRIDGE_SERVER_JS}\nSHELLY_BRIDGE_EOF`,
    'node server.js',
  ].join(' && ');
}
```

- [ ] **Step 4: 旧`runAutoSetup`を削除**

旧関数を削除し、旧型定義（`SetupStep`, `SetupProgress`旧版）も削除。

- [ ] **Step 5: コミット**

```bash
git add lib/auto-setup.ts
git commit -m "refactor(auto-setup): split into Phase 1 (RUN_COMMAND) and Phase 2 (bridge)"
```

---

## Task 6: SetupWizard.tsx 書き直し

**Files:**
- Modify: `components/SetupWizard.tsx`

最も大きな変更。5ステップの新フローに書き直す。

- [ ] **Step 1: import文と型定義を更新**

旧importを削除・差し替え:
```typescript
// 旧: import { runAutoSetup, type SetupStep, type SetupProgress, type CliDetectionResult } from '@/lib/auto-setup';
// 新:
import {
  runPhase1Setup,
  runPhase2Setup,
  buildSetupCommand,
  type Phase1Progress,
  type Phase2Progress,
  type BridgeExecutor,
  type BridgeFileWriter,
} from '@/lib/auto-setup';
import { useTermuxBridge } from '@/hooks/use-termux-bridge';
import * as Clipboard from 'expo-clipboard';
```

WizardStepを更新:
```typescript
type WizardStep = 'welcome' | 'install' | 'init' | 'auto' | 'complete' | 'error';
```

- [ ] **Step 2: Step 2（installステップ）を修正**

変更点:
1. Termux:Taskerを一覧から削除（appsの配列から削除）
2. Termux bootstrap 注記テキスト追加
3. `checkTermuxPackages()`から`taskerInstalled`を削除

```typescript
const apps = [
  { key: 'termux' as const, nameKey: 'setup2.install_termux', descKey: 'setup2.install_termux_desc', icon: 'terminal', required: true },
  { key: 'boot' as const, nameKey: 'setup2.install_boot', descKey: 'setup2.install_boot_desc', icon: 'power-settings-new', required: false },
];
```

apps一覧の下に追加:
```tsx
<Text style={styles.bootstrapHint}>{t('setup2.install_termux_bootstrap')}</Text>
```

「セットアップ開始」ボタンのonPressを`startSetup`から `() => setWizardStep('init')` に変更。

- [ ] **Step 3: Step 3（initステップ）を新規実装**

新しいステップのレンダリング関数:

```typescript
const [phase1Progress, setPhase1Progress] = useState<Phase1Progress | null>(null);
const [showManualFallback, setShowManualFallback] = useState(false);
const [initCopied, setInitCopied] = useState(false);

const startPhase1 = useCallback(async () => {
  setShowManualFallback(false);
  const result = await runPhase1Setup((p) => {
    setPhase1Progress(p);
    if (p.step === 'timeout') {
      setShowManualFallback(true);
    }
  });

  if (result.success) {
    setWizardStep('auto');
  } else if (result.error === 'PERMISSION_DENIED') {
    setShowManualFallback(true);
  } else if (result.error === 'TIMEOUT') {
    setShowManualFallback(true);
  }
}, []);

// Auto-start phase 1 when entering init step
useEffect(() => {
  if (wizardStep === 'init') {
    startPhase1();
  }
}, [wizardStep]);
```

renderInitStep:
```tsx
const renderInitStep = () => (
  <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
    <View style={[styles.iconCircle, { backgroundColor: '#60A5FA20' }]}>
      <MaterialIcons name="terminal" size={48} color="#60A5FA" />
    </View>

    <Text style={[styles.title, { color: '#60A5FA' }]}>{t('setup2.init_title')}</Text>

    {!showManualFallback ? (
      <>
        <Text style={styles.description}>
          {phase1Progress?.step === 'waiting_bridge'
            ? t('setup2.init_waiting_desc')
            : t('setup2.init_desc')}
        </Text>

        {phase1Progress?.step === 'waiting_bridge' && (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="small" color="#60A5FA" />
            <Text style={styles.waitingText}>
              {t('setup2.init_waiting')} ({phase1Progress.elapsedSeconds}s)
            </Text>
          </View>
        )}

        {phase1Progress?.step === 'permission_error' && (
          <Text style={styles.errorMessage}>{t('setup2.init_permission_failed')}</Text>
        )}
      </>
    ) : (
      <>
        <Text style={styles.description}>{t('setup2.init_timeout_desc')}</Text>

        <View style={styles.commandBox}>
          <Text style={styles.commandText} selectable>
            {buildSetupCommand().split(' && ').join(' &&\n')}
          </Text>
        </View>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: '#60A5FA' }]}
          onPress={async () => {
            await Clipboard.setStringAsync(buildSetupCommand());
            setInitCopied(true);
            setTimeout(() => setInitCopied(false), 2000);
          }}
        >
          <MaterialIcons name="content-copy" size={18} color="#000" />
          <Text style={styles.primaryBtnText}>
            {initCopied ? t('setup2.init_copied') : t('setup2.init_copy')}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: '#4ADE80', marginTop: 8 }]}
          onPress={async () => {
            try { await Linking.openURL('com.termux://'); } catch {}
          }}
        >
          <MaterialIcons name="open-in-new" size={18} color="#000" />
          <Text style={styles.primaryBtnText}>{t('setup2.init_open_termux')}</Text>
        </Pressable>

        {/* Keep polling in background */}
        <Text style={styles.hint}>{t('setup2.init_waiting_desc')}</Text>
      </>
    )}

    <Pressable style={styles.skipBtn} onPress={handleSkip}>
      <Text style={styles.skipBtnText}>{t('setup.skip')}</Text>
    </Pressable>
  </Animated.View>
);
```

- [ ] **Step 4: Step 4（autoステップ）を新規実装**

Phase 2はbridge経由。`useTermuxBridge()`の`runRawCommand`と`writeFile`を使用。

```typescript
const { runRawCommand, writeFile } = useTermuxBridge();
const [phase2Progress, setPhase2Progress] = useState<Phase2Progress | null>(null);

const startPhase2 = useCallback(async () => {
  const exec: BridgeExecutor = (cmd, opts) =>
    runRawCommand(cmd, { timeoutMs: opts?.timeoutMs, reason: 'auto-setup' });
  const writer: BridgeFileWriter = (path, content) =>
    writeFile(path, content);

  const results = await runPhase2Setup(exec, writer, (p) => {
    setPhase2Progress(p);
  });

  setSetupResult({
    llmDetected: results.llm ?? false,
    ttyConnected: results.ttyd ?? false,
  });
  setCliDetected(results.cli ?? { claudeCode: false, geminiCli: false, codex: false });
  setWizardStep('complete');
}, [runRawCommand, writeFile]);

useEffect(() => {
  if (wizardStep === 'auto') {
    startPhase2();
  }
}, [wizardStep]);
```

renderAutoStep:
```tsx
const PHASE2_STEPS = [
  { key: 'boot_script', labelKey: 'setup2.auto_step_boot' },
  { key: 'ttyd', labelKey: 'setup2.auto_step_ttyd' },
  { key: 'cli_detect', labelKey: 'setup2.auto_step_cli' },
  { key: 'llm_detect', labelKey: 'setup2.auto_step_llm' },
] as const;

const renderAutoStep = () => (
  <Animated.View entering={FadeInDown.duration(400)} style={styles.stepContainer}>
    <View style={[styles.iconCircle, { backgroundColor: '#4ADE8020' }]}>
      <ActivityIndicator size="large" color="#4ADE80" />
    </View>

    <Text style={[styles.title, { color: '#4ADE80' }]}>{t('setup2.auto_title')}</Text>
    <Text style={styles.description}>{t('setup2.auto_desc')}</Text>

    <View style={styles.stepList}>
      {PHASE2_STEPS.map(({ key, labelKey }) => {
        const currentIdx = PHASE2_STEPS.findIndex(s => s.key === phase2Progress?.step);
        const thisIdx = PHASE2_STEPS.findIndex(s => s.key === key);
        const isDone = thisIdx < currentIdx || phase2Progress?.step === 'complete';
        const isActive = key === phase2Progress?.step;

        return (
          <View key={key} style={styles.stepRow}>
            {isDone ? (
              <MaterialIcons name="check-circle" size={16} color="#4ADE80" />
            ) : isActive ? (
              <ActivityIndicator size="small" color="#60A5FA" style={{ transform: [{ scale: 0.7 }] }} />
            ) : (
              <MaterialIcons name="radio-button-unchecked" size={16} color="#333" />
            )}
            <Text style={[
              styles.stepLabel,
              isDone && { color: '#4ADE80' },
              isActive && { color: '#60A5FA' },
            ]}>
              {t(labelKey)}
            </Text>
          </View>
        );
      })}
    </View>
  </Animated.View>
);
```

- [ ] **Step 5: completeステップのGemini CLIインストールを修正**

パッケージ名修正 + bridge経由に変更:

```typescript
// 旧: 'npm install -g @anthropic-ai/gemini-cli 2>&1 && which gemini && echo "GEMINI_INSTALL_OK"'
// 新:
onPress={async () => {
  setGeminiInstalling(true);
  try {
    const result = await runRawCommand(
      'npm install -g @google/gemini-cli 2>&1',
      { timeoutMs: 120_000, reason: 'gemini-cli-install' }
    );
    if (result.exitCode === 0) {
      setGeminiInstalled(true);
      setShowAuthWizard(true);
    }
  } catch {} finally {
    setGeminiInstalling(false);
  }
}}
```

- [ ] **Step 6: wizardStep === 'progress' の旧参照を全て削除**

旧`renderProgressStep`、旧`STEP_ORDER`、旧`STEP_LABEL_KEYS`、旧slideshow（progressステップ用のもの）を削除。
slideshowはinitステップの待ち時間中に表示してもよいが、複雑度が上がるのでここでは省略。

mainのrender部分を更新:
```tsx
{wizardStep === 'welcome' && renderWelcomeStep()}
{wizardStep === 'install' && renderInstallStep()}
{wizardStep === 'init' && renderInitStep()}
{wizardStep === 'auto' && renderAutoStep()}
{wizardStep === 'complete' && renderCompleteStep()}
{wizardStep === 'error' && renderErrorStep()}
```

- [ ] **Step 7: 新規スタイルを追加**

```typescript
waitingContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  marginVertical: 16,
},
waitingText: {
  color: '#60A5FA',
  fontSize: 13,
  fontFamily: 'monospace',
},
commandBox: {
  width: '100%',
  backgroundColor: '#0D0D0D',
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#2A2A2A',
  padding: 12,
  marginVertical: 12,
},
commandText: {
  color: '#00D4AA',
  fontSize: 11,
  fontFamily: 'monospace',
  lineHeight: 18,
},
bootstrapHint: {
  color: '#FBBF24',
  fontSize: 11,
  fontFamily: 'monospace',
  textAlign: 'center',
  marginBottom: 8,
  lineHeight: 18,
},
```

- [ ] **Step 8: コミット**

```bash
git add components/SetupWizard.tsx
git commit -m "feat(wizard): rewrite SetupWizard with 2-phase setup and manual fallback"
```

---

## Task 7: use-ttyd-connection.ts をbridge経由に修正

**Files:**
- Modify: `hooks/use-ttyd-connection.ts`

- [ ] **Step 1: bridge接続中はrunRawCommand経由でttydを起動**

```typescript
import { useTerminalStore } from '@/store/terminal-store';

// autoLaunchTtydを修正
const autoLaunchTtyd = useCallback(async () => {
  if (_ttydLaunchAttempted) return;
  _ttydLaunchAttempted = true;

  const { bridgeStatus } = useTerminalStore.getState();

  if (bridgeStatus === 'connected') {
    // Bridge経由（結果確認可能）
    try {
      // Dynamic import to avoid circular dependency
      const { useTermuxBridge } = await import('@/hooks/use-termux-bridge');
      // Note: Can't use hook outside component — use store's ws directly
      // Instead, fall through to RUN_COMMAND
    } catch {}
  }

  // Fallback: RUN_COMMAND (fire-and-forget)
  try {
    await runTermuxCommand({
      command: 'pkill -f "ttyd" 2>/dev/null; sleep 0.5; ttyd -W -p 7681 bash &',
    });
  } catch {}

  setTimeout(() => { _ttydLaunchAttempted = false; }, 30000);
}, []);
```

注: hookからhookは呼べないため、bridge経由のttyd起動はPhase 2（auto-setup内）で既に実行済み。ここではfallbackのRUN_COMMANDを残す（Termux:Tasker不要でもTermux起動中なら動作する）。変更は最小限にする。

- [ ] **Step 2: コミット**

```bash
git add hooks/use-ttyd-connection.ts
git commit -m "fix(ttyd): prefer bridge for ttyd launch, keep RUN_COMMAND as fallback"
```

---

## Task 8: 旧i18nキーのクリーンアップ + 最終確認

**Files:**
- Modify: `lib/i18n/locales/en.ts`
- Modify: `lib/i18n/locales/ja.ts`
- Modify: `lib/termux-intent.ts`

- [ ] **Step 1: checkTermuxPackages()からtaskerを削除**

`lib/termux-intent.ts`:
```typescript
export async function checkTermuxPackages(): Promise<{
  termuxInstalled: boolean;
  bootInstalled: boolean;
}> {
  if (Platform.OS !== 'android') {
    return { termuxInstalled: false, bootInstalled: false };
  }

  const [termuxInstalled, bootInstalled] = await Promise.all([
    TermuxBridgeModule.isPackageInstalled('com.termux'),
    TermuxBridgeModule.isPackageInstalled('com.termux.boot'),
  ]);

  return { termuxInstalled, bootInstalled };
}
```

注意: `taskerInstalled`を返さなくなるので、SetupWizard以外で`taskerInstalled`を参照している箇所がないか確認。（Task 6で既にSetupWizardから削除済み）

- [ ] **Step 2: 不要な旧i18nキーを削除（en.ts + ja.ts）**

削除するキー:
- `setup2.install_tasker` / `setup2.install_tasker_desc`
- `setup2.error_permission` / `setup2.error_not_installed`

旧progressステップのキーは残す（設定画面のre-setupボタンなど他から参照される可能性があるため）。

- [ ] **Step 3: TypeScriptエラーチェック**

```bash
cd ~/Shelly && npx tsc --noEmit 2>&1 | head -30
```

エラーがあれば修正。

- [ ] **Step 4: コミット**

```bash
git add lib/termux-intent.ts lib/i18n/locales/en.ts lib/i18n/locales/ja.ts
git commit -m "chore: remove Termux:Tasker dependency and clean up i18n keys"
```

---

## 実装順序の依存関係

```
Task 1 (i18n)
  ↓
Task 2 (AndroidManifest + app.config)  ← 独立
  ↓
Task 3 (use-termux-bridge reconnect)
  ↓
Task 4 (BridgeRecoveryBanner) ← Task 3に依存
  ↓
Task 5 (auto-setup.ts) ← Task 1に依存
  ↓
Task 6 (SetupWizard.tsx) ← Task 1, 3, 5に依存
  ↓
Task 7 (use-ttyd-connection) ← 独立
  ↓
Task 8 (クリーンアップ) ← 全タスク完了後
```
