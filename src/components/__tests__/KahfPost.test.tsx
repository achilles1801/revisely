import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { KahfPost } from '../home/feed/KahfPost';
import { ThemeProvider } from '../../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
}));

function renderPost(state: 'prompt' | 'done' = 'prompt') {
  const props = { onRead: jest.fn(), onMarkRead: jest.fn(), onDismiss: jest.fn() };
  render(
    <ThemeProvider>
      <KahfPost state={state} {...props} />
    </ThemeProvider>,
  );
  return props;
}

// A menu's action runs once its sheet has gone (iOS: the modal's onDismiss).
function sheetsGone() {
  const { Modal } = jest.requireActual('react-native');
  act(() => {
    screen.UNSAFE_getAllByType(Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
  });
}

describe('<KahfPost />', () => {
  it('suggests Al-Kahf with its pages', async () => {
    renderPost();
    expect(await screen.findByText("It's Friday. Read Surah Al-Kahf.")).toBeTruthy();
    expect(screen.getByText('The whole surah, pages 293–304.')).toBeTruthy();
  });

  it('Read opens the surah; Not today, in its menu, dismisses', async () => {
    const props = renderPost();
    fireEvent.press(await screen.findByLabelText('Read Surah Al-Kahf'));
    expect(props.onRead).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Al-Kahf options'));
    fireEvent.press(screen.getByLabelText('Not today'));
    sheetsGone();
    expect(props.onDismiss).toHaveBeenCalled();
    expect(props.onMarkRead).not.toHaveBeenCalled();
  });

  it('Mark as read asks for minutes and records the choice; the usual one is marked', async () => {
    const props = renderPost();
    fireEvent.press(await screen.findByLabelText('Mark Surah Al-Kahf as read'));
    expect(screen.getByText('How long did it take?')).toBeTruthy();
    expect(screen.getByLabelText('20 minutes, Usual')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('30 minutes'));
    sheetsGone();
    expect(props.onMarkRead).toHaveBeenCalledWith(30);
  });

  it('Cancel records nothing', async () => {
    const props = renderPost();
    fireEvent.press(await screen.findByLabelText('Mark Surah Al-Kahf as read'));
    fireEvent.press(screen.getByTestId('sheet-cancel'));
    sheetsGone();
    expect(props.onMarkRead).not.toHaveBeenCalled();
  });

  it('once read: Open, with no prompt actions and no menu', async () => {
    const props = renderPost('done');
    expect(await screen.findByText('Read today.')).toBeTruthy();
    expect(screen.queryByLabelText('Mark Surah Al-Kahf as read')).toBeNull();
    expect(screen.queryByLabelText('Al-Kahf options')).toBeNull();
    fireEvent.press(screen.getByLabelText('Open Surah Al-Kahf'));
    expect(props.onRead).toHaveBeenCalled();
  });
});
