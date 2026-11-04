import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetMushafEditionForTests,
  getMushafEdition,
  isMushafEditionId,
  loadMushafEdition,
  MUSHAF_EDITION_KEY,
  MUSHAF_EDITIONS,
  mushafEdition,
  onMushafEdition,
  setMushafEdition,
} from '../mushafEdition';

beforeEach(async () => {
  __resetMushafEditionForTests();
  await AsyncStorage.clear();
});

describe('mushafEdition', () => {
  it('starts on the 1405 pages', () => {
    expect(getMushafEdition()).toBe('madani1405');
    expect(mushafEdition().folder).toBe('');
    expect(mushafEdition().aspect).toBeCloseTo(2600 / 4206);
  });

  it('keeps a choice on the phone and reads it back at launch', async () => {
    await setMushafEdition('madani1441');
    expect(await AsyncStorage.getItem(MUSHAF_EDITION_KEY)).toBe('madani1441');
    __resetMushafEditionForTests();
    expect(getMushafEdition()).toBe('madani1405');
    await loadMushafEdition();
    expect(getMushafEdition()).toBe('madani1441');
  });

  it('ignores a stored value it does not know', async () => {
    await AsyncStorage.setItem(MUSHAF_EDITION_KEY, 'warsh');
    await loadMushafEdition();
    expect(getMushafEdition()).toBe('madani1405');
    expect(isMushafEditionId('warsh')).toBe(false);
    expect(isMushafEditionId('madani1441')).toBe(true);
  });

  it('tells listeners about a change, once', async () => {
    const heard: string[] = [];
    onMushafEdition((id) => heard.push(id));
    await setMushafEdition('madani1441');
    await setMushafEdition('madani1441');
    await setMushafEdition('madani1405');
    expect(heard).toEqual(['madani1441', 'madani1405']);
  });

  it('a choice made while the stored one loads wins', async () => {
    await AsyncStorage.setItem(MUSHAF_EDITION_KEY, 'madani1405');
    const loading = loadMushafEdition();
    await setMushafEdition('madani1441');
    await loading;
    expect(getMushafEdition()).toBe('madani1441');
  });

  it('the 1441 print has its own folder, its own page shape and a credit to the Complex', () => {
    const e = MUSHAF_EDITIONS.madani1441;
    expect(e.folder).toBe('1441');
    expect(e.aspect).toBeCloseTo(254.4 / 410.4);
    expect(e.credit).toMatch(/King Fahd/);
    expect(e.reciteData).toBe(false);
  });
});
