/**
 * lib/package-doctor.ts — Diagnose and auto-repair common package errors
 *
 * Analyzes stderr from package manager commands and suggests (or auto-runs) fixes.
 * Covers: stale mirrors, GPG errors, dpkg interruption, lock files, broken dependencies.
 */

export type PackageFix = {
  fix: string;
  message: string;
  messageJa: string;
  autoRun: boolean;
};

export function diagnosePackageError(stderr: string): PackageFix | null {
  if (stderr.includes('Unable to locate package')) {
    return {
      fix: 'npm update -g',
      message: 'Updating package list...',
      messageJa: 'パッケージリストを更新中...',
      autoRun: true,
    };
  }
  if (stderr.includes('NOSPLIT') || stderr.includes('Clearsigned file')) {
    return {
      fix: 'termux-change-repo',
      message: 'Repository mirror needs to be changed. Opening mirror selector...',
      messageJa: 'リポジトリミラーの変更が必要です。ミラー選択を開きます...',
      autoRun: false,
    };
  }
  if (stderr.includes('dpkg was interrupted')) {
    return {
      fix: 'dpkg --configure -a',
      message: 'Repairing interrupted package install...',
      messageJa: '中断されたパッケージインストールを修復中...',
      autoRun: true,
    };
  }
  if (stderr.includes('Unable to acquire the dpkg frontend lock')) {
    return {
      fix: 'rm -f $PREFIX/var/lib/dpkg/lock-frontend && dpkg --configure -a',
      message: 'Releasing lock and repairing package manager...',
      messageJa: 'ロックを解除してパッケージ管理を修復中...',
      autoRun: true,
    };
  }
  if (stderr.includes('404  Not Found') || stderr.includes('Failed to fetch')) {
    return {
      fix: 'npm update -g',
      message: 'Refreshing repository cache...',
      messageJa: 'リポジトリキャッシュを更新中...',
      autoRun: true,
    };
  }
  if (stderr.includes('Unmet dependencies') || stderr.includes('Depends:')) {
    return {
      fix: 'npm install -g',
      message: 'Fixing broken dependencies...',
      messageJa: '壊れた依存関係を修復中...',
      autoRun: true,
    };
  }
  if (stderr.includes('Hash Sum mismatch')) {
    return {
      fix: 'npm cache clean --force && npm update -g',
      message: 'Clearing corrupted cache and updating...',
      messageJa: '壊れたキャッシュをクリアして更新中...',
      autoRun: true,
    };
  }
  return null;
}
