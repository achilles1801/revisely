// The account's picture kept on the phone (HOME-8): Home's first frame draws it before Auth has the account, a new
// photo replaces the old only once it is on the phone, and a photo removed elsewhere goes.
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(dir: { uri: string }, name: string) {
      this.uri = `${dir.uri}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: 'file:///docs' } };
});
const mockDownload = jest.fn();
jest.mock('expo-file-system/legacy', () => ({ downloadAsync: (url: string, to: string) => mockDownload(url, to) }));

import React from 'react';
import { act, render } from '@testing-library/react-native';
import { resetPhotoOnPhoneForTests, usePhotoOnPhone } from '../photoOnPhone';

let seen: (string | null | undefined)[] = [];
function Probe({ uid, live }: { uid: string; live: string | null | undefined }) {
  seen.push(usePhotoOnPhone(uid, live));
  return null;
}
const last = () => seen[seen.length - 1];
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  seen = [];
  mockFiles.clear();
  mockDownload.mockReset();
});

it('[HOME-8] before Auth has the account, the photo kept on the phone is drawn on the first render', () => {
  mockFiles.add('file:///docs/account-photo/u1-a.img');
  resetPhotoOnPhoneForTests({ u1: { url: 'https://p/1.jpg', name: 'u1-a.img' } });
  render(<Probe uid="u1" live={undefined} />);
  expect(seen[0]).toBe('file:///docs/account-photo/u1-a.img');
  expect(mockDownload).not.toHaveBeenCalled();
});

it('[HOME-8] a kept link with no copy yet is still drawn at once; another account’s photo never is', () => {
  resetPhotoOnPhoneForTests({ u1: { url: 'https://p/1.jpg', name: null } });
  render(<Probe uid="u1" live={undefined} />);
  expect(seen[0]).toBe('https://p/1.jpg');
  seen = [];
  render(<Probe uid="u2" live={undefined} />);
  expect(seen[0]).toBeNull();
});

it('[HOME-8] a new photo from the account replaces the old one only once it is on the phone', async () => {
  mockFiles.add('file:///docs/account-photo/u1-a.img');
  resetPhotoOnPhoneForTests({ u1: { url: 'https://p/1.jpg', name: 'u1-a.img' } });
  let finish: (v: { status: number }) => void = () => undefined;
  mockDownload.mockImplementation((_url: string, to: string) => new Promise((r) => (finish = (v) => {
    mockFiles.add(to);
    r(v);
  })));
  const view = render(<Probe uid="u1" live={undefined} />);
  view.rerender(<Probe uid="u1" live="https://p/2.jpg" />);
  await flush();
  // Downloading: the old copy stays.
  expect(last()).toBe('file:///docs/account-photo/u1-a.img');
  expect(mockDownload).toHaveBeenCalledWith('https://p/2.jpg', expect.stringMatching(/^file:\/\/\/docs\/account-photo\/u1-/));
  await act(async () => finish({ status: 200 }));
  await flush();
  expect(last()).toMatch(/^file:\/\/\/docs\/account-photo\/u1-(?!a\.img)/);
  // The old copy is gone from the phone.
  expect(mockFiles.has('file:///docs/account-photo/u1-a.img')).toBe(false);
});

it('[HOME-8] a photo removed elsewhere goes once Auth says so', async () => {
  mockFiles.add('file:///docs/account-photo/u1-a.img');
  resetPhotoOnPhoneForTests({ u1: { url: 'https://p/1.jpg', name: 'u1-a.img' } });
  const view = render(<Probe uid="u1" live={undefined} />);
  view.rerender(<Probe uid="u1" live={null} />);
  await flush();
  expect(last()).toBeNull();
  expect(mockFiles.size).toBe(0);
});
