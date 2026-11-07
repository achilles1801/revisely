/**
 * Where each surah and juz begins and ends in the Madani mushaf (pages 1–604), as the app's
 * src/lib/quranData has them; both prints the app offers start every surah and juz on the same
 * page. The server checks an attached surah or juz against these, and knows its pages without
 * the app sending them.
 */

const SURAH_FIRST = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385,
  396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531,
  534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587,
  587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603,
  603, 603, 604, 604, 604,
];

const SURAH_LAST = [
  1, 49, 76, 106, 127, 150, 176, 186, 207, 221, 235, 248, 255, 261, 267, 281, 293, 304, 312, 321, 331, 341, 349, 359, 366, 376, 385, 396,
  404, 410, 414, 417, 427, 434, 440, 445, 452, 458, 467, 476, 482, 489, 495, 498, 502, 506, 510, 515, 517, 520, 523, 525, 528, 531, 534,
  537, 541, 545, 548, 551, 552, 554, 555, 557, 559, 561, 564, 566, 568, 570, 571, 573, 575, 577, 578, 580, 581, 583, 584, 585, 586, 587,
  589, 589, 590, 591, 591, 592, 594, 594, 595, 596, 596, 596, 597, 597, 598, 599, 599, 600, 600, 600, 601, 601, 601, 602, 602, 602, 603,
  603, 603, 604, 604, 604,
];

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, i) => first + i);

/** A surah's pages (1–114), a page it shares with its neighbours included. */
export function surahPages(surah: number): number[] {
  return range(SURAH_FIRST[surah - 1], SURAH_LAST[surah - 1]);
}

/** A juz's pages (1–30): juz 1 is pages 1–21, juz 30 pages 582–604, each other twenty. */
export function juzPages(juz: number): number[] {
  return range(juz === 1 ? 1 : 20 * (juz - 1) + 2, juz === 30 ? 604 : 20 * juz + 1);
}
