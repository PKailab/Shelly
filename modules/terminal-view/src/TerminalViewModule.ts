// @ts-expect-error — expo-modules-core types not exposed by pnpm hoisting; runtime resolves fine
import { requireNativeModule } from 'expo-modules-core';
export default requireNativeModule('TerminalView');
