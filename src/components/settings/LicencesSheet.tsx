import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { useTheme } from '../../context/ThemeContext';
import { typeV2, layoutV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { licenseLines } from '../../lib/legal/licenseLines';
import { QML_LICENSE } from '../../lib/legal/quranMuaalemLicense';

/**
 * Settings → About → Licences (SET-5): the Quran Muaalem License in full, bundled with the app so it opens offline.
 * Nothing above or around it, as Majd asked ("super subtle like a singular button that takes them to the page with
 * the license"). The text is the licence's own, laid out for a phone by licenseLines (whitespace only).
 */
export function LicencesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette } = useTheme();
  const lines = useMemo(() => licenseLines(QML_LICENSE), []);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('settings.about.licences')} scroll testID="settings-licences-sheet">
      <View style={styles.body} testID="settings-licences-text">
        {lines.map((line, i) => (
          <Text
            key={i}
            selectable
            style={[
              typeV2.meta,
              { color: palette.text },
              line.opens && i > 0 ? styles.opens : null,
              line.centred ? styles.centred : { paddingStart: line.indent * 10 },
            ]}
          >
            {line.text}
          </Text>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layoutV2.gutter, paddingBottom: 24, gap: 4 },
  opens: { marginTop: 10 },
  centred: { textAlign: 'center' },
});
