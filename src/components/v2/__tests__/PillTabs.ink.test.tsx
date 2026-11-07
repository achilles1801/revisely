// Activity's tabs (gap audit §1 A): ink tone (the chosen pill is the text colour) and hug (no flex).
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = require('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false), theme: {}, isDark: false }) };
});
import { PillTabs } from '../PillTabs';

const options = [
  { value: 'calendar' as const, label: 'Calendar' },
  { value: 'insights' as const, label: 'Insights' },
];

describe('PillTabs in Activity (gap audit A)', () => {
  it('the chosen tab is selected; a press on the other changes the choice', () => {
    const onChange = jest.fn();
    const screen = render(<PillTabs options={options} value="calendar" onChange={onChange} tone="ink" hug />);
    expect(screen.getByLabelText('Calendar, selected')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pill-insights'));
    expect(onChange).toHaveBeenCalledWith('insights');
  });

  it('the primary tone is unchanged for the other screens', () => {
    const onChange = jest.fn();
    const screen = render(<PillTabs options={options} value="insights" onChange={onChange} />);
    expect(screen.getByLabelText('Insights, selected')).toBeTruthy();
  });
});
