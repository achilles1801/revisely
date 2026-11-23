import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { nextTakeLine, ReciteWhereRow } from '../ReciteWhereRow';
import { reciteWhere, resetReciteWhereForTests } from '../../../lib/reciteLive/whereSettings';

jest.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ palette: { text: '#000', secondary: '#555' } }),
}));
jest.mock('../../../lib/onDevice/engine', () => ({
  warmEngine: jest.fn(),
  whereNow: jest.fn(() => ({ on: 'server', why: 'no-pack' })),
}));

const { warmEngine } = jest.requireMock('../../../lib/onDevice/engine') as { warmEngine: jest.Mock };

beforeEach(() => {
  resetReciteWhereForTests();
  warmEngine.mockClear();
});

describe('ReciteWhereRow', () => {
  it('moves through Automatic, this phone and the server, and keeps the choice', () => {
    const { getByTestId } = render(<ReciteWhereRow />);
    const value = () => getByTestId('settings-recite-where-value').props.children;
    expect(value()).toBe('Automatic');
    fireEvent.press(getByTestId('settings-recite-where'));
    expect(value()).toBe('This phone');
    expect(reciteWhere().testing).toBe('phone');
    expect(warmEngine).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('settings-recite-where'));
    expect(value()).toBe('The server');
    expect(reciteWhere().testing).toBe('server');
    fireEvent.press(getByTestId('settings-recite-where'));
    expect(value()).toBe('Automatic');
    expect(reciteWhere().testing).toBeNull();
    expect(warmEngine).toHaveBeenCalledTimes(1);
  });

  it('says where the next take runs, and why it is not the phone', () => {
    const { getByTestId } = render(<ReciteWhereRow />);
    expect(getByTestId('settings-recite-where-next').props.children).toBe('Next take: on the server. No engine on this phone yet');
  });

  it.each([
    [{ on: 'phone', why: 'forced' }, 'Next take: on this phone. It won’t be kept as test data yet'],
    [{ on: 'phone', why: 'replay' }, 'Next take: a recorded take, played on this phone'],
    [{ on: 'server', why: 'config' }, 'Next take: on the server'],
    [{ on: 'server', why: 'no-pack' }, 'Next take: on the server. No engine on this phone yet'],
    [{ on: 'server', why: 'self-check' }, 'Next take: on the server. The engine failed its check'],
    [{ on: 'server', why: 'no-speed' }, 'Next take: on the server. This phone’s speed isn’t checked yet'],
    [{ on: 'server', why: 'slow' }, 'Next take: on the server. This phone is too slow for it'],
    [{ on: 'server', why: 'lacks' }, 'Next take: on the server. The engine can’t do this yet'],
  ] as const)('%j', (answer, line) => {
    expect(nextTakeLine(answer)).toBe(line);
  });
});
