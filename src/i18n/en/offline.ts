// components/offline: the first launch without a connection, and Home's offline note.
export const offline = {
  setUp: {
    title: 'Connect to the internet to set up',
    body: 'Revisely needs a connection once to load your account on this phone. After that it works offline.',
  },
  note: {
    short: 'Offline',
    waiting: 'Offline · changes saved on this phone',
    label: "Offline. Showing what's saved on this phone.",
    waitingLabel: "Offline. Your changes are saved on this phone and sync when you're back online.",
  },
} as const;
