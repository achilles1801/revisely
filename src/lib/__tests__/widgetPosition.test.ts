const mockPermission = jest.fn();
const mockLastKnown = jest.fn();
const mockRequest = jest.fn();
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: () => mockPermission(),
  getLastKnownPositionAsync: () => mockLastKnown(),
  requestForegroundPermissionsAsync: () => mockRequest(),
}));

import { lastKnownPosition } from '../widgets/position';

beforeEach(() => {
  mockPermission.mockReset();
  mockLastKnown.mockReset();
  mockRequest.mockReset();
});

describe('lastKnownPosition', () => {
  it('with location allowed: the last known position', async () => {
    mockPermission.mockResolvedValue({ granted: true });
    mockLastKnown.mockResolvedValue({ coords: { latitude: 43.65, longitude: -79.38, accuracy: 30 } });
    expect(await lastKnownPosition()).toEqual({ latitude: 43.65, longitude: -79.38 });
  });

  it('never asks: not allowed, no position and no prompt', async () => {
    mockPermission.mockResolvedValue({ granted: false });
    expect(await lastKnownPosition()).toBeNull();
    expect(mockLastKnown).not.toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('none cached, or an error: none', async () => {
    mockPermission.mockResolvedValue({ granted: true });
    mockLastKnown.mockResolvedValue(null);
    expect(await lastKnownPosition()).toBeNull();
    mockLastKnown.mockRejectedValue(new Error('location services off'));
    expect(await lastKnownPosition()).toBeNull();
  });
});
