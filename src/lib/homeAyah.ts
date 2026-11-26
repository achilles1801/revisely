// One ayah a day at the foot of Home (BEHAVIOUR.md HOME-7; Home background "Glow and an ayah", the default, lib/homeBackground).
// A short list chosen for people who revise and memorize: the Qur'an itself and its remembrance ("And We have certainly
// made the Qur'an easy for remembrance"), patience, ease after hardship, du'a. Each a whole ayah, short enough for two or
// three lines. The Arabic is the app's own Qur'an text (src/data/quranWords.dat, the Uthmani script recitation checking
// uses; homeAyah.test checks every one against it); the English is Saheeh International, read from the phone's licensed
// copy (lib/saheeh) and shown only once it is there, never changed.
//
// Today's: the list in order, one a revision day, from 1 January 2026; the same all day, the next the day after.

// i18n-ignore-start (the Qur'an's own words)
export const HOME_AYAHS: readonly { sura: number; ayah: number; arabic: string }[] = [
  { sura: 54, ayah: 17, arabic: 'وَلَقَدْ يَسَّرْنَا ٱلْقُرْءَانَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍۢ' },
  { sura: 87, ayah: 6, arabic: 'سَنُقْرِئُكَ فَلَا تَنسَىٰٓ' },
  { sura: 13, ayah: 28, arabic: 'ٱلَّذِينَ ءَامَنُوا۟ وَتَطْمَئِنُّ قُلُوبُهُم بِذِكْرِ ٱللَّهِ أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ' },
  { sura: 94, ayah: 5, arabic: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا' },
  { sura: 20, ayah: 25, arabic: 'قَالَ رَبِّ ٱشْرَحْ لِى صَدْرِى' },
  { sura: 20, ayah: 26, arabic: 'وَيَسِّرْ لِىٓ أَمْرِى' },
  { sura: 15, ayah: 9, arabic: 'إِنَّا نَحْنُ نَزَّلْنَا ٱلذِّكْرَ وَإِنَّا لَهُۥ لَحَـٰفِظُونَ' },
  { sura: 2, ayah: 152, arabic: 'فَٱذْكُرُونِىٓ أَذْكُرْكُمْ وَٱشْكُرُوا۟ لِى وَلَا تَكْفُرُونِ' },
  { sura: 93, ayah: 3, arabic: 'مَا وَدَّعَكَ رَبُّكَ وَمَا قَلَىٰ' },
  { sura: 73, ayah: 4, arabic: 'أَوْ زِدْ عَلَيْهِ وَرَتِّلِ ٱلْقُرْءَانَ تَرْتِيلًا' },
  { sura: 2, ayah: 153, arabic: 'يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ إِنَّ ٱللَّهَ مَعَ ٱلصَّـٰبِرِينَ' },
  { sura: 55, ayah: 13, arabic: 'فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ' },
  { sura: 75, ayah: 17, arabic: 'إِنَّ عَلَيْنَا جَمْعَهُۥ وَقُرْءَانَهُۥ' },
  { sura: 3, ayah: 139, arabic: 'وَلَا تَهِنُوا۟ وَلَا تَحْزَنُوا۟ وَأَنتُمُ ٱلْأَعْلَوْنَ إِن كُنتُم مُّؤْمِنِينَ' },
  { sura: 47, ayah: 24, arabic: 'أَفَلَا يَتَدَبَّرُونَ ٱلْقُرْءَانَ أَمْ عَلَىٰ قُلُوبٍ أَقْفَالُهَآ' },
  { sura: 94, ayah: 6, arabic: 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًۭا' },
  { sura: 33, ayah: 41, arabic: 'يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱذْكُرُوا۟ ٱللَّهَ ذِكْرًۭا كَثِيرًۭا' },
  { sura: 96, ayah: 1, arabic: 'ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِى خَلَقَ' },
  { sura: 93, ayah: 5, arabic: 'وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰٓ' },
  { sura: 38, ayah: 29, arabic: 'كِتَـٰبٌ أَنزَلْنَـٰهُ إِلَيْكَ مُبَـٰرَكٌۭ لِّيَدَّبَّرُوٓا۟ ءَايَـٰتِهِۦ وَلِيَتَذَكَّرَ أُو۟لُوا۟ ٱلْأَلْبَـٰبِ' },
  { sura: 1, ayah: 5, arabic: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ' },
  { sura: 16, ayah: 128, arabic: 'إِنَّ ٱللَّهَ مَعَ ٱلَّذِينَ ٱتَّقَوا۟ وَّٱلَّذِينَ هُم مُّحْسِنُونَ' },
  { sura: 7, ayah: 204, arabic: 'وَإِذَا قُرِئَ ٱلْقُرْءَانُ فَٱسْتَمِعُوا۟ لَهُۥ وَأَنصِتُوا۟ لَعَلَّكُمْ تُرْحَمُونَ' },
  { sura: 20, ayah: 2, arabic: 'مَآ أَنزَلْنَا عَلَيْكَ ٱلْقُرْءَانَ لِتَشْقَىٰٓ' },
  { sura: 2, ayah: 45, arabic: 'وَٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى ٱلْخَـٰشِعِينَ' },
  { sura: 94, ayah: 4, arabic: 'وَرَفَعْنَا لَكَ ذِكْرَكَ' },
  { sura: 29, ayah: 69, arabic: 'وَٱلَّذِينَ جَـٰهَدُوا۟ فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا وَإِنَّ ٱللَّهَ لَمَعَ ٱلْمُحْسِنِينَ' },
  { sura: 3, ayah: 8, arabic: 'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً إِنَّكَ أَنتَ ٱلْوَهَّابُ' },
  { sura: 50, ayah: 16, arabic: 'وَلَقَدْ خَلَقْنَا ٱلْإِنسَـٰنَ وَنَعْلَمُ مَا تُوَسْوِسُ بِهِۦ نَفْسُهُۥ وَنَحْنُ أَقْرَبُ إِلَيْهِ مِنْ حَبْلِ ٱلْوَرِيدِ' },
  { sura: 2, ayah: 201, arabic: 'وَمِنْهُم مَّن يَقُولُ رَبَّنَآ ءَاتِنَا فِى ٱلدُّنْيَا حَسَنَةًۭ وَفِى ٱلْـَٔاخِرَةِ حَسَنَةًۭ وَقِنَا عَذَابَ ٱلنَّارِ' },
];
// i18n-ignore-end

const EPOCH = Date.UTC(2026, 0, 1);
const DAY = 24 * 60 * 60 * 1000;

/** Today's ayah, for a revision day ("2026-11-26"). */
export function ayahForDay(day: string): (typeof HOME_AYAHS)[number] {
  const [y, m, d] = day.split('-').map(Number);
  const n = Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
  const i = ((n % HOME_AYAHS.length) + HOME_AYAHS.length) % HOME_AYAHS.length;
  return HOME_AYAHS[i];
}
