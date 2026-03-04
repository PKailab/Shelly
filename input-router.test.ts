import { describe, it, expect } from 'vitest';
import { parseInput } from '../lib/input-router';

describe('parseInput — 4-layer routing', () => {
  // ── Layer 1: @mention ──────────────────────────────────────────────────────
  describe('Layer 1: @mention', () => {
    it('@claude routes to claude', () => {
      const r = parseInput('@claude Reactアプリ作って');
      expect(r.layer).toBe('mention');
      expect(r.target).toBe('claude');
      expect(r.prompt).toBe('Reactアプリ作って');
    });

    it('@gemini routes to gemini', () => {
      const r = parseInput('@gemini このコード説明して');
      expect(r.layer).toBe('mention');
      expect(r.target).toBe('gemini');
      expect(r.prompt).toBe('このコード説明して');
    });

    it('@local routes to local', () => {
      const r = parseInput('@local hello world');
      expect(r.layer).toBe('mention');
      expect(r.target).toBe('local');
      expect(r.prompt).toBe('hello world');
    });

    it('@mention with no prompt still routes correctly', () => {
      const r = parseInput('@claude');
      expect(r.layer).toBe('mention');
      expect(r.target).toBe('claude');
    });
  });

  // ── Layer 2: Natural language + tool name ──────────────────────────────────
  describe('Layer 2: Natural language + tool name', () => {
    it('ClaudeCodeで routes to claude', () => {
      const r = parseInput('ClaudeCodeでTodoアプリ作って');
      expect(r.layer).toBe('nl_with_tool');
      expect(r.target).toBe('claude');
    });

    it('Geminiで routes to gemini', () => {
      const r = parseInput('Geminiでこのファイル分析して');
      expect(r.layer).toBe('nl_with_tool');
      expect(r.target).toBe('gemini');
    });

    it('ローカルLLMで routes to local', () => {
      const r = parseInput('ローカルLLMで質問したい');
      expect(r.layer).toBe('nl_with_tool');
      expect(r.target).toBe('local');
    });
  });

  // ── Layer 3: Natural language only → suggest ───────────────────────────────
  describe('Layer 3: Natural language → suggest', () => {
    it('Japanese natural language returns suggest', () => {
      const r = parseInput('Todoアプリ作って');
      expect(r.layer).toBe('natural');
      expect(r.target).toBe('suggest');
      expect(r.suggestions).toBeDefined();
      expect(r.suggestions!.length).toBeGreaterThan(0);
    });

    it('English natural language returns suggest', () => {
      const r = parseInput('create a todo app');
      expect(r.layer).toBe('natural');
      expect(r.target).toBe('suggest');
    });
  });

  // ── Layer 4: Shell command ─────────────────────────────────────────────────
  describe('Layer 4: Shell command', () => {
    it('ls routes as command', () => {
      const r = parseInput('ls -la');
      expect(r.layer).toBe('command');
      expect(r.target).toBe('termux');
    });

    it('git status routes as command', () => {
      const r = parseInput('git status');
      expect(r.layer).toBe('command');
      expect(r.target).toBe('termux');
    });

    it('cd routes as command', () => {
      const r = parseInput('cd /home');
      expect(r.layer).toBe('command');
      expect(r.target).toBe('termux');
    });

    it('npm install routes as command', () => {
      const r = parseInput('npm install express');
      expect(r.layer).toBe('command');
      expect(r.target).toBe('termux');
    });

    it('pip routes as command', () => {
      const r = parseInput('pip install requests');
      expect(r.layer).toBe('command');
      expect(r.target).toBe('termux');
    });
  });

  // ── logSummary / mentionHint ───────────────────────────────────────────────
  describe('Log & hint metadata', () => {
    it('@mention has logSummary', () => {
      const r = parseInput('@claude hello');
      expect(r.logSummary).toBeTruthy();
      expect(r.logSummary.length).toBeGreaterThan(0);
    });

    it('nl_with_tool has mentionHint', () => {
      const r = parseInput('ClaudeCodeでアプリ作って');
      expect(r.mentionHint).toBeDefined();
      expect(r.mentionHint!.example).toContain('@claude');
    });

    it('natural has suggestions with mentionExample', () => {
      const r = parseInput('アプリ作って');
      expect(r.suggestions).toBeDefined();
      r.suggestions!.forEach((s) => {
        expect(s.mentionExample).toContain('@');
      });
    });
  });
});
