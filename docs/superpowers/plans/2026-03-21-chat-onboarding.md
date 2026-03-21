# Chat-Based Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** SetupWizard完了後、Chatタブでインタラクティブなオンボーディングを実施し、ユーザーにチャットの使い方を体験させながらCerebras/Groqの設定を完了させる

**Architecture:** `lib/chat-onboarding.ts`がオンボーディングのステートマシンを管理。index.tsxがSetupWizard完了後に自動でオンボーディングを開始。各ステップはチャットバブルとして表示され、ユーザーのアクション（入力、ボタンタップ）で進行する。

**Tech Stack:** React Native / TypeScript / Zustand / AsyncStorage / i18n

---

## Task 1: ChatAgent型にcerebrasを追加 + Settings UIにCerebrasセクション追加

## Task 2: lib/chat-onboarding.ts — オンボーディングステートマシン

## Task 3: index.tsx — オンボーディング開始トリガー + ステップ処理

## Task 4: i18n — 日英キー追加

## Task 5: CLAUDE.md更新 + コミット
