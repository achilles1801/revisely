import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GroupedRow, GroupedSection } from '../plan/Grouped';
import { ThemeProvider } from '../../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn() }));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

function CollapsibleCycle() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <ThemeProvider>
      <GroupedSection
        header="Cycle"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        footer="Tap a day to change what’s on it."
        collapsedFooter="10-day cycle · 10 pages a day."
      >
        <GroupedRow title="Today" />
        <GroupedRow title="Tomorrow" />
      </GroupedSection>
    </ThemeProvider>
  );
}

describe('<GroupedSection collapsible />', () => {
  it('folds the rows away behind the header and back', async () => {
    render(<CollapsibleCycle />);
    expect(await screen.findByText('Today')).toBeTruthy();
    expect(screen.getByText('Tap a day to change what’s on it.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Cycle, expanded'));
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.queryByText('Tomorrow')).toBeNull();
    expect(screen.getByText('10-day cycle · 10 pages a day.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Cycle, collapsed'));
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
  });

  it('stays a plain header when not collapsible', async () => {
    render(
      <ThemeProvider>
        <GroupedSection header="More">
          <GroupedRow title="Daily Amount" />
        </GroupedSection>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Daily Amount')).toBeTruthy();
    expect(screen.queryByLabelText(/More, (expanded|collapsed)/)).toBeNull();
  });
});
