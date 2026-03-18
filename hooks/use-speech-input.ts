/**
 * use-speech-input.ts — 録音 + Gemini API 文字起こしフック
 *
 * - expo-audio で音声録音
 * - Gemini 2.0 Flash API に inline_data (audio/m4a) として送信
 * - 書き起こしテキストを返す
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTerminalStore } from '@/store/terminal-store';
import { GEMINI_API_BASE } from '@/lib/gemini';
import { groqTranscribe } from '@/lib/groq';

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
      console.warn('[SpeechInput] Recording failed:', err);
      setState({
        status: 'idle',
        transcribedText: '',
        error: `録音エラー: ${err instanceof Error ? err.message : String(err)}`,
      });
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

      // Transcription priority: Groq Whisper > Gemini API
      const settings = useTerminalStore.getState().settings;
      const groqKey = settings.groqApiKey;
      const geminiKey = settings.geminiApiKey;

      let text = '';

      if (groqKey && groqKey.trim().length >= 10) {
        // Use Groq Whisper (faster, dedicated STT)
        const result = await groqTranscribe(groqKey, uri);
        if (!result.success) {
          setState({ status: 'idle', transcribedText: '', error: result.error });
          return;
        }
        text = result.content ?? '';
      } else if (geminiKey && geminiKey.trim().length >= 10) {
        // Fallback to Gemini multimodal transcription
        const url = `${GEMINI_API_BASE}/models/gemini-2.0-flash:generateContent`;

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
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
          setState({
            status: 'idle',
            transcribedText: '',
            error: `文字起こしエラー: HTTP ${res.status}`,
          });
          return;
        }

        const json = await res.json();
        text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      } else {
        setState({
          status: 'idle',
          transcribedText: '',
          error: '音声文字起こしにはGroqまたはGemini APIキーが必要です。設定画面で入力してください。',
        });
        return;
      }

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

  // Cleanup: stop recording on unmount to prevent background audio leak
  useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      if (recording) {
        try {
          if (typeof recording.stop === 'function') recording.stop();
          else if (typeof recording.stopAndUnloadAsync === 'function') recording.stopAndUnloadAsync();
        } catch { /* best effort */ }
        recordingRef.current = null;
      }
    };
  }, []);

  return { state, startRecording, stopRecording };
}
