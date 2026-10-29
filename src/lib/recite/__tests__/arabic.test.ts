import { editDistance, normalizeText, normalizeWord, similarity, soundAlike } from '../arabic';

describe('normalizeWord', () => {
  it('drops diacritics and Qur’anic signs', () => {
    expect(normalizeWord('بِسْمِ')).toBe('بسم');
    expect(normalizeWord('رَيْبَ ۛ')).toBe('ريب');
    expect(normalizeWord('هُدًۭى')).toBe('هدي');
  });

  it('writes one form of alef, ya, ta marbuta and hamza carriers', () => {
    expect(normalizeWord('ٱللَّهِ')).toBe(normalizeWord('الله'));
    expect(normalizeWord('أُنزِلَ')).toBe('انزل');
    expect(normalizeWord('إِلَيْكَ')).toBe('اليك');
    expect(normalizeWord('عَلَىٰ')).toBe(normalizeWord('على'));
    expect(normalizeWord('ٱلصَّلَاةَ')).toBe('الصلاه');
    expect(normalizeWord('يُؤْمِنُونَ')).toBe('يومنون');
  });

  it('writes the Uthmani superscript alef as a full alef', () => {
    expect(normalizeWord('ذَٰلِكَ')).toBe('ذالك');
    expect(normalizeWord('ٱلْكِتَـٰبُ')).toBe('الكتاب');
  });

  it('keeps letters that tell words apart', () => {
    expect(normalizeWord('يعملون')).not.toBe(normalizeWord('تعملون'));
    expect(normalizeWord('فقال')).not.toBe(normalizeWord('وقال'));
  });
});

describe('normalizeText', () => {
  it('splits on spaces and punctuation and drops non-Arabic', () => {
    expect(normalizeText('بسم الله، الرحمن الرحيم. 1')).toEqual(['بسم', 'الله', 'الرحمن', 'الرحيم']);
    expect(normalizeText('  ')).toEqual([]);
  });
});

describe('similarity', () => {
  it('measures letters in common', () => {
    expect(editDistance('كتاب', 'كتب')).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBeGreaterThan(1);
    expect(similarity('الله', 'الله')).toBe(1);
    expect(similarity('يعملون', 'تعملون')).toBeCloseTo(5 / 6);
    expect(similarity('', '')).toBe(1);
  });
});

describe('soundAlike', () => {
  it('reads a final ى as the long ā it sounds like', () => {
    expect(soundAlike('السُّفَهَى')).toBe(normalizeWord('السفهاء'));
    expect(soundAlike('هُدَى')).toBe('هدا');
  });

  it('has nothing else for other words', () => {
    expect(soundAlike('السُّفَهَاءُ')).toBeNull();
    expect(soundAlike('فِي')).toBeNull();
    expect(soundAlike('لى')).toBeNull(); // too short to tell
  });
});
