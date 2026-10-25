import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockConfigure = jest.fn();
let mockStatusListener: ((s: any) => void) | null = null;
jest.mock('../../lib/recordingBackupController', () => ({
  configureBackup: (c: unknown) => mockConfigure(c),
  setNetwork: jest.fn(),
  requestBackup: jest.fn(),
  onBackupStatus: (l: (s: any) => void) => {
    mockStatusListener = l;
    return () => {
      mockStatusListener = null;
    };
  },
}));
jest.mock('../../lib/recordings', () => ({ onRecordingsChanged: () => () => {} }));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => {} }));
const mockSaveUser = jest.fn(() => Promise.resolve());
let mockUser: any = { id: 'u1' };
jest.mock('../../context/AppContext', () => ({
  useApp: () => ({ user: mockUser, saveUser: mockSaveUser }),
}));
let mockAuthUid: string | null = 'u1';
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ firebaseUser: mockAuthUid ? { uid: mockAuthUid } : null }),
}));

import { RecordingBackupController, backupNoticeKey } from '../RecordingBackupController';

const flush = () => act(async () => {});

beforeEach(async () => {
  await AsyncStorage.clear();
  mockConfigure.mockClear();
  mockSaveUser.mockClear();
  mockUser = { id: 'u1' };
  mockAuthUid = 'u1';
});

describe('<RecordingBackupController />', () => {
  it('starts backup for the signed-in account: on by default, Wi-Fi only, notice not seen', async () => {
    render(<RecordingBackupController />);
    await flush();
    expect(mockConfigure).toHaveBeenLastCalledWith({
      uid: 'u1',
      settings: { enabled: true, allowCellular: false, noticeShown: false },
    });
  });

  it('follows the account’s settings, and stops when signed out', async () => {
    mockUser = { id: 'u1', recordingBackup: false, recordingBackupCellular: true };
    const view = render(<RecordingBackupController />);
    await flush();
    expect(mockConfigure).toHaveBeenLastCalledWith({
      uid: 'u1',
      settings: { enabled: false, allowCellular: true, noticeShown: false },
    });
    mockUser = null;
    view.rerender(<RecordingBackupController />);
    await flush();
    expect(mockConfigure).toHaveBeenLastCalledWith(null);
  });

  it('shows the notice once, before the first upload; OK remembers it for this account', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<RecordingBackupController />);
    await flush();
    act(() => mockStatusListener?.({ phase: 'needs-notice', pending: 2 }));
    act(() => mockStatusListener?.({ phase: 'needs-notice', pending: 2 })); // not twice at once
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alert.mock.calls[0] as any;
    expect(title).toBe('Your recordings are backed up');
    await act(async () => buttons.find((b: any) => b.text === 'OK').onPress());
    expect(await AsyncStorage.getItem(backupNoticeKey('u1'))).toBe('true');
    expect(mockConfigure).toHaveBeenLastCalledWith({
      uid: 'u1',
      settings: { enabled: true, allowCellular: false, noticeShown: true },
    });
    expect(mockSaveUser).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('"Turn off" in the notice turns backup off for the account', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<RecordingBackupController />);
    await flush();
    act(() => mockStatusListener?.({ phase: 'needs-notice', pending: 1 }));
    const buttons = (alert.mock.calls[0] as any)[2];
    await act(async () => buttons.find((b: any) => b.text === 'Turn off').onPress());
    expect(mockSaveUser).toHaveBeenCalledWith({ id: 'u1', recordingBackup: false });
    expect(await AsyncStorage.getItem(backupNoticeKey('u1'))).toBe('true');
    alert.mockRestore();
  });

  it('waits for the account’s own settings (during sign-up the user is a placeholder with another id)', async () => {
    mockUser = { id: 'placeholder-123' };
    render(<RecordingBackupController />);
    await flush();
    expect(mockConfigure).toHaveBeenLastCalledWith(null);
    expect(mockConfigure).not.toHaveBeenCalledWith(expect.objectContaining({ uid: 'placeholder-123' }));
  });

  it('the notice says which networks uploads use', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUser = { id: 'u1', recordingBackupCellular: true };
    render(<RecordingBackupController />);
    await flush();
    act(() => mockStatusListener?.({ phase: 'needs-notice', pending: 1 }));
    expect(alert.mock.calls[0][1]).toContain('Wi-Fi or mobile data');
    expect(alert.mock.calls[0][1]).toContain('Settings → Activity → Back up recordings');
    alert.mockRestore();
  });

  it('an account that has seen the notice is not shown it again', async () => {
    await AsyncStorage.setItem(backupNoticeKey('u1'), 'true');
    render(<RecordingBackupController />);
    await flush();
    expect(mockConfigure).toHaveBeenLastCalledWith({
      uid: 'u1',
      settings: { enabled: true, allowCellular: false, noticeShown: true },
    });
  });
});
