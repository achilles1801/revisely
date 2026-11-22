// Digits in the app's language. English keeps Western digits, written exactly as before. Arabic
// writes Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩, ٫ for decimals, ٬ for thousands, ٪), as the website and
// Quran.com's Arabic do. Majd's choice 1 (Nov 15) is still open: ARABIC_INDIC is that one switch.
//
// The digits are swapped here rather than left to Intl's numbering system, because Hermes builds
// Intl from the platform (NSFormatter on iOS, ICU on Android) and the two don't agree on it.

/** Arabic shows Arabic-Indic digits (true) or Western ones (false). Majd's choice 1. */
export const ARABIC_INDIC = true;

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function usesArabicIndic(language: string): boolean {
  return ARABIC_INDIC && language.toLowerCase().split(/[-_]/)[0] === 'ar';
}

/**
 * Text that Intl (or the code) wrote with Western digits, in the language's digits: "١٢ نوفمبر".
 * English and other languages come back unchanged.
 */
export function localDigits(text: string, language: string): string {
  if (!usesArabicIndic(language)) return text;
  return text.replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

/**
 * A number in the language's digits: "١٢", "٢٠٫٥", "١٢٣٤". No thousands separator unless asked
 * (`useGrouping`): numbers here are counts, and a year or a print (1441) must never read "١٬٤٤١".
 */
export function localNumber(n: number, language: string, options: Intl.NumberFormatOptions = {}): string {
  if (!usesArabicIndic(language)) return n.toLocaleString(language, options);
  // i18n-ignore (Western digits, swapped for Arabic-Indic on the next line)
  const western = n.toLocaleString('en-US', { useGrouping: false, ...options });
  return localDigits(western.replace(/,/g, '٬').replace(/\./g, '٫').replace(/%/g, '٪'), language);
}

/** A number already written with Western digits ("0.4", from toFixed) in the language's digits: "٠٫٤". */
export function localNumeral(text: string, language: string): string {
  if (!usesArabicIndic(language)) return text;
  return localDigits(text.replace(/,/g, '٬').replace(/\./g, '٫'), language);
}

/**
 * Digits typed in any script as 0–9, for reading what the user typed: Arabic-Indic (٠–٩) and Persian (۰–۹). A number
 * field that keeps only 0–9 runs this first, or digits typed on an Arabic keyboard would vanish.
 */
export function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
