/**
 * lib/command-safety.ts
 *
 * コマンド安全システム
 * 実行前にコマンドの危険度を判定し、確認を促す。
 *
 * 危険度レベル:
 *   CRITICAL  - 実行するとシステムが破壊される可能性（必ず確認）
 *   HIGH      - データ損失・権限昇格の可能性（確認推奨）
 *   MEDIUM    - 副作用があるが可逆的な操作（警告のみ）
 *   LOW / SAFE - 通常の操作（確認不要）
 */

export type DangerLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';

export interface SafetyResult {
  level: DangerLevel;
  /** 日本語の警告メッセージ */
  message: string;
  /** マッチしたパターン（デバッグ用） */
  matchedPattern?: string;
  /** 危険なコマンドの具体的な理由 */
  reason: string;
}

// ─── 危険パターン定義 ─────────────────────────────────────────────────────────

interface DangerPattern {
  pattern: RegExp;
  level: DangerLevel;
  reason: string;
}

const DANGER_PATTERNS: DangerPattern[] = [
  // ── CRITICAL: システム破壊・データ全損 ──────────────────────────────────────
  {
    pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(\/|~\/?\s*$|\/\*|~\/\*)/i,
    level: 'CRITICAL',
    reason: 'ルートディレクトリまたはホームディレクトリを再帰的に削除します。システムが起動不能になる可能性があります。',
  },
  {
    pattern: /rm\s+-rf\s+\/(?:usr|bin|lib|etc|boot|sys|proc|dev|sbin)/i,
    level: 'CRITICAL',
    reason: 'システムディレクトリを削除します。OSが破壊されます。',
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    level: 'CRITICAL',
    reason: 'フォーク爆弾です。システムがフリーズします。',
  },
  {
    pattern: /dd\s+if=\/dev\/(?:zero|random|urandom)\s+of=\/dev\/(?:sd[a-z]|nvme|mmcblk)/i,
    level: 'CRITICAL',
    reason: 'ストレージデバイスを上書きします。全データが消去されます。',
  },
  {
    pattern: /mkfs\s+.*\/dev\/(?:sd[a-z]|nvme|mmcblk)/i,
    level: 'CRITICAL',
    reason: 'ストレージデバイスをフォーマットします。全データが消去されます。',
  },
  {
    pattern: />\s*\/dev\/(?:sd[a-z]|nvme|mmcblk)/i,
    level: 'CRITICAL',
    reason: 'ストレージデバイスに直接書き込みます。データが破壊されます。',
  },
  {
    pattern: /shred\s+.*\/dev\//i,
    level: 'CRITICAL',
    reason: 'デバイスを完全消去します。',
  },

  // ── HIGH: データ損失・権限昇格・外部スクリプト実行 ──────────────────────────
  {
    pattern: /curl\s+.*\|\s*(?:bash|sh|zsh|fish|python3?|node|ruby|perl)/i,
    level: 'HIGH',
    reason: '外部からダウンロードしたスクリプトを直接実行します。悪意あるコードが含まれている可能性があります。',
  },
  {
    pattern: /wget\s+.*-O\s*-\s*\|\s*(?:bash|sh|zsh|fish)/i,
    level: 'HIGH',
    reason: '外部スクリプトをダウンロードして実行します。内容を確認してから実行してください。',
  },
  {
    pattern: /chmod\s+(?:-R\s+)?(?:777|a\+rwx|o\+w)\s+(?:\/|~\/?\s*$|\/\*)/i,
    level: 'HIGH',
    reason: 'ルートまたはホームディレクトリの全ファイルに全権限を付与します。セキュリティリスクがあります。',
  },
  {
    pattern: /sudo\s+(?:rm|chmod|chown|dd|mkfs|shred|passwd|visudo)/i,
    level: 'HIGH',
    reason: '管理者権限で危険な操作を実行します。',
  },
  {
    pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+/i,
    level: 'HIGH',
    reason: 'ファイルを再帰的に強制削除します。削除後は復元できません。',
  },
  {
    pattern: /passwd\s*(?:\w+)?$/i,
    level: 'HIGH',
    reason: 'パスワードを変更します。',
  },
  {
    pattern: /pkill\s+-9\s+|kill\s+-9\s+/i,
    level: 'HIGH',
    reason: 'プロセスを強制終了します。保存されていないデータが失われる可能性があります。',
  },
  {
    pattern: /git\s+(?:push\s+.*--force|push\s+-f)\b/i,
    level: 'HIGH',
    reason: 'リモートリポジトリを強制上書きします。他の人の変更が失われる可能性があります。',
  },
  {
    pattern: /git\s+reset\s+--hard/i,
    level: 'HIGH',
    reason: 'コミットされていない変更が全て失われます。',
  },
  {
    pattern: /DROP\s+(?:TABLE|DATABASE|SCHEMA)/i,
    level: 'HIGH',
    reason: 'データベースのテーブルまたはデータベース全体を削除します。',
  },
  {
    pattern: /TRUNCATE\s+TABLE/i,
    level: 'HIGH',
    reason: 'テーブルの全データを削除します。',
  },

  // ── MEDIUM: 副作用あり・要注意 ──────────────────────────────────────────────
  {
    pattern: /rm\s+(?!.*-[rf])/i,
    level: 'MEDIUM',
    reason: 'ファイルを削除します。削除後は復元できません。',
  },
  {
    pattern: /sudo\s+/i,
    level: 'MEDIUM',
    reason: '管理者権限でコマンドを実行します。',
  },
  {
    pattern: /npm\s+install\s+.*--global|pip\s+install\s+.*--user|pip3\s+install/i,
    level: 'MEDIUM',
    reason: 'グローバルにパッケージをインストールします。',
  },
  {
    pattern: /crontab\s+-[er]/i,
    level: 'MEDIUM',
    reason: 'スケジュールタスクを変更または削除します。',
  },
  {
    pattern: /iptables\s+|ufw\s+/i,
    level: 'MEDIUM',
    reason: 'ファイアウォール設定を変更します。',
  },
  {
    pattern: /ssh-keygen|ssh-copy-id/i,
    level: 'MEDIUM',
    reason: 'SSH鍵を生成または転送します。',
  },
];

// ─── メイン判定関数 ────────────────────────────────────────────────────────────

/**
 * コマンドの危険度を判定する。
 * パイプ（|）で繋がれた複合コマンドは全パートを評価し、最も高い危険度を返す。
 */
export function checkCommandSafety(command: string): SafetyResult {
  if (!command || !command.trim()) {
    return { level: 'SAFE', message: '', reason: '' };
  }

  // コメントを除去
  const cleaned = command.replace(/#[^\n]*/g, '').trim();

  // 最も高い危険度を追跡
  let worst: SafetyResult = { level: 'SAFE', message: '', reason: '' };

  for (const { pattern, level, reason } of DANGER_PATTERNS) {
    if (pattern.test(cleaned)) {
      if (compareDanger(level, worst.level) > 0) {
        worst = {
          level,
          reason,
          matchedPattern: pattern.source,
          message: buildMessage(level, reason),
        };
      }
      // CRITICALが見つかったら即座に返す
      if (worst.level === 'CRITICAL') break;
    }
  }

  return worst;
}

function compareDanger(a: DangerLevel, b: DangerLevel): number {
  const order: DangerLevel[] = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return order.indexOf(a) - order.indexOf(b);
}

function buildMessage(level: DangerLevel, reason: string): string {
  switch (level) {
    case 'CRITICAL':
      return `⛔ 危険なコマンドです\n\n${reason}\n\n本当に実行しますか？`;
    case 'HIGH':
      return `⚠️ 注意が必要なコマンドです\n\n${reason}\n\n続行しますか？`;
    case 'MEDIUM':
      return `ℹ️ 確認\n\n${reason}\n\n実行しますか？`;
    default:
      return '';
  }
}

/**
 * 確認ダイアログが必要かどうか（MEDIUM以上）
 */
export function needsConfirmation(result: SafetyResult): boolean {
  return result.level === 'CRITICAL' || result.level === 'HIGH' || result.level === 'MEDIUM';
}

/**
 * 危険度に対応する色を返す（UI表示用）
 */
export function dangerLevelColor(level: DangerLevel): string {
  switch (level) {
    case 'CRITICAL': return '#EF4444'; // red
    case 'HIGH':     return '#F59E0B'; // amber
    case 'MEDIUM':   return '#3B82F6'; // blue
    default:         return '#22C55E'; // green
  }
}

/**
 * 危険度のラベルテキスト（日本語）
 */
export function dangerLevelLabel(level: DangerLevel): string {
  switch (level) {
    case 'CRITICAL': return '危険';
    case 'HIGH':     return '要注意';
    case 'MEDIUM':   return '確認';
    case 'LOW':      return '低リスク';
    default:         return '安全';
  }
}
