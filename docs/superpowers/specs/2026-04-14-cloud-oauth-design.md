# Cloud Integration — Google Drive OAuth + Dropbox/OneDrive 直リンク (v2)

**日付**: 2026-04-14
**親 spec**: `docs/superpowers/specs/2026-04-14-coming-soon-design.md` 機能 6
**ステータス**: 設計

---

## v1 からの変更

- **scheme は `shelly`** (`app.config.ts:4` の `schemeFromBundleId = "shelly"`)、`dev.shelly.terminal` ではない。redirect_uri を修正
- `AuthSession.makeRedirectUri({ scheme: 'shelly', path: 'oauth/callback' })` で動的生成 (hardcode 禁止)
- **Sidebar Cloud section に既存の `handleCloudConnect` + `Alert.alert` stub あり**、これを**削除して置き換える**ことを明示
- file DL は `blob() + base64` ではなく `FileSystem.createDownloadResumable` (with Authorization header)
- Google Docs (`application/vnd.google-apps.*`) を `files.list` の `q` から**除外**
- `expo-auth-session` / `expo-crypto` は**未インストール**、pnpm add + prebuild/rebuild 必要と明示
- refresh 失敗 (revoked) 時に SecureStore 全消し + sign-out 状態に戻す経路を追加

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

README 追記内容 (正確版):

````markdown
## Google Drive integration (optional)

To enable Google Drive browsing in the Cloud sidebar section:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or use an existing one)
3. Configure OAuth consent screen → External → add your email as a test user
4. Create credentials → OAuth client ID → **Web application** type (not Android, because Expo auth-session goes through the web redirect flow on Android)
5. Authorized redirect URIs: add `shelly://oauth/callback`
6. Copy the Client ID into `.env.local`:

   ```
   EXPO_PUBLIC_GOOGLE_CLIENT_ID=12345-abc.apps.googleusercontent.com
   ```

7. Rebuild the APK (`pnpm android` or GitHub Actions push)

Without a Client ID, the Cloud sidebar hides the Drive section and
only shows Dropbox / OneDrive direct browser links.
````

注意: Google の OAuth client type は「Android」を選ぶ人が多いが、**Android 型は client_secret を要求しない PKCE 専用フローで、package name + SHA-1 証明書指紋の事前登録が必要**で Expo/Shelly の動的ビルドと相性が悪い。**Web application 型で redirect URI に custom scheme を直接登録する**のが Expo auth-session の標準。

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
   (Web application 型は client_secret 必要だが、PKCE 使用時は不要とみなされる場合が多い。**実装時に Google の公式ドキュメントで再確認**、必要なら .env に secret 追加)
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

### `openFile` の引数形式
`lib/open-file.ts` は bare 絶対パスを受け付けるはず (`~/Shelly/...` みたいな path)。`FileSystem.documentDirectory` が返す `file://...` prefix を受け取れるか、**実装時に `lib/open-file.ts` を確認**して必要なら `.replace('file://', '')` で変換。

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

### 現状把握
`components/layout/Sidebar.tsx` の Cloud section は以下のような構造:
- `handleCloudConnect(svcLabel)` 関数が定義されている (line 77 付近)
- Tap で `Alert.alert` が出る "coming soon" stub
- Google Drive / Dropbox / OneDrive の 3 行がハードコード

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
