import { NativeModule, requireNativeModule } from 'expo-modules-core';

declare class TerminalEmulatorModuleType extends NativeModule {
  testJni(): Promise<number>;
}

export default requireNativeModule<TerminalEmulatorModuleType>('TerminalEmulator');
