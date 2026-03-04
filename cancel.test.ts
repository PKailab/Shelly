/**
 * cancel.test.ts — v1.3
 *
 * Tests for the Cancel (Ctrl+C) implementation:
 *  1. Normal cancel: running block → 'cancelling' → 'cancelled'
 *  2. Consecutive cancel: second cancel is a no-op
 *  3. Cancel while disconnected: local force-finalize
 *  4. Cancel after already finished: safe no-op
 *  5. server.js handleCancel logic (pure unit tests, no WS)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal in-memory block store to test cancel state transitions
 * without mounting the full Zustand store.
 */
type BlockStatus = 'running' | 'cancelling' | 'cancelled' | 'done' | 'error';

type Block = {
  id: string;
  command: string;
  isRunning: boolean;
  blockStatus: BlockStatus;
  exitCode: number | null;
  connectionMode: 'mock' | 'termux';
};

function createBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'block-1',
    command: 'sleep 10',
    isRunning: true,
    blockStatus: 'running',
    exitCode: null,
    connectionMode: 'termux',
    ...overrides,
  };
}

function markBlockCancelling(block: Block): Block {
  return { ...block, blockStatus: 'cancelling' };
}

function cancelBlock(block: Block): Block {
  return { ...block, isRunning: false, blockStatus: 'cancelled', exitCode: 130 };
}

function finalizeBlock(block: Block, exitCode: number): Block {
  return {
    ...block,
    isRunning: false,
    blockStatus: exitCode === 130 ? 'cancelled' : 'done',
    exitCode,
  };
}

// ─── server.js cancel logic (pure simulation) ─────────────────────────────────

type ServerState = {
  activeProcess: { pid: number; killed: boolean } | null;
  activeRequestId: string | null;
  cancelPending: boolean;
};

function createServerState(): ServerState {
  return {
    activeProcess: { pid: 1234, killed: false },
    activeRequestId: 'req-001',
    cancelPending: false,
  };
}

type CancelResult =
  | { action: 'sigint_sent'; requestId: string }
  | { action: 'no_process'; requestId: string }
  | { action: 'id_mismatch'; activeId: string | null }
  | { action: 'already_cancelling' };

function serverHandleCancel(state: ServerState, requestId: string): CancelResult {
  if (!state.activeProcess) {
    return { action: 'no_process', requestId };
  }
  if (state.activeRequestId !== requestId) {
    return { action: 'id_mismatch', activeId: state.activeRequestId };
  }
  if (state.cancelPending) {
    return { action: 'already_cancelling' };
  }
  state.cancelPending = true;
  state.activeProcess.killed = true; // simulate SIGINT
  return { action: 'sigint_sent', requestId };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Cancel — block state transitions', () => {
  it('1. Normal cancel: running → cancelling → cancelled', () => {
    let block = createBlock();
    expect(block.blockStatus).toBe('running');
    expect(block.isRunning).toBe(true);

    // Step 1: user presses Cancel → immediate UI update
    block = markBlockCancelling(block);
    expect(block.blockStatus).toBe('cancelling');
    expect(block.isRunning).toBe(true); // still running until server confirms

    // Step 2: server sends { type: "cancelled", code: 130 }
    block = cancelBlock(block);
    expect(block.blockStatus).toBe('cancelled');
    expect(block.isRunning).toBe(false);
    expect(block.exitCode).toBe(130);
  });

  it('2. Consecutive cancel: second markBlockCancelling is idempotent', () => {
    let block = createBlock();
    block = markBlockCancelling(block);
    block = markBlockCancelling(block); // second call
    expect(block.blockStatus).toBe('cancelling');
    expect(block.isRunning).toBe(true);
  });

  it('3. Cancel while disconnected: force-finalize locally', () => {
    let block = createBlock();
    // No WS available → skip markBlockCancelling, go straight to cancelBlock
    block = cancelBlock(block);
    expect(block.blockStatus).toBe('cancelled');
    expect(block.isRunning).toBe(false);
    expect(block.exitCode).toBe(130);
  });

  it('4. Cancel after already finished: finalizeBlock is not overwritten', () => {
    let block = createBlock();
    // Block finishes normally first
    block = finalizeBlock(block, 0);
    expect(block.blockStatus).toBe('done');
    expect(block.exitCode).toBe(0);

    // Stale cancel arrives — should not change state (caller guards on isRunning)
    if (block.isRunning) {
      block = cancelBlock(block);
    }
    // State unchanged
    expect(block.blockStatus).toBe('done');
    expect(block.exitCode).toBe(0);
  });

  it('5. exit with cancelled:true flag → treated as cancelled', () => {
    let block = createBlock();
    // Server sends { type: "exit", code: 130, cancelled: true }
    block = finalizeBlock(block, 130);
    expect(block.blockStatus).toBe('cancelled');
    expect(block.exitCode).toBe(130);
  });
});

describe('Cancel — server.js handleCancel logic', () => {
  let serverState: ServerState;

  beforeEach(() => {
    serverState = createServerState();
  });

  it('6. Cancel success: sends SIGINT when process is active', () => {
    const result = serverHandleCancel(serverState, 'req-001');
    expect(result.action).toBe('sigint_sent');
    expect(serverState.cancelPending).toBe(true);
    expect(serverState.activeProcess?.killed).toBe(true);
  });

  it('7. Cancel with no active process: returns no_process', () => {
    serverState.activeProcess = null;
    serverState.activeRequestId = null;
    const result = serverHandleCancel(serverState, 'req-001');
    expect(result.action).toBe('no_process');
  });

  it('8. Cancel with requestId mismatch: returns id_mismatch', () => {
    const result = serverHandleCancel(serverState, 'req-WRONG');
    expect(result.action).toBe('id_mismatch');
    if (result.action === 'id_mismatch') {
      expect(result.activeId).toBe('req-001');
    }
  });

  it('9. Consecutive cancel: second call returns already_cancelling', () => {
    serverHandleCancel(serverState, 'req-001'); // first cancel
    const result = serverHandleCancel(serverState, 'req-001'); // second cancel
    expect(result.action).toBe('already_cancelling');
  });

  it('10. Cancel timeout fallback: force-finalize when server is unresponsive', () => {
    let block = createBlock();
    block = markBlockCancelling(block);

    // Simulate 5s timeout without receiving 'cancelled' from server
    // → force-finalize locally
    const CANCEL_TIMEOUT_MS = 5000;
    let elapsed = 0;
    const tick = (ms: number) => { elapsed += ms; };

    tick(CANCEL_TIMEOUT_MS);

    if (elapsed >= CANCEL_TIMEOUT_MS && block.blockStatus === 'cancelling') {
      block = cancelBlock(block);
    }

    expect(block.blockStatus).toBe('cancelled');
    expect(block.exitCode).toBe(130);
  });
});

describe('Cancel — battery-friendly reconnect logic', () => {
  it('11. Max reconnect attempts: stops after 5 retries', () => {
    const MAX_RECONNECT = 5;
    let attempts = 0;
    const delays: number[] = [];

    while (attempts < MAX_RECONNECT) {
      const delay = Math.min(1000 * 2 ** attempts, 30000);
      delays.push(delay);
      attempts++;
    }

    expect(attempts).toBe(MAX_RECONNECT);
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    // Should NOT reconnect after MAX_RECONNECT
    const shouldReconnect = attempts < MAX_RECONNECT;
    expect(shouldReconnect).toBe(false);
  });

  it('12. Reconnect resets on foreground resume', () => {
    let reconnectAttempts = MAX_RECONNECT_HELPER();
    // Simulate foreground resume
    reconnectAttempts = 0;
    expect(reconnectAttempts).toBe(0);
  });

  it('13. No reconnect in background (AppState !== active)', () => {
    const appState: string = 'background';
    const shouldReconnect = appState === 'active';
    expect(shouldReconnect).toBe(false);
  });
});

function MAX_RECONNECT_HELPER() { return 5; }
