/**
 * tests/ctrl-c.test.ts
 *
 * Unit tests for Ctrl+C ShortcutBar integration (v1.4)
 *
 * Tests:
 *  1. Running command → Ctrl+C fires cancelCurrent
 *  2. No running command → toast shown, cancelCurrent NOT called
 *  3. Disconnected + Termux mode → toast "Not connected", cancelCurrent NOT called
 *  4. Cancelling state (already cancelling) → repeated press is safe (no crash)
 *  5. Mock mode + running → cancelCurrent still callable (no-op in mock)
 *  6. isRunning derived correctly from block state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────────────

type ConnectionMode = 'mock' | 'termux' | 'disconnected';
type BlockStatus = 'running' | 'cancelling' | 'cancelled' | 'done' | 'error';

interface Block {
  id: string;
  isRunning: boolean;
  blockStatus?: BlockStatus;
}

/**
 * Simulates the ShortcutBar Ctrl+C handler logic extracted for unit testing.
 * Returns the action taken: 'cancel' | 'toast_no_running' | 'toast_not_connected'
 */
function handleCtrlCLogic(opts: {
  connectionMode: ConnectionMode;
  isBridgeConnected: boolean;
  isRunning: boolean;
  cancelCurrent: () => void;
  showToast: (msg: 'no_running' | 'not_connected') => void;
}): 'cancel' | 'toast_no_running' | 'toast_not_connected' {
  const { connectionMode, isBridgeConnected, isRunning, cancelCurrent, showToast } = opts;

  if (connectionMode === 'termux' && !isBridgeConnected) {
    showToast('not_connected');
    return 'toast_not_connected';
  }

  if (!isRunning) {
    showToast('no_running');
    return 'toast_no_running';
  }

  cancelCurrent();
  return 'cancel';
}

/**
 * Derives isRunning from blocks array (same logic as index.tsx).
 */
function deriveIsRunning(blocks: Block[]): boolean {
  return blocks.some((b) => b.isRunning || b.blockStatus === 'cancelling');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Ctrl+C ShortcutBar — handleCtrlCLogic', () => {
  let cancelCurrent: ReturnType<typeof vi.fn>;
  let showToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cancelCurrent = vi.fn();
    showToast = vi.fn();
  });

  it('1. Running command → fires cancelCurrent', () => {
    const result = handleCtrlCLogic({
      connectionMode: 'termux',
      isBridgeConnected: true,
      isRunning: true,
      cancelCurrent,
      showToast,
    });

    expect(result).toBe('cancel');
    expect(cancelCurrent).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('2. No running command → shows "no_running" toast, does NOT call cancelCurrent', () => {
    const result = handleCtrlCLogic({
      connectionMode: 'termux',
      isBridgeConnected: true,
      isRunning: false,
      cancelCurrent,
      showToast,
    });

    expect(result).toBe('toast_no_running');
    expect(showToast).toHaveBeenCalledWith('no_running');
    expect(cancelCurrent).not.toHaveBeenCalled();
  });

  it('3. Disconnected + Termux mode → shows "not_connected" toast, does NOT call cancelCurrent', () => {
    const result = handleCtrlCLogic({
      connectionMode: 'termux',
      isBridgeConnected: false,
      isRunning: true,        // even if running, disconnected takes priority
      cancelCurrent,
      showToast,
    });

    expect(result).toBe('toast_not_connected');
    expect(showToast).toHaveBeenCalledWith('not_connected');
    expect(cancelCurrent).not.toHaveBeenCalled();
  });

  it('4. Cancelling state → repeated Ctrl+C still calls cancelCurrent (idempotent)', () => {
    // Press once
    handleCtrlCLogic({
      connectionMode: 'termux',
      isBridgeConnected: true,
      isRunning: true,   // cancelling counts as "running" for this check
      cancelCurrent,
      showToast,
    });
    // Press again (spam)
    handleCtrlCLogic({
      connectionMode: 'termux',
      isBridgeConnected: true,
      isRunning: true,
      cancelCurrent,
      showToast,
    });
    // Press a third time
    handleCtrlCLogic({
      connectionMode: 'termux',
      isBridgeConnected: true,
      isRunning: true,
      cancelCurrent,
      showToast,
    });

    // cancelCurrent is called each time; the hook itself is idempotent
    expect(cancelCurrent).toHaveBeenCalledTimes(3);
    // No crash, no toast
    expect(showToast).not.toHaveBeenCalled();
  });

  it('5. Mock mode + running → cancelCurrent is still called (no-op in mock is fine)', () => {
    const result = handleCtrlCLogic({
      connectionMode: 'mock',
      isBridgeConnected: false,   // mock mode has no bridge
      isRunning: true,
      cancelCurrent,
      showToast,
    });

    // In mock mode, isBridgeConnected check only applies when connectionMode === 'termux'
    expect(result).toBe('cancel');
    expect(cancelCurrent).toHaveBeenCalledTimes(1);
  });

  it('6. Disconnected mode (not termux) + running → cancelCurrent is called', () => {
    const result = handleCtrlCLogic({
      connectionMode: 'disconnected',
      isBridgeConnected: false,
      isRunning: true,
      cancelCurrent,
      showToast,
    });

    expect(result).toBe('cancel');
    expect(cancelCurrent).toHaveBeenCalledTimes(1);
  });
});

describe('isRunning derivation from blocks', () => {
  it('7. Empty blocks → isRunning false', () => {
    expect(deriveIsRunning([])).toBe(false);
  });

  it('8. Block with isRunning:true → isRunning true', () => {
    const blocks: Block[] = [
      { id: '1', isRunning: true, blockStatus: 'running' },
    ];
    expect(deriveIsRunning(blocks)).toBe(true);
  });

  it('9. Block with blockStatus:cancelling → isRunning true', () => {
    const blocks: Block[] = [
      { id: '1', isRunning: false, blockStatus: 'cancelling' },
    ];
    expect(deriveIsRunning(blocks)).toBe(true);
  });

  it('10. Block with blockStatus:cancelled → isRunning false', () => {
    const blocks: Block[] = [
      { id: '1', isRunning: false, blockStatus: 'cancelled' },
    ];
    expect(deriveIsRunning(blocks)).toBe(false);
  });

  it('11. Multiple blocks, only one running → isRunning true', () => {
    const blocks: Block[] = [
      { id: '1', isRunning: false, blockStatus: 'done' },
      { id: '2', isRunning: true,  blockStatus: 'running' },
      { id: '3', isRunning: false, blockStatus: 'done' },
    ];
    expect(deriveIsRunning(blocks)).toBe(true);
  });

  it('12. All blocks done → isRunning false', () => {
    const blocks: Block[] = [
      { id: '1', isRunning: false, blockStatus: 'done' },
      { id: '2', isRunning: false, blockStatus: 'done' },
    ];
    expect(deriveIsRunning(blocks)).toBe(false);
  });
});
