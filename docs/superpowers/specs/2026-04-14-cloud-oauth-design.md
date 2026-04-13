# Cloud Integration — Google Drive OAuth + Dropbox/OneDrive 直リンク (v3)

**日付**: 2026-04-14
**親 spec**: `docs/superpowers/specs/2026-04-14-coming-soon-design.md` 機能 6
**ステータス**: 設計

---

## v1 → v2 → v3 の変更

### v1 → v2
- scheme を `shelly` に修正 (`app.config.ts:4` 確認)
- `AuthSession.makeRedirectUri` で動的生成
- Sidebar Cloud section `handleCloudConnect` stub を置き換え
- file DL を `FileSystem.createDownloadResumable` に
- Google Docs を `files.list` から除外
- `expo-auth-session` / `expo-crypto` は未インストール、追加必要
- refresh 失敗時の sign-out 経路

### v2 → v3 (この版、2 つ重要修正)

- **OAuth client type を "Web application" → "iOS" に変更**。Google の Web application 型は PKCE 使用時でも `client_secret` 必須で、OSS プロジェクトは `client_secret` を同梱できない。**iOS 型は PKCE public client として `client_secret` 不要**で custom scheme redirect に対応、Expo auth-session コミュニティの標準パターン。Android 型は SHA-1 pin 登録が必要で Expo の動的ビルドと相性が悪い
- **`file://` prefix strip を mandatory に**。`FileSystem.documentDirectory` は `file:///data/data/.../` 形式を返すが、`openFile()` → `execCommand("cat '<path>'")` は bare 絶対パスしか受け付けない。DL 後のパスを `openFile` に渡す前に **`.replace('file://', '')`** 必須
- **`handleCloudConnect` は `Alert.alert` stub ではなく既に `CLOUD_OAUTH_URLS` 参照の browser open 実装済** (Sidebar.tsx:124)。spec の説明文を訂正、削除指示は維持

---

## ゴール

Sidebar Cloud セクションを実装する。Google Drive は本格 OAuth 連携、Dropbox / OneDrive は Browser pane に飛ばすだけの 2 段構え。

## 非ゴール

- Dropbox / OneDrive の OAuth
- Google Drive の write (作成/編集/削除)
- ページング (最初の 20 件のみ)
- 画像プレビュー (DL 後に Preview pane 任せ)
- offline cache
- 複数 Google アカウント
- **Google Docs / Sheets のネイティブ export** (v1 では `application/vnd.google-apps.*` を除外)

---

## 必要な依存追加

```bash
pnpm add expo-auth-session expo-crypto
```

`expo-web-browser` は `expo-auth-session` の peer dep なので自動的に入る想定、**実装時に `package.json` で確認**。

### prebuild/rebuild
`expo-auth-session` は config plugin を使って AndroidManifest に OAuth redirect intent-filter を挿入する。つまり:

1. `pnpm add …` の後
2. `npx expo prebuild --clean --platform android` (AndroidManifest 再生成)
3. 新しい APK ビルド (GitHub Actions 側で自動)

**警告**: prebuild --clean は `android/` フォルダの手編集を吹き飛ばす。Shelly は現時点で `modules/terminal-view` と `modules/terminal-emulator` を native module として持っているが、これらは `/modules/` 配下なので prebuild の影響は受けない (確認済み)。`android/app/` に手編集が無いかを**実装前に確認**。

---

## アーキテクチャ

```
┌──────────────────────────┐
│  Sidebar Cloud section   │
│                          │
│  if (!hasClientId) →     │
│    warning banner +       │
│    Dropbox/OneDrive のみ │
│                          │
│  if (hasClientId) →      │
│    Google Drive UI       │
│    + Dropbox/OneDrive    │
└──────────────────────────┘
```

---

## CLIENT_ID の扱い

OSS なので同梱しない:

```ts
// lib/google-drive.ts
const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

export function hasClientId(): boolean {
  return CLIENT_ID.length > 0 && CLIENT_ID !== 'REPLACE_ME';
}
```

空文字 / `REPLACE_ME` 両方を未設定とみなす (v1 では片方しか見てなかった)。

README 追記内容 (正確版、v3 で修正):

````markdown
## Google Drive integration (optional)

To enable Google Drive browsing in the Cloud sidebar section:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or use an existing one)
3. Configure OAuth consent screen → External → add your email as a test user
4. Create credentials → OAuth client ID → **iOS** type
5. Bundle ID: `dev.shelly.terminal`
6. Copy the Client ID into `.env.local`:

   ```
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=12345-abc.apps.googleusercontent.com
   ```

7. Rebuild the APK (`pnpm android` or GitHub Actions push)

Without a Client ID, the Cloud sidebar hides the Drive section and
only shows Dropbox / OneDrive direct browser links.
````

### なぜ iOS クライアント型か (v3 修正の核心)

Google の OAuth 2.0 クライアント型は 3 つある:

| 型 | PKCE | client_secret | 対応環境 | Shelly での可否 |
|---|---|---|---|---|
| **Web application** | ◯ | **必須** | サーバーサイド | ❌ OSS に secret 同梱不可 |
| **Android** | ◯ | 不要 | package name + SHA-1 固定 | ❌ Expo 動的ビルドで SHA-1 が変わる |
| **iOS** | ◯ | **不要** | bundle ID + custom scheme | ✅ |

iOS 型は PKCE public client として設計されており、Android の Expo auth-session からも**そのまま動く** (Google 側は iOS/Android を区別せず OAuth 2.0 standard に従うだけ)。これは `expo-auth-session` コミュニティで広く使われているパターン。

注意: Google Cloud Console は iOS 型作成時に "App Store ID" や "Team ID" を入力させる場合があるが、これらは optional で空欄で作成可能。必須なのは **Bundle ID** のみ、これを `dev.shelly.terminal` にする。

---

## OAuth flow (PKCE)

1. ユーザー tap `[Sign in with Google]`
2. `expo-auth-session` の `useAuthRequest`:
   ```ts
   const redirectUri = AuthSession.makeRedirectUri({
     scheme: 'shelly',
     path: 'oauth/callback',
   });
   const [request, response, promptAsync] = useAuthRequest(
     {
       clientId: CLIENT_ID,
       scopes: ['https://www.googleapis.com/auth/drive.readonly', 'openid', 'email'],
       redirectUri,
       usePKCE: true,
       responseType: 'code',
     },
     discovery,
   );
   ```
3. `promptAsync()` → system browser で認証
4. redirect listen、`response.params.code` 取得 (expo-auth-session が state param を自動検証)
5. `code` を `https://oauth2.googleapis.com/token` に POST:
   ```
   client_id + code + code_verifier + redirect_uri + grant_type=authorization_code
   ```
   iOS クライアント型は PKCE public client なので **`client_secret` は送らない**。
6. レスポンスから `access_token` / `refresh_token` / `expires_in` / `id_token` 取得
7. SecureStore に保存:
   - `gdrive.access_token`
   - `gdrive.refresh_token`
   - `gdrive.expires_at` (epoch ms)
   - `gdrive.email` (id_token decode 結果、表示用)
8. Sidebar Cloud section が re-render → file list 取得

---

## トークンリフレッシュ

```ts
// lib/google-drive.ts
async function getValidToken(): Promise<string | null> {
  const expiresAt = parseInt(
    (await SecureStore.getItemAsync('gdrive.expires_at')) ?? '0',
    10,
  );
  if (Date.now() < expiresAt - 60_000) {
    return SecureStore.getItemAsync('gdrive.access_token');
  }
  const refresh = await SecureStore.getItemAsync('gdrive.refresh_token');
  if (!refresh) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    // invalid_grant など → 完全 sign-out
    await signOut();
    return null;
  }
  const data = await res.json();
  await SecureStore.setItemAsync('gdrive.access_token', data.access_token);
  await SecureStore.setItemAsync(
    'gdrive.expires_at',
    String(Date.now() + data.expires_in * 1000),
  );
  return data.access_token;
}
```

`signOut()` は:
```ts
export async function signOut() {
  await SecureStore.deleteItemAsync('gdrive.access_token');
  await SecureStore.deleteItemAsync('gdrive.refresh_token');
  await SecureStore.deleteItemAsync('gdrive.expires_at');
  await SecureStore.deleteItemAsync('gdrive.email');
  useGoogleDriveStore.getState().reset();
}
```

---

## Files API

```
GET https://www.googleapis.com/drive/v3/files
  ?pageSize=20
  &fields=files(id,name,mimeType,modifiedTime)
  &q='<parentFolderId>' in parents and mimeType != 'application/vnd.google-apps.document' and mimeType != 'application/vnd.google-apps.spreadsheet' and mimeType != 'application/vnd.google-apps.presentation' and mimeType != 'application/vnd.google-apps.form'
  &orderBy=folder,modifiedTime desc
```

Google Docs 系を filter out (これらは `alt=media` で DL 不可で別 API が必要、v1 では対応しない)。

folder navigation は **id stack** で実装 (v1 では string[] だけだったが folder id がないと goUp できない):

```ts
type BreadcrumbEntry = { id: string; name: string };
type State = {
  breadcrumb: BreadcrumbEntry[];  // [{id:'root',name:'Root'}, {id:'abc',name:'Documents'}]
  // ...
};
```

`goUp()` は stack を 1 つ pop、末尾の `id` で refresh。

---

## ファイルダウンロード

v1 の `blob() + base64` は 20MB 超で OOM。**`FileSystem.createDownloadResumable` を使う**:

```ts
// lib/google-drive.ts
export async function downloadFile(fileId: string, name: string): Promise<string> {
  const token = await getValidToken();
  if (!token) throw new Error('Not signed in');

  const localDir = `${FileSystem.documentDirectory}shelly-gdrive/`;
  await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
  const localPath = `${localDir}${name}`;

  const downloadResumable = FileSystem.createDownloadResumable(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    localPath,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const result = await downloadResumable.downloadAsync();
  if (!result || !result.uri) throw new Error('Download failed');
  return result.uri;
}
```

DL 後 `openFile(localPath)` で Preview pane に表示。

### `openFile` の引数形式 (v3 で確定)
`lib/open-file.ts` → `openMarkdownFile` → `execCommand("cat '<path>'")` というパスで **JNI fork+exec 経由で bare 絶対パスを `cat` に渡す**。`FileSystem.documentDirectory` は `file:///data/data/dev.shelly.terminal/files/` 形式を返すので、**`file://` prefix を必ず strip する**:

```ts
const uri = result.uri;  // 'file:///data/data/.../shelly-gdrive/my-doc.md'
const localPath = uri.replace(/^file:\/\//, '');
await openFile(localPath);
```

JNI fork+exec は app process 内で走るので `/data/data/dev.shelly.terminal/files/` は `cat` で読める (SELinux ポリシーで許可されている)。

---

## データモデル

```ts
// store/google-drive-store.ts
type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  isFolder: boolean;
};

type BreadcrumbEntry = { id: string; name: string };

type GoogleDriveState = {
  isSignedIn: boolean;
  email: string | null;
  breadcrumb: BreadcrumbEntry[];  // [{id:'root', name:'Root'}, ...]
  files: DriveFile[];
  loading: boolean;
  error: string | null;

  // Actions
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  enterFolder: (id: string, name: string) => Promise<void>;
  goUp: () => Promise<void>;
  reset: () => void;  // store 状態を初期化 (sign-out 後に呼ぶ)
};
```

token 本体は store に入れず SecureStore。store が持つのは UI 状態のみ。

---

## Sidebar Cloud section 書き換え

### 現状把握 (v3 で訂正)
`components/layout/Sidebar.tsx` の Cloud section:
- `handleCloudConnect(svcLabel)` 関数が `useCallback` で定義 (L124 付近)
- **Alert.alert ではなく、`CLOUD_OAUTH_URLS[label]` を lookup して browser open する既存実装**
- `CLOUD_SERVICES.map()` で Google Drive / Dropbox / OneDrive の 3 行をハードコード render (L358 付近)

### 置き換え方針

```tsx
<SidebarSection title="CLOUD" ...>
  {/* Google Drive — OAuth */}
  {hasClientId() ? (
    isSignedIn ? (
      <GoogleDriveList />
    ) : (
      <Pressable onPress={() => setAuthModalOpen(true)}>
        <Text>{'[ Sign in with Google ]'}</Text>
      </Pressable>
    )
  ) : (
    <View>
      <Text style={styles.warnBanner}>⚠ Google Drive not configured</Text>
      <Pressable onPress={() => openUrl('https://github.com/RYOITABASHI/Shelly#google-drive-integration-optional')}>
        <Text>Setup guide →</Text>
      </Pressable>
    </View>
  )}

  {/* Dropbox 直リンク */}
  <Pressable onPress={() => openUrl('https://www.dropbox.com/home')}>
    <MaterialIcons name="cloud" size={10} color={C.accentBlue} />
    <Text>OPEN DROPBOX</Text>
    <MaterialIcons name="open-in-new" size={I.externalLink} color={C.text2} />
  </Pressable>

  {/* OneDrive 直リンク */}
  <Pressable onPress={() => openUrl('https://onedrive.live.com')}>
    <MaterialIcons name="cloud" size={10} color={C.accentSky} />
    <Text>OPEN ONEDRIVE</Text>
    <MaterialIcons name="open-in-new" size={I.externalLink} color={C.text2} />
  </Pressable>
</SidebarSection>
```

既存 `handleCloudConnect` は完全に削除、`Alert.alert` stub も削除。

---

## エラーハンドリング

| ケース | 対応 |
|---|---|
| CLIENT_ID 未設定 | 警告バナー + Dropbox/OneDrive のみ表示、Google Drive 行は出さない |
| ユーザーが auth キャンセル | 何もしない、"Sign in" ボタンのまま |
| token 交換失敗 | `setError('Sign in failed')`, Toast |
| refresh 失敗 (invalid_grant / revoked) | `signOut()` 呼び出し、SecureStore 全消し、UI を "Sign in" に戻す |
| files.list 401 | refresh → retry 1 回、それでもダメなら `signOut()` |
| files.list 403 (quota) | `Toast: "API quota exceeded, try again later"` |
| files.list ネットワークエラー | `setError('Network error')`, Retry ボタン |
| 大ファイル DL 途中キャンセル | `downloadResumable.pauseAsync()`, ローカルファイル削除 |
| Google Docs をたまたま tap (除外漏れ) | `alt=media` で 400 → Toast で "Google Docs cannot be previewed, export via Google Docs app" |

---

## セキュリティ

- scope 固定: `drive.readonly + openid + email` のみ
- refresh_token は SecureStore のみ、メモリに長期保持しない (毎回 getItemAsync)
- custom scheme redirect `shelly://oauth/callback`、localhost は禁止
- state param は expo-auth-session が自動生成 + 検証
- SecureStore は Android Keystore backed (supported device 限定だが Samsung Fold6 は OK)

---

## ファイル

- `lib/google-drive.ts` (新規, ~250 行)
- `store/google-drive-store.ts` (新規, ~120 行)
- `components/cloud/GoogleDriveAuthModal.tsx` (新規, ~100 行)
- `components/cloud/GoogleDriveList.tsx` (新規, ~150 行)
- `components/layout/Sidebar.tsx` (編集 — Cloud section 置き換え、`handleCloudConnect` 削除)
- `README.md` (編集 — Setup guide 追記)
- `.env.example` (新規 — `EXPO_PUBLIC_GOOGLE_CLIENT_ID=` の空行のみ)
- `package.json` (編集 — expo-auth-session, expo-crypto 追加)

---

## 検証チェックリスト

- [ ] CLIENT_ID 未設定時: Cloud section に警告バナー + Dropbox/OneDrive のみ
- [ ] CLIENT_ID 設定時 + sign in: auth → file list 表示
- [ ] files.list で root 20 件 (Google Docs なし)
- [ ] フォルダ tap → 中身に入る、breadcrumb 更新
- [ ] "← Up" tap → 1 階層上に戻る
- [ ] ファイル tap → DL → Preview pane で開く (テキスト/画像で検証)
- [ ] Sign out → SecureStore から token 消える、Sign in に戻る
- [ ] app 再起動 → 既存 token でそのまま file list 表示
- [ ] Dropbox / OneDrive tap → Browser pane で開く
- [ ] refresh_token 失効状態をシミュレート (`SecureStore.setItemAsync('gdrive.refresh_token', 'invalid')`) → 正しく sign-out 状態に戻る
