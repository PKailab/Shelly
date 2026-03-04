import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG,
  buildSetupSteps,
  buildDownloadCommand,
  buildDaemonStartScript,
  buildStopCommand,
  buildStatusCommand,
  buildDeleteModelCommand,
  buildListModelsCommand,
  getModelById,
  getRecommendedModel,
  estimateTotalSetupTime,
  checkRamRequirement,
  getLlamaCppLocalLlmConfig,
} from '../lib/llamacpp-setup';

describe('MODEL_CATALOG', () => {
  it('5モデル以上が定義されている', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThanOrEqual(5);
  });

  it('全モデルに必須フィールドが存在する', () => {
    for (const m of MODEL_CATALOG) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.sizeGb).toBeGreaterThan(0);
      expect(m.ramRequiredGb).toBeGreaterThan(0);
      expect(m.downloadUrl).toMatch(/^https:\/\//);
      expect(m.filename).toMatch(/\.gguf$/);
    }
  });

  it('推奨モデルが1つ存在する', () => {
    const recommended = MODEL_CATALOG.filter((m) => m.recommended);
    expect(recommended.length).toBe(1);
  });

  it('Qwen2.5-7BがZ Fold6（12GB）のRAM要件を満たす', () => {
    const qwen7b = MODEL_CATALOG.find((m) => m.id === 'qwen2.5-7b-q3');
    expect(qwen7b).toBeDefined();
    expect(qwen7b!.ramRequiredGb).toBeLessThanOrEqual(10); // 12GB中10GB以内
  });
});

describe('getModelById', () => {
  it('存在するIDで正しいモデルを返す', () => {
    const m = getModelById('qwen2.5-7b-q3');
    expect(m).toBeDefined();
    expect(m!.name).toBe('Qwen 2.5 7B');
  });

  it('存在しないIDでundefinedを返す', () => {
    expect(getModelById('nonexistent')).toBeUndefined();
  });
});

describe('getRecommendedModel', () => {
  it('推奨モデルを返す', () => {
    const m = getRecommendedModel();
    expect(m.recommended).toBe(true);
  });
});

describe('buildSetupSteps', () => {
  it('1ステップ以上を返す（pkg install版は2ステップ）', () => {
    const steps = buildSetupSteps();
    expect(steps.length).toBeGreaterThanOrEqual(1);
  });

  it('全ステップにidとcommandが存在する', () => {
    for (const s of buildSetupSteps()) {
      expect(s.id).toBeTruthy();
      expect(s.command).toBeTruthy();
      expect(s.estimatedSeconds).toBeGreaterThan(0);
    }
  });

  it('criticalなステップが含まれる', () => {
    const critical = buildSetupSteps().filter((s) => s.critical);
    expect(critical.length).toBeGreaterThan(0);
  });
});

describe('estimateTotalSetupTime', () => {
  it('全ステップの合計時間が1秒以上（pkg install版は高速）', () => {
    const steps = buildSetupSteps();
    expect(estimateTotalSetupTime(steps)).toBeGreaterThanOrEqual(1);
  });
});

describe('buildDownloadCommand', () => {
  it('wgetコマンドを含む', () => {
    const m = getRecommendedModel();
    const cmd = buildDownloadCommand(m);
    expect(cmd).toContain('wget');
    expect(cmd).toContain(m.downloadUrl);
    expect(cmd).toContain(m.filename);
  });
});

describe('buildDaemonStartScript', () => {
  it('nohupとllama-serverを含む', () => {
    const m = getRecommendedModel();
    const script = buildDaemonStartScript(m);
    expect(script).toContain('nohup');
    expect(script).toContain('llama-server');
    expect(script).toContain('8080');
    expect(script).toContain(m.filename);
  });

  it('PIDファイルを作成する', () => {
    const m = getRecommendedModel();
    const script = buildDaemonStartScript(m);
    expect(script).toContain('.pid');
  });
});

describe('buildStopCommand', () => {
  it('pkillを含む', () => {
    expect(buildStopCommand()).toContain('pkill');
    expect(buildStopCommand()).toContain('llama-server');
  });
});

describe('buildStatusCommand', () => {
  it('pgrepを含む', () => {
    expect(buildStatusCommand()).toContain('pgrep');
  });
});

describe('buildDeleteModelCommand', () => {
  it('rmコマンドとファイル名を含む', () => {
    const m = getRecommendedModel();
    const cmd = buildDeleteModelCommand(m);
    expect(cmd).toContain('rm');
    expect(cmd).toContain(m.filename);
  });
});

describe('buildListModelsCommand', () => {
  it('lsコマンドとggufを含む', () => {
    expect(buildListModelsCommand()).toContain('ls');
    expect(buildListModelsCommand()).toContain('.gguf');
  });
});

describe('checkRamRequirement', () => {
  it('RAM十分な場合はok=true', () => {
    const m = getRecommendedModel();
    const result = checkRamRequirement(m, 12);
    expect(result.ok).toBe(true);
  });

  it('RAM不足の場合はok=false', () => {
    const m = MODEL_CATALOG.find((x) => x.id === 'qwen2.5-7b-q3')!;
    const result = checkRamRequirement(m, 4); // 4GBでは不足
    expect(result.ok).toBe(false);
    expect(result.message).toContain('RAM不足');
  });
});

describe('getLlamaCppLocalLlmConfig', () => {
  it('ポート8080のURLを返す', () => {
    const m = getRecommendedModel();
    const config = getLlamaCppLocalLlmConfig(m);
    expect(config.baseUrl).toBe('http://127.0.0.1:8080');
    expect(config.apiType).toBe('openai_compat');
  });
});
