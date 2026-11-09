// Settings → About → What's new (NEW-3): the current release's cards again, with a ✕, swiping both
// ways and nothing kept. A modal of its own, so Settings stays underneath.

import React from 'react';
import { Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WhatsNewScreen } from './WhatsNewScreen';

export function WhatsNewReplay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* iOS needs a gesture root inside a native modal for the swipes. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {visible ? <WhatsNewScreen mode="replay" onClose={onClose} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
