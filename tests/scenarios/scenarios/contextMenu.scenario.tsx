// The iOS-style long-press menu (ACT-6): its actions run once the menu has closed, and touching
// the backdrop closes it without running anything.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ContextMenu } from '../../../src/components/v2/ContextMenu';

jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));

describe('The long-press menu (ACT-6)', () => {
  it('[ACT-6] an action runs once, after the menu has closed', () => {
    const order: string[] = [];
    const onClose = jest.fn(() => order.push('close'));
    const onEdit = jest.fn(() => order.push('edit'));
    const screen = render(
      <ContextMenu
        visible
        onClose={onClose}
        preview={{ icon: 'create-outline', label: 'Note · 9:40 PM', text: '548–549 keep slipping.' }}
        actions={[
          { key: 'edit', label: 'Edit', icon: 'create-outline', onPress: onEdit },
          { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: jest.fn() },
        ]}
      />,
    );
    expect(screen.getByText('548–549 keep slipping.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-action-edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['close', 'edit']);
  });

  it('[ACT-6] touching the backdrop closes the menu and runs nothing', () => {
    const onClose = jest.fn();
    const onEdit = jest.fn();
    const screen = render(<ContextMenu visible onClose={onClose} actions={[{ key: 'edit', label: 'Edit', onPress: onEdit }]} />);
    fireEvent.press(screen.getByLabelText('Close menu'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
