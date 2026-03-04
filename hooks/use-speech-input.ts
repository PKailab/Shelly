/**
 * use-speech-input.ts — 録音 + Gemini API 文字起こしフック
 *
 * - expo-audio で音声録音
 * - Gemini 2.0 Flash API に inline_data (audio/m4a) として送信
 * - 書き起こしテキストを返す
 */

import { useState, useRef, useCallback } from 'react';
import { useTerminalStore } from '@/store/terminal-store';
import { GEMINI_API_BASE } from '@/lib/gemini';

type SpeechState = {
  status: 'idle' | 'recording' | 'transcribing';
  transcribedText: string;
  error?: string;
};

export function useSpeechInput() {
  const [state, setState] = useState<SpeechState>({
    status: 'idle',
    transcribedText: '',
  });
  const recordingRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    try {
      const { useAudioRecorder, AudioModule, RecordingPresets } = await import('expo-audio');
      // We can't use hooks dynamically, so use AudioModule directly
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setState((s) => ({ ...s, error: 'マイクの権限が必要です' }));
        return;
      }

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const recording = new AudioModule.AudioRecorder(
        RecordingPresets.HIGH_QUALITY,
      );
      await recording.prepareToRecordAsync();
      await recording.record();
      recordingRef.current = recording;
      setState({ status: 'recording', transcribedText: '' });
    } catch (err) {
      // Fallback: try expo-audio's simpler API
      try {
        const ExpoAudio = await import('expo-audio');
        const status = await ExpoAudio.AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          setState((s) => ({ ...s, error: 'マイクの権限が必要です' }));
          return;
        }

        await ExpoAudio.AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        // Use the Recording class if available
        const recording = new (ExpoAudio as any).Recording();
        await recording.prepareToRecordAsync(
          (ExpoAudio as any).RecordingPresets?.HIGH_QUALITY ?? {
            android: {
              extension: '.m4a',
              outputFormat: 'mpeg4',
              audioEncoder: 'aac',
              sampleRate: 44100,
              numberOfChannels: 1,
              bitRate: 128000,
            },
            ios: {
              extension: '.m4a',
              audioQuality: 'high',
              sampleRate: 44100,
              numberOfChannels: 1,
              bitRate: 128000,
            },
            web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
          },
        );
        await recording.startAsync();
        recordingRef.current = recording;
        setState({ status: 'recording', transcribedText: '' });
      } catch (innerErr) {
        setState({
          status: 'idle',
          transcribedText: '',
          error: `録音エラー: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
        });
      }
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    setState((s) => ({ ...s, status: 'transcribing' }));

    try {
      // Stop recording and get URI
      let uri: string;
      if (typeof recording.stop === 'function') {
        await recording.stop();
        uri = recording.uri || recording.getURI?.() || '';
      } else if (typeof recording.stopAndUnloadAsync === 'function') {
        await recording.stopAndUnloadAsync();
        uri = recording.getURI?.() || '';
      } else {
        throw new Error('Unknown recording API');
      }
      recordingRef.current = null;

      if (!uri) {
        setState({ status: 'idle', transcribedText: '', error: '録音ファイルが見つかりません' });
        return;
      }

      // Read file as base64
      const FileSystem = await import('expo-file-system/legacy');
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Send to Gemini for transcription
      const apiKey = useTerminalStore.getState().settings.geminiApiKey;
      if (!apiKey || apiKey.trim().length < 10) {
        setState({
          status: 'idle',
          transcribedText: '',
          error: 'Gemini APIキーが未設定または無効です。文字起こしにはGemini APIが必要です。',
        });
        return;
      }

      const url =
        `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent` +
        `?key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: 'audio/m4a',
                    data: base64Audio,
                  },
                },
                {
                  text: 'この音声を正確に書き起こしてください。テキストのみ出力してください。余計な説明は不要です。',
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        setState({
          status: 'idle',
          transcribedText: '',
          error: `文字起こしエラー: HTTP ${res.status}`,
        });
        return;
      }

      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

      setState({
        status: 'idle',
        transcribedText: text,
      });
    } catch (err) {
      recordingRef.current = null;
      setState({
        status: 'idle',
        transcribedText: '',
        error: `文字起こしエラー: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, []);

  return { state, startRecording, stopRecording };
}
