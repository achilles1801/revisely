// components/qibla: the Qibla compass sheet.
export const qibla = {
  title: 'Qibla',
  /** "119° from north · 4,794 km to Makkah". */
  facts: '{{bearing}} from north · {{distance}} to Makkah',
  fromNorth: '{{bearing}} from north',
  toMakkah: '{{distance}} to Makkah',
  findingNorth: 'Finding north… · {{distance}} to Makkah',
  facing: 'Facing the Qibla',
  calibrate: { title: 'Calibrate your compass', body: 'Move your phone in a figure 8 a few times, away from metal and magnets.' },
  atKaaba: "You're at the Kaaba",
  permission: {
    title: 'Allow location to find the Qibla',
    body: 'Revisely works out the direction of Makkah from where you are. Your location stays on this phone.',
    allow: 'Allow location',
  },
  denied: { title: 'Location is off for Revisely', body: 'Turn it on in Settings to find the Qibla.' },
  locating: 'Finding where you are…',
  noLocation: { title: "Couldn't find where you are", body: 'Check that Location Services is on, then try again.' },
  straightAhead: 'Straight ahead',
  turnRight: 'Turn right {{n}}°',
  turnLeft: 'Turn left {{n}}°',
  /** A distance: "4,794 km" (the number already written). */
  km: '{{n}} km',
} as const;
