#!/usr/bin/env python3
"""The recording script for revisely.app/record: what each volunteer recites, and the truth for each item.

Writes docs/record/items.json, which the page reads. The words come from the app's own word list
(src/data/quranWords.dat), so word numbers match what the recite engine uses. Every planted change
names the word it touches, and the build stops if that word isn't where the item says.

The truth fields are for scoring (the recite-eval bench): `kind` says what the item contains.
Items that are not mistakes (`correct`, `back`, `pause`, `repeat`, `madd_setting`) must not be flagged.

  python3 scripts/record/items.py
"""
import json
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / 'docs/record/items.json'

SURA_LENGTHS = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
                112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89,
                59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30,
                52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15,
                21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]


class Quran:
    def __init__(self):
        d = json.loads((REPO / 'src/data/quranWords.dat').read_text(encoding='utf8'))
        self.uthmani = d['uthmani']
        self.imlaei = d['imlaei']
        self.index = {}
        v = 0
        for s, n in enumerate(SURA_LENGTHS, 1):
            for a in range(1, n + 1):
                self.index[(s, a)] = v
                v += 1
        assert v == 6236

    def words(self, s, a):
        return self.uthmani[self.index[(s, a)]].split(' ')

    def plain(self, s, a):
        return self.imlaei[self.index[(s, a)]].split(' ')


def surah_names():
    """Names as the app writes them (src/lib/quranData.ts, nameDisplay)."""
    text = (REPO / 'src/lib/quranData.ts').read_text(encoding='utf8')
    names = {}
    for m in re.finditer(r"^\s*(\d+): \{ nameDisplay: (['\"])(.*?)\2, nameArabicVoweled: '([^']*)'", text, re.M):
        names[int(m.group(1))] = (m.group(3), m.group(4))
    assert len(names) == 114, len(names)
    return names


Q = Quran()
NAMES = surah_names()

GROUPS = [
    {'id': 'normal', 'part': 1, 'title': 'Recite as you normally do',
     'note': 'From memory if you know it. If not, tap Show text and read it.'},
    {'id': 'natural', 'part': 1, 'title': 'Natural slips',
     'note': 'Things people do all the time that are not mistakes. The checker must not flag them.'},
    {'id': 'word', 'part': 1, 'title': 'Word mistakes, on purpose',
     'note': 'Make exactly the mistake described, and recite the rest correctly.'},
    {'id': 'letter', 'part': 2, 'title': 'Letter and haraka mistakes, on purpose',
     'note': 'Make exactly the mistake described, and recite the rest correctly.'},
    {'id': 'tajweed', 'part': 2, 'title': 'Tajweed, on purpose',
     'note': 'Make exactly the change described, and recite the rest with your usual tajweed.'},
    {'id': 'place', 'part': 2, 'title': 'Other places',
     'note': 'Your normal recitation, somewhere less quiet.'},
]
PARTS = [
    {'n': 1, 'title': 'Part 1', 'minutes': 20},
    {'n': 2, 'title': 'Part 2', 'minutes': 15, 'note': 'If you have time. It helps a lot.'},
]

ITEMS = []


def ayat(s, a1, a2=None):
    return [(s, a) for a in range(a1, (a2 or a1) + 1)]


def word(s, a, i, expect):
    """A word position, checked against the plain (imlaei) text."""
    got = Q.plain(s, a)[i]
    assert got == expect, f'{s}:{a} word {i} is {got!r}, not {expect!r}'
    return {'s': s, 'a': a, 'w': i}


def item(id, group, title, note, passage, truth, say=None, marks=(), show=None, istiadha=False, then=None):
    g = next(x for x in GROUPS if x['id'] == group)
    out = {
        'id': id,
        'part': g['part'],
        'group': group,
        'title': title,
        'note': note,
        'ayat': [{'s': s, 'a': a, 'words': Q.words(s, a)} for s, a in passage],
        'marks': list(marks),
        # mistakes show the text, so the place is clear; normal recitation starts hidden
        'show': show if show is not None else group not in ('normal', 'natural', 'place'),
        'truth': truth,
    }
    if say:
        out['say'] = say
    if istiadha:
        out['istiadha'] = True
    if then:
        out['then'] = [{'s': s, 'a': a, 'words': Q.words(s, a)} for s, a in then]
    ITEMS.append(out)


ISTIADHA = 'أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَـٰنِ ٱلرَّجِيمِ'

# Part 1: recite as you normally do
item('n1', 'normal', 'Al-Fātiḥah',
     f'Start with {ISTIADHA} as you normally would, then the whole surah.',
     ayat(1, 1, 7), {'kind': 'correct'}, istiadha=True)
item('n2', 'normal', 'Al-Baqarah 1–5', 'The first five ayat.', ayat(2, 1, 5), {'kind': 'correct'})
item('n3', 'normal', 'Āyat al-Kursī', 'Al-Baqarah 255, just this one ayah.', ayat(2, 255), {'kind': 'correct'})
item('n4', 'normal', 'Al-Baqarah 285–286', 'The last two ayat of Al-Baqarah.', ayat(2, 285, 286),
     {'kind': 'correct'})
item('n5', 'normal', 'Al-Mulk 1–10',
     f'Start with {ISTIADHA} and the basmala, as you normally would.', ayat(67, 1, 10), {'kind': 'correct'},
     istiadha=True)
item('n6', 'normal', 'Al-Ikhlāṣ, Al-Falaq and An-Nās', 'One after the other, each with its basmala.',
     ayat(112, 1, 4) + ayat(113, 1, 5) + ayat(114, 1, 6), {'kind': 'correct'})
item('n7', 'normal', 'Maryam 1–4', 'It starts with the letters كٓهيعٓصٓ: read them as you normally would.',
     ayat(19, 1, 4), {'kind': 'correct'})
ITEMS.append({
    'id': 'n8', 'part': 1, 'group': 'normal', 'title': 'A passage of your choice',
    'note': 'Something you know well, a minute or two. Choose the surah and ayat, then recite them from memory.',
    'choose': True, 'ayat': [], 'marks': [], 'show': False, 'truth': {'kind': 'correct'},
})

# Part 1: natural slips (not mistakes)
item('r1', 'natural', 'Al-Mulk 1–5, losing your place',
     'In ayah 3, stop in the middle, go back three or four words and carry on, as people do when they lose '
     'their place. Do it once more in ayah 5.', ayat(67, 1, 5), {'kind': 'back', 'where': [3, 5]})
item('r2', 'natural', 'Āyat al-Kursī with a pause',
     'Somewhere in the middle, stop for about five seconds, then carry on. Clear your throat once, anywhere.',
     ayat(2, 255), {'kind': 'pause'})
item('r3', 'natural', 'Al-Fātiḥah, repeating an ayah',
     'Say ayah 4 twice, as you might when revising, then carry on to the end.', ayat(1, 1, 7),
     {'kind': 'repeat', 'ayah': 4})

# Part 1: word mistakes
item('w1', 'word', 'Al-Fātiḥah, leaving out a word',
     'In ayah 5, leave out the second word إِيَّاكَ, so you say:', ayat(1, 1, 7),
     {'kind': 'del', 'at': [word(1, 5, 2, 'وإياك')]},
     say='إِيَّاكَ نَعْبُدُ نَسْتَعِينُ', marks=[word(1, 5, 2, 'وإياك')])
item('w2', 'word', 'Al-Mulk 1–4, skipping an ayah',
     'Leave out ayah 3: go straight from the end of ayah 2 to ayah 4.', ayat(67, 1, 4),
     {'kind': 'skip_ayah', 'ayah': [67, 3]},
     marks=[{'s': 67, 'a': 3, 'w': i} for i in range(len(Q.words(67, 3)))])
item('w3', 'word', 'Al-Baqarah 48, with the wording of ayah 123',
     'Ayat 48 and 123 are nearly the same. Recite ayah 48, but in the middle say the wording of ayah 123:',
     ayat(2, 48),
     {'kind': 'sub', 'at': [word(2, 48, i, w) for i, w in [(11, 'شفاعة'), (12, 'ولا'), (13, 'يؤخذ'),
                                                            (14, 'منها'), (15, 'عدل')]],
      'said': 'عدل ولا تنفعها شفاعة', 'from': [2, 123]},
     say='وَلَا يُقْبَلُ مِنْهَا عَدْلٌ وَلَا تَنفَعُهَا شَفَـٰعَةٌ',
     marks=[word(2, 48, i, w) for i, w in [(11, 'شفاعة'), (12, 'ولا'), (13, 'يؤخذ'), (14, 'منها'), (15, 'عدل')]])
item('w4', 'word', 'Al-Falaq, mixing two endings',
     'In the last ayah, end it with the ending of ayah 3, so you say:', ayat(113, 1, 5),
     {'kind': 'sub', 'at': [word(113, 5, 4, 'حسد')], 'said': 'وقب'},
     say='وَمِن شَرِّ حَاسِدٍ إِذَا وَقَبَ', marks=[word(113, 5, 4, 'حسد')])
item('w5', 'word', 'Al-Mulk 1–2, adding a word',
     'At the end of ayah 2, add ٱلرَّحِيمُ, so it ends:', ayat(67, 1, 2),
     {'kind': 'ins', 'after': word(67, 2, 10, 'الغفور'), 'said': 'الرحيم'},
     say='وَهُوَ ٱلْعَزِيزُ ٱلْغَفُورُ ٱلرَّحِيمُ', marks=[word(67, 2, 10, 'الغفور')])
item('w6', 'word', 'Al-Baqarah 3–5, then the wrong surah',
     'Ayah 5 of Al-Baqarah is the same as ayah 5 of Luqmān. After it, carry on with Luqmān ayah 6 instead of '
     'Al-Baqarah ayah 6. The first half of it is enough. Skip this item if you don’t know Luqmān.',
     ayat(2, 3, 5), {'kind': 'jump', 'after': [2, 5], 'to': [31, 6]}, then=ayat(31, 6))

# Part 2: letters and harakat
item('l1', 'letter', 'Al-Fātiḥah 1–4, a wrong haraka',
     'In ayah 2, say ٱلْحَمْدَ with a fatḥa instead of the ḍamma:', ayat(1, 1, 4),
     {'kind': 'haraka', 'at': [word(1, 2, 0, 'الحمد')], 'said': 'ٱلْحَمْدَ'},
     say='ٱلْحَمْدَ لِلَّهِ', marks=[word(1, 2, 0, 'الحمد')])
item('l2', 'letter', 'Al-Ikhlāṣ, س for ص',
     'In ayah 2, say ٱلسَّمَدُ with a sīn (س) instead of the ṣād (ص):', ayat(112, 1, 4),
     {'kind': 'letter', 'at': [word(112, 2, 1, 'الصمد')], 'said': 'ٱلسَّمَدُ'},
     say='ٱللَّهُ ٱلسَّمَدُ', marks=[word(112, 2, 1, 'الصمد')])
item('l3', 'letter', 'Al-Fātiḥah 6–7, د for ض',
     'In the last word, say ٱلدَّآلِّينَ with a dāl (د) instead of the ḍād (ض):', ayat(1, 6, 7),
     {'kind': 'letter', 'at': [word(1, 7, 8, 'الضالين')], 'said': 'ٱلدَّآلِّينَ'},
     say='وَلَا ٱلدَّآلِّينَ', marks=[word(1, 7, 8, 'الضالين')])
item('l4', 'letter', 'Al-Fātiḥah 1–3, ه for ح',
     'In ayah 3 only, say ٱلرَّهِيمِ with a hā’ (ه) instead of the ḥā’ (ح):', ayat(1, 1, 3),
     {'kind': 'letter', 'at': [word(1, 3, 1, 'الرحيم')], 'said': 'ٱلرَّهِيمِ'},
     say='ٱلرَّحْمَـٰنِ ٱلرَّهِيمِ', marks=[word(1, 3, 1, 'الرحيم')])
item('l5', 'letter', 'Al-Fātiḥah 5, no shadda',
     'Say the first إِيَّاكَ without its shadda:', ayat(1, 5),
     {'kind': 'shadda', 'at': [word(1, 5, 0, 'إياك')], 'said': 'إِيَاكَ'},
     say='إِيَاكَ نَعْبُدُ', marks=[word(1, 5, 0, 'إياك')])
item('l6', 'letter', 'Al-Fātiḥah 5, أ for ع',
     'Say نَأْبُدُ with a hamza instead of the ʿayn:', ayat(1, 5),
     {'kind': 'letter', 'at': [word(1, 5, 1, 'نعبد')], 'said': 'نَأْبُدُ'},
     say='إِيَّاكَ نَأْبُدُ', marks=[word(1, 5, 1, 'نعبد')])
item('l7', 'letter', 'Al-Fātiḥah 6–7, ت for ط',
     'In ayah 6, say ٱلصِّرَاتَ with a tā’ (ت) instead of the ṭā’ (ط):', ayat(1, 6, 7),
     {'kind': 'letter', 'at': [word(1, 6, 1, 'الصراط')], 'said': 'ٱلصِّرَاتَ'},
     say='ٱهْدِنَا ٱلصِّرَاتَ ٱلْمُسْتَقِيمَ', marks=[word(1, 6, 1, 'الصراط')])
item('l8', 'letter', 'An-Nās 1–3, a long vowel cut short',
     'In ayah 1, leave out the long ā in ٱلنَّاسِ, so you say:', ayat(114, 1, 3),
     {'kind': 'vowel_length', 'at': [word(114, 1, 3, 'الناس')], 'said': 'ٱلنَّسِ'},
     say='قُلْ أَعُوذُ بِرَبِّ ٱلنَّسِ', marks=[word(114, 1, 3, 'الناس')])

# Part 2: tajweed
item('t1', 'tajweed', 'Al-Baqarah 4, separated madd at 2 counts',
     'Recite ayah 4 with the separated madd (بِمَآ أُنزِلَ and وَمَآ أُنزِلَ) at 2 counts.', ayat(2, 4),
     {'kind': 'madd_setting', 'munfasil': 2, 'at': [word(2, 4, 2, 'بما'), word(2, 4, 5, 'وما')]},
     marks=[word(2, 4, 2, 'بما'), word(2, 4, 5, 'وما')])
item('t2', 'tajweed', 'Al-Baqarah 4 again, at 4 counts',
     'The same ayah, with the separated madd at 4 counts.', ayat(2, 4),
     {'kind': 'madd_setting', 'munfasil': 4, 'at': [word(2, 4, 2, 'بما'), word(2, 4, 5, 'وما')]},
     marks=[word(2, 4, 2, 'بما'), word(2, 4, 5, 'وما')])
item('t3', 'tajweed', 'Al-Fātiḥah 6–7, a madd cut short',
     'Say ٱلضَّآلِّينَ with its long madd cut to 2 counts (it should be 6).', ayat(1, 6, 7),
     {'kind': 'madd', 'at': [word(1, 7, 8, 'الضالين')], 'expected': 6, 'said': 2},
     marks=[word(1, 7, 8, 'الضالين')])
item('t4', 'tajweed', 'An-Nās 4–6, no ghunnah',
     'In the last ayah, say ٱلْجِنَّةِ and ٱلنَّاسِ without the ghunnah: no nasal hold on the nūn.',
     ayat(114, 4, 6),
     {'kind': 'ghunnah', 'at': [word(114, 6, 1, 'الجنة'), word(114, 6, 2, 'والناس')]},
     marks=[word(114, 6, 1, 'الجنة'), word(114, 6, 2, 'والناس')])
item('t5', 'tajweed', 'Al-Baqarah 4, ikhfāʾ read clearly',
     'Say أُنزِلَ with a clear nūn both times, instead of hiding it (ikhfāʾ). Your usual madd.', ayat(2, 4),
     {'kind': 'ikhfa', 'at': [word(2, 4, 3, 'أنزل'), word(2, 4, 6, 'أنزل')]},
     marks=[word(2, 4, 3, 'أنزل'), word(2, 4, 6, 'أنزل')])
item('t6', 'tajweed', 'Al-Humazah 1–4, iqlāb missed',
     'In ayah 4, say لَيُنْبَذَنَّ with a clear nūn instead of turning it into a mīm sound (iqlāb).',
     ayat(104, 1, 4), {'kind': 'iqlab', 'at': [word(104, 4, 1, 'لينبذن')]}, marks=[word(104, 4, 1, 'لينبذن')])
item('t7', 'tajweed', 'Al-Ikhlāṣ, no qalqalah',
     'Stop on أَحَدْ and ٱلصَّمَدْ without the qalqalah bounce on the dāl.', ayat(112, 1, 4),
     {'kind': 'qalqalah', 'at': [word(112, 1, 3, 'أحد'), word(112, 2, 1, 'الصمد')]},
     marks=[word(112, 1, 3, 'أحد'), word(112, 2, 1, 'الصمد')])
item('t8', 'tajweed', 'Al-Baqarah 5, idghām missed',
     'Say مِّن رَّبِّهِمْ with a clear nūn (مِنْ رَبِّهِمْ) instead of merging it into the rā’.', ayat(2, 5),
     {'kind': 'idgham', 'at': [word(2, 5, 3, 'من'), word(2, 5, 4, 'ربهم')]},
     marks=[word(2, 5, 3, 'من'), word(2, 5, 4, 'ربهم')])

# Part 2: other places
item('x1', 'place', 'Al-Fātiḥah somewhere noisier',
     'With the TV on, people talking nearby, or in a parked car. Your normal recitation.', ayat(1, 1, 7),
     {'kind': 'correct', 'condition': 'noise'})
item('x2', 'place', 'Al-Mulk 1–5, phone further away',
     'Put the phone down on a table an arm’s length away or more. Your normal recitation.', ayat(67, 1, 5),
     {'kind': 'correct', 'condition': 'far'})


def main():
    ids = [x['id'] for x in ITEMS]
    assert len(ids) == len(set(ids))
    out = {
        'version': 1,
        'credit': 'Arabic text: Tanzil Project · tanzil.net',
        'parts': PARTS,
        'groups': GROUPS,
        'items': ITEMS,
        'surahs': [{'n': n, 'name': NAMES[n][0], 'arabic': NAMES[n][1], 'ayat': SURA_LENGTHS[n - 1]}
                   for n in range(1, 115)],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    for p in (1, 2):
        print(f'part {p}: {sum(1 for x in ITEMS if x["part"] == p)} items')
    print(f'{OUT.relative_to(REPO)}: {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
