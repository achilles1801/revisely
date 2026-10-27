// Copy text to the clipboard with React Native's own Clipboard module, which is
// in every build (RCTClipboard). The community package that replaces it, and
// expo-clipboard, would be native changes. Reached through the registry rather
// than `Clipboard` from 'react-native', which warns that it moved.

import { TurboModule, TurboModuleRegistry } from 'react-native';

interface ClipboardModule extends TurboModule {
  setString(text: string): void;
}

export function copyText(text: string): void {
  TurboModuleRegistry.getEnforcing<ClipboardModule>('Clipboard').setString(text);
}
