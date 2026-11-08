// The languages of the translations the app offers (QuranEnc's ISO codes): the English name the
// picker sorts and searches by, and the language's own name, in its own script, shown beside it.

export interface LanguageName {
  /** English name ("Urdu"). */
  name: string;
  /** Its own name, in its own script ("اردو"); the same as `name` where that is how it's written. */
  native: string;
}

export const LANGUAGES: Record<string, LanguageName> = {
  aa: { name: 'Afar', native: 'Qafaraf' },
  ak: { name: 'Akan', native: 'Akan' },
  am: { name: 'Amharic', native: 'አማርኛ' },
  as: { name: 'Assamese', native: 'অসমীয়া' },
  az: { name: 'Azerbaijani', native: 'Azərbaycanca' },
  bs: { name: 'Bosnian', native: 'Bosanski' },
  ceb: { name: 'Bisaya', native: 'Binisaya' },
  de: { name: 'German', native: 'Deutsch' },
  en: { name: 'English', native: 'English' },
  es: { name: 'Spanish', native: 'Español' },
  fa: { name: 'Persian', native: 'فارسی' },
  ff: { name: 'Fulani', native: 'Fulfulde' },
  fr: { name: 'French', native: 'Français' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી' },
  ha: { name: 'Hausa', native: 'Hausa' },
  hi: { name: 'Hindi', native: 'हिन्दी' },
  hr: { name: 'Croatian', native: 'Hrvatski' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia' },
  ja: { name: 'Japanese', native: '日本語' },
  km: { name: 'Khmer', native: 'ខ្មែរ' },
  kn: { name: 'Kannada', native: 'ಕನ್ನಡ' },
  ku: { name: 'Kurdish', native: 'کوردی' },
  ky: { name: 'Kyrgyz', native: 'Кыргызча' },
  ln: { name: 'Lingala', native: 'Lingála' },
  lt: { name: 'Lithuanian', native: 'Lietuvių' },
  mdh: { name: 'Maguindanao', native: 'Maguindanaon' },
  mk: { name: 'Macedonian', native: 'Македонски' },
  ml: { name: 'Malayalam', native: 'മലയാളം' },
  mos: { name: 'Mooré', native: 'Mooré' },
  nl: { name: 'Dutch', native: 'Nederlands' },
  nqo: { name: "N'Ko", native: 'ߒߞߏ' },
  om: { name: 'Oromo', native: 'Afaan Oromoo' },
  pa: { name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ps: { name: 'Pashto', native: 'پښتو' },
  pt: { name: 'Portuguese', native: 'Português' },
  rn: { name: 'Kirundi', native: 'Ikirundi' },
  ro: { name: 'Romanian', native: 'Română' },
  rw: { name: 'Kinyarwanda', native: 'Kinyarwanda' },
  si: { name: 'Sinhala', native: 'සිංහල' },
  so: { name: 'Somali', native: 'Soomaali' },
  sq: { name: 'Albanian', native: 'Shqip' },
  sr: { name: 'Serbian', native: 'Српски' },
  sv: { name: 'Swedish', native: 'Svenska' },
  sw: { name: 'Swahili', native: 'Kiswahili' },
  ta: { name: 'Tamil', native: 'தமிழ்' },
  te: { name: 'Telugu', native: 'తెలుగు' },
  tg: { name: 'Tajik', native: 'Тоҷикӣ' },
  th: { name: 'Thai', native: 'ไทย' },
  tl: { name: 'Tagalog', native: 'Tagalog' },
  tr: { name: 'Turkish', native: 'Türkçe' },
  ug: { name: 'Uyghur', native: 'ئۇيغۇرچە' },
  ur: { name: 'Urdu', native: 'اردو' },
  uz: { name: 'Uzbek', native: 'Ўзбекча' },
  vi: { name: 'Vietnamese', native: 'Tiếng Việt' },
  yo: { name: 'Yoruba', native: 'Yorùbá' },
  zh: { name: 'Chinese', native: '中文' },
};

/** A language's names; an unknown code is shown as the code itself. */
export function languageName(code: string): LanguageName {
  return LANGUAGES[code] ?? { name: code, native: code };
}
