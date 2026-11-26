// Arabic for src/i18n/en/ramadan.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const ramadan: NonNullable<ArStrings['ramadan']> = {
  hijri: {
    ramadan: '{{day}} رمضان',
    shawwal: '{{day}} شوال',
  },
  test: {
    real: 'التواريخ الحقيقية',
    before_zero: '{{count}} يوم قبل رمضان',
    before_one: 'يوم واحد قبل رمضان',
    before_two: 'يومان قبل رمضان',
    before_few: '{{count}} أيام قبل رمضان',
    before_many: '{{count}} يومًا قبل رمضان',
    before_other: '{{count}} يوم قبل رمضان',
    day: 'اليوم {{day}} من رمضان',
    eid: 'العيد',
    after: 'بعد العيد',
  },
};
