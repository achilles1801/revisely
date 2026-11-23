import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { ActionSheet } from '../v2/ActionSheet';
import { t } from '../../i18n';
import { describePack, packMenuActions, packRowShown, usePackStatus } from '../../lib/onDevice/packUi';

interface RowProps {
  icon: 'hardware-chip-outline';
  label: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
}

/** Revisely Dev's row for Recite's pack, beside the offline mushaf (ONDEV-3), drawn with Settings' own Row. Nothing in
 *  a build without the module. */
export function RecitePackRow({ Row }: { Row: React.ComponentType<RowProps> }) {
  if (!packRowShown()) return null;
  return <PackRow Row={Row} />;
}

function PackRow({ Row }: { Row: React.ComponentType<RowProps> }) {
  const status = usePackStatus();
  const text = describePack(status);
  const [menu, setMenu] = useState(false);
  const { fontScale } = useWindowDimensions();
  return (
    <View testID="recite-pack-row">
      <Row
        icon="hardware-chip-outline"
        label={t('settings.recitePack.title')}
        subtitle={text.subtitle}
        value={fontScale > 1.35 ? undefined : text.value || undefined}
        onPress={() => setMenu(true)}
      />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={t('settings.recitePack.title')}
        message={text.subtitle}
        messageMaxScale={1.4}
        actions={packMenuActions(status)}
        testID="recite-pack-menu"
      />
    </View>
  );
}
