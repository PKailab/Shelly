import { requireNativeViewManager } from 'expo-modules-core';
import { ViewProps } from 'react-native';

export type FontFamily = 'jetbrains-mono' | 'fira-code' | 'pixel-mplus';

export type CursorShape = 'block' | 'underline' | 'bar';

export interface OutputEvent {
  nativeEvent: {
    text: string;
    isError: boolean;
  };
}

export interface BlockCompletedEvent {
  nativeEvent: {
    command: string;
    output: string;
    exitCode: number;
  };
}

export interface SelectionChangedEvent {
  nativeEvent: {
    text: string;
  };
}

export interface UrlDetectedEvent {
  nativeEvent: {
    url: string;
    type: string;
  };
}

export interface TitleChangedEvent {
  nativeEvent: {
    title: string;
  };
}

export interface NativeTerminalViewProps extends ViewProps {
  sessionId: string;
  fontFamily: FontFamily;
  fontSize: number;
  cursorShape?: CursorShape;
  cursorBlink?: boolean;
  onOutput?: (event: OutputEvent) => void;
  onBlockCompleted?: (event: BlockCompletedEvent) => void;
  onSelectionChanged?: (event: SelectionChangedEvent) => void;
  onUrlDetected?: (event: UrlDetectedEvent) => void;
  onBell?: () => void;
  onTitleChanged?: (event: TitleChangedEvent) => void;
}

export const NativeTerminalView =
  requireNativeViewManager<NativeTerminalViewProps>('TerminalView');
