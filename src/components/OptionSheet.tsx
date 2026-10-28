import React from 'react';
import { ActionSheet } from './v2/ActionSheet';

export interface OptionSheetSection<T extends string> {
  title?: string;
  options: Array<{ value: T; label: string }>;
}

/**
 * iOS-style pick-one sheet: grouped rows, trailing checkmark on the current
 * value, Cancel at the bottom. Selecting a row closes the sheet.
 */
export function OptionSheet<T extends string>({
  visible,
  title,
  sections,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  sections: OptionSheetSection<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  // The menu: the choices as rows, the current one checked.
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={title}
      actions={sections.flatMap((section) =>
        section.options.map((opt, i) => ({
          key: opt.value,
          label: opt.label,
          selected: opt.value === value,
          section: i === 0 ? section.title : undefined,
          onPress: () => onSelect(opt.value),
        })),
      )}
    />
  );
}
