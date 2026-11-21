// The site dressed for Ramadan (Majd, Nov 21 2026: "think christmas time lights and ornaments and decorations etc
// except its for ramadan"), where RAMADAN_THEME is "1": dev.revisely.app only, until Majd says otherwise.
//
// What it adds to each page: the class `ramadan` on <body>, docs/assets/ramadan.css, and the decorations as markup
// (drawn on the server, so nothing moves in after the page has painted):
//   - a night-blue greeting strip above the header: "Ramadan Kareem" / "رمضان كريم", a crescent, two lanterns;
//   - a string of lights under the header's links and along the top of the footer;
//   - on wide screens, lanterns, stars and crescents hanging into the empty margins beside the content;
//   - in dark mode, a few stars behind the top of the page.
// Every rule in ramadan.css starts at body.ramadan, so the file changes nothing on a page without the class. The art is
// original (an SVG sprite below), aria-hidden and never takes a tap; motion (twinkling, a lantern's sway) stops under
// prefers-reduced-motion. Nothing is drawn over Qur'an text: the lights sit inside the header's own box, the hanging
// ornaments stay in the side margins and scroll away with the top of the page, and /record (ayat to recite) is left
// as it is.
//
// It has phases, switched by date in the visitor's browser (docs/assets/ramadan.js), so nothing needs a deploy on the
// day (Majd, Nov 21 2026: "right now until ramadan starts we show the ramadan theme but word it future tense ... and
// even show a countdown timer live on the page ... then when ramadan begins ... it automatically switches everything
// to present tense and the countdown goes away"):
//   before  "Ramadan is almost here": a live countdown to the first day (00:00 of RAMADAN_START in the visitor's time
//           zone, the day of the first fast) and building a Qur'an habit now, which leads to the app (/get/?c=ramadan);
//   during  "Ramadan Kareem", present tense, no countdown;
//   eid     "Eid Mubarak", for EID_DAYS days from RAMADAN_EID;
//   after   the theme takes itself off (and the worker stops adding it once the last time zone is past it).
// RAMADAN_START and RAMADAN_EID (YYYY-MM-DD) come from the worker's vars: both hang on the moon sighting, so correct
// them there once it's announced; the pages never hold a date. The worker renders the phase it sees (UTC) and the
// countdown's English, so the page paints right; ramadan.js puts in the visitor's own phase, numbers and language.
//
// The words are keys in docs/assets/strings.js (ramadan.*), English and Arabic, which site-i18n.js puts in.
//
// revisely.app serves its pages straight from the assets (wrangler.jsonc runs the worker only for /api and the account
// pages), so setting the var there would dress only those. For a Ramadan on revisely.app: run the pages through this
// once and commit them (as nav.ts's links were), or send the site's paths through the worker for the month. The shared
// notes' ramadan-theme.md has the options, and switching on by date. worker/__tests__/ramadanTheme.test.ts fails if
// wrangler.jsonc sets the var.

/** The class on <body> that turns the decorations on (ramadan.css). */
export const RAMADAN_ON = 'ramadan';

/** Pages left as they are: /record shows ayat to recite, and nothing festive goes near them. */
const UNDRESSED = /^\/record(\/|$)/;

/** Whether the page at this path is dressed. */
export function dressesPath(pathname: string): boolean {
  return !UNDRESSED.test(pathname);
}

// ---- The phases ----

export type RamadanPhase = 'before' | 'during' | 'eid' | 'after';
/** How long the Eid greeting stays before the theme goes. */
export const EID_DAYS = 3;
/** The first day of Ramadan and of Eid al-Fitr, YYYY-MM-DD (either may be missing). */
export interface RamadanDates {
  start?: string;
  eid?: string;
}

const DAY = 86_400_000;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const utcDay = (iso?: string) => {
  const m = ISO_DAY.exec(iso ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
};

/** The dates from the worker's vars; a malformed one is left out. */
export function ramadanDates(env: { RAMADAN_START?: string; RAMADAN_EID?: string }): RamadanDates {
  const out: RamadanDates = {};
  if (!Number.isNaN(utcDay(env.RAMADAN_START))) out.start = env.RAMADAN_START;
  if (!Number.isNaN(utcDay(env.RAMADAN_EID))) out.eid = env.RAMADAN_EID;
  return out;
}

/** The phase at `now` for a clock `offsetHours` ahead of UTC (ramadan.js does the same with the visitor's clock).
 *  With no start date it's Ramadan itself; with no Eid date, Ramadan never ends. */
export function ramadanPhase(now: number, dates: RamadanDates, offsetHours = 0): RamadanPhase {
  const t = now + offsetHours * 3_600_000;
  const start = utcDay(dates.start);
  const eid = utcDay(dates.eid);
  if (t < start) return 'before';
  if (Number.isNaN(eid) || t < eid) return 'during';
  return t < eid + EID_DAYS * DAY ? 'eid' : 'after';
}

/** Over everywhere: even 12 hours behind UTC (the last time zone), Eid's days have passed. */
export function ramadanOver(now: number, dates: RamadanDates): boolean {
  return ramadanPhase(now, dates, -12) === 'after';
}

/** The banner's English before Ramadan, as ramadan.js words it ("Ramadan in 79 days"). */
export function daysLeftEnglish(now: number, dates: RamadanDates): string {
  const n = Math.max(0, Math.floor((utcDay(dates.start) - now) / DAY));
  if (!(n > 0)) return 'Ramadan begins in';
  return n === 1 ? 'Ramadan in 1 day' : `Ramadan in ${n} days`;
}

/** "Expected around Monday, February 8, 2027 (the first fast), depending on the moon sighting." */
export function expectedEnglish(dates: RamadanDates): string {
  const start = utcDay(dates.start);
  if (Number.isNaN(start)) return '';
  const day = new Date(start).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return `Expected around ${day} (the first fast), depending on the moon sighting.`;
}

// ---- The art: one sprite, used by every lantern, star and crescent on the page. ----
// A fanous: ring, domed cap with cut-outs, a crown band, three glass panels under pointed arches with the flame's
// light inside, a lower band and a tapering base with a finial. The glass takes its colour from the lantern's
// --rm-glass / --rm-glass-side (gold, rose, jade in ramadan.css).
const GOLD = 'url(#rm-gold)';
const BAND = 'url(#rm-band)';
const SPRITE = `<svg class="rm-sprite" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="rm-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".5" stop-color="#e6ab45"/><stop offset="1" stop-color="#a86a1e"/></linearGradient>
    <linearGradient id="rm-band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c621c"/><stop offset=".42" stop-color="#ffe08c"/><stop offset="1" stop-color="#b9792a"/></linearGradient>
    <radialGradient id="rm-core" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#fffdf0"/><stop offset=".35" stop-color="#fff0b8" stop-opacity=".9"/><stop offset="1" stop-color="#ffc45a" stop-opacity="0"/></radialGradient>
    <radialGradient id="rm-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffc85e" stop-opacity=".5"/><stop offset=".55" stop-color="#ffb347" stop-opacity=".16"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
  </defs>
  <symbol id="rm-lantern" viewBox="0 0 60 124">
    <circle class="rm-halo" cx="30" cy="62" r="30" fill="url(#rm-halo)"/>
    <circle cx="30" cy="6" r="4" fill="none" stroke="${GOLD}" stroke-width="2.2"/>
    <path d="M27.4 9.6h5.2l1.2 5.6h-7.6z" fill="${GOLD}"/>
    <path d="M12.5 31.5C12.5 22 20.3 15 30 15s17.5 7 17.5 16.5z" fill="${GOLD}"/>
    <g fill="#6e4512" opacity=".6"><circle cx="21.5" cy="26.5" r="1.5"/><circle cx="30" cy="21.6" r="1.7"/><circle cx="38.5" cy="26.5" r="1.5"/><path d="M28.4 28.6h3.2l-1.6-3z"/></g>
    <rect x="10" y="31" width="40" height="6.2" rx="1.6" fill="${BAND}"/>
    <path d="M13.5 37h9v44h-9z" style="fill:var(--rm-glass-side,#f39a3b)"/>
    <path d="M37.5 37h9v44h-9z" style="fill:var(--rm-glass-side,#f39a3b)"/>
    <path d="M22.5 37h15v44h-15z" style="fill:var(--rm-glass,#ffc35a)"/>
    <ellipse class="rm-flame" cx="30" cy="61" rx="13" ry="19" fill="url(#rm-core)"/>
    <g fill="${GOLD}">
      <path d="M22.5 37h15v14.5c0-6-3.4-9.6-7.5-11.6-4.1 2-7.5 5.6-7.5 11.6z"/>
      <path d="M13.5 37h9v4.6c-4.4 1.6-7 5.4-7 11.4h-2z"/>
      <path d="M46.5 37h-9v4.6c4.4 1.6 7 5.4 7 11.4h2z"/>
      <rect x="11.6" y="37" width="3" height="44"/><rect x="21" y="37" width="3" height="44"/>
      <rect x="36" y="37" width="3" height="44"/><rect x="45.4" y="37" width="3" height="44"/>
    </g>
    <path d="M24 74h12M15 74h6M39 74h6" stroke="#8a5717" stroke-width="1" opacity=".55"/>
    <rect x="9" y="81" width="42" height="6.2" rx="1.6" fill="${BAND}"/>
    <path d="M12.5 87.2h35l-9.2 13.6H21.7z" fill="${GOLD}"/>
    <path d="M17.6 92.4h24.8" stroke="#8a5717" stroke-width="1" opacity=".5"/>
    <path d="M21.7 100.8h16.6l-5 7.2h-6.6z" fill="${GOLD}"/>
    <circle cx="30" cy="111.2" r="3.2" fill="${GOLD}"/>
    <path d="M30 114.4l-1.7 6.4h3.4z" fill="#b57a28"/>
  </symbol>
  <symbol id="rm-star" viewBox="0 0 24 24">
    <path d="M12 2.1l2.9 2.9H19v4.1l2.9 2.9-2.9 2.9V19h-4.1L12 21.9 9.1 19H5v-4.1L2.1 12 5 9.1V5h4.1z" fill="${GOLD}"/>
    <path d="M12 6.4l1.7 1.7h2.2v2.2l1.7 1.7-1.7 1.7v2.2h-2.2L12 17.6l-1.7-1.7H8.1v-2.2L6.4 12l1.7-1.7V8.1h2.2z" fill="#fff3c8" opacity=".55"/>
  </symbol>
  <symbol id="rm-kareem" viewBox="0 -870 4090 1410"><path d="M118-97Q96-107 105-134Q126-193 133-201Q137-206 140-208Q143-211 144-212Q159-225 203-211Q294-181 364-129Q389-110 378-77Q371-55 367-42Q362-29 361-26Q349 2 326 1Q277-5 231-3Q185-2 142 9Q87 23 72 39Q73 46 79 85Q84 124 96 195Q108 265 115 307Q121 348 122 361Q124 395 120 431Q116 466 107 503Q101 524 85 521Q70 518 73 472Q76 427 28 187Q13 106 32 38Q51-29 73-56Q94-81 118-97ZM549-282Q546-271 539-258Q531-246 520-231Q498-201 486-198Q458-189 449-220Q443-242 415-245Q355-251 218-171Q165-140 140-180Q130-199 140-211Q149-220 170-235Q190-251 221-270Q372-366 457-365Q497-365 528-341Q559-317 549-282ZM526 59Q532 51 543 54Q563 61 582 72Q601 83 617 97Q625 105 620 115L572 191Q564 202 554 193Q550 189 537 181Q523 172 501 159L468 213Q461 223 450 215Q445 211 427 200Q408 189 377 170Q366 164 374 153L422 81Q428 73 439 76Q469 86 495 105ZM933-165Q944-149 953-135Q962-122 969-108Q1009-29 962 92Q904 243 803 269Q779 274 740 265Q724 261 690 248Q655 235 600 212Q584 206 589 190Q593 175 610 177Q654 181 688 180Q722 179 744 173Q789 161 851 114Q912 68 929 29Q935 6 919-18Q905-40 890-51Q877-61 881-84L896-154Q905-194 933-165ZM1471-823 1458-752Q1454-736 1434-730Q1301-694 1171-649Q1040-605 911-552Q1126-337 1099-139Q1084-28 977-11Q953-8 934-46Q895-124 917-145Q927-153 943-150Q985-141 1041-168Q1051-211 973-307Q957-327 939-346Q921-366 899-388Q870-365 851-387Q828-413 814-428Q800-444 795-451Q785-464 790-486Q822-626 911-669Q1025-725 1159-770Q1293-816 1445-850Q1472-855 1472-828Q1472-827 1472-825Q1471-824 1471-823ZM2268-458Q2343-306 2321-120Q2318-97 2311-75Q2303-53 2289-33Q2225 64 2085 79Q1988 89 1931 35Q1875-19 1876-107Q1878-199 1934-281Q1946-298 1954-290Q1964-280 1954-264Q1900-169 1936-109Q1971-51 2078-52Q2211-54 2286-133Q2282-220 2202-354Q2190-374 2196-385L2233-469Q2247-501 2268-458ZM2059-614Q2065-622 2076-619Q2096-612 2115-601Q2133-590 2149-576Q2157-568 2152-558L2104-482Q2097-472 2086-480Q2076-488 2014-525Q2003-532 2010-542ZM2463-725Q2483-760 2488-718Q2509-532 2512-378Q2515-222 2518-189Q2522-111 2613-105Q2644-103 2648-75Q2649-70 2649-60Q2648-51 2646-38Q2642-14 2635 1Q2629 15 2613 15Q2472 15 2463-121Q2461-152 2459-205Q2457-258 2455-332Q2453-400 2445-472Q2436-544 2421-621Q2416-647 2426-662ZM2845 6Q2835 33 2830 57Q2824 85 2804 82Q2780 78 2794 29Q2799 10 2802 1Q2805-8 2805-9Q2779-17 2757-33Q2734-49 2715-72Q2660 15 2614 15Q2591 15 2582-12Q2564-70 2596-100Q2601-105 2613-105Q2671-105 2723-166Q2731-176 2740-174Q2750-172 2762-159Q2799-116 2868-109Q2897-151 2932-190Q2966-229 3006-263Q3086-333 3146-346Q3192-355 3235-325Q3278-295 3289-249Q3274-177 3242-125Q3263-118 3287-113Q3311-108 3336-105Q3357-104 3362-59Q3366-13 3356 2Q3348 14 3337 15Q3258 24 3138-36Q3015 37 2845 6ZM3209-192Q3132-245 3040-191Q2949-137 2919-103Q2984-106 3071-130Q3157-154 3209-192ZM2939-545Q2945-553 2956-550Q2976-543 2995-532Q3013-521 3029-507Q3037-499 3032-489L2984-413Q2977-403 2966-411Q2956-419 2894-456Q2883-463 2890-473ZM3568-333Q3642-331 3670-149Q3673-132 3664-121L3615-57Q3602-41 3580-45Q3499-65 3447-117Q3405 14 3335 15Q3315 15 3306-14Q3297-43 3297-67Q3297-91 3318-101Q3322-103 3327-104Q3331-105 3335-105Q3389-108 3425-161Q3430-169 3446-194Q3461-220 3485-263Q3524-333 3568-333ZM3496-220Q3531-186 3586-174Q3587-217 3557-231Q3527-245 3496-220ZM3961-295Q3963-304 3968-306Q3979-309 4000-283Q4016-264 4030-236Q4044-208 4054-170Q4101-2 3994 136Q3932 216 3842 240Q3809 249 3786 238Q3742 219 3708 204Q3673 188 3648 176Q3632 167 3637 156Q3643 144 3659 148Q3727 168 3767 158Q3810 147 3877 107Q3995 36 4020-31Q4021-33 4021-37Q4012-84 3936-163Q3929-170 3932-182Z"/></symbol>
  <symbol id="rm-eid" viewBox="20 -840 3360 1110"><path d="M470-804Q484-833 504-791Q514-771 526-754Q538-737 554-724Q575-707 558-685L534-653Q567-477 584-357Q600-238 599-175Q599-109 569-43Q550-1 430 10Q393 13 347 14Q300 15 244 14Q188 13 145 11Q101 8 70 3Q52 0 52-12Q51-38 50-64Q49-90 50-115Q50-134 67-129Q101-120 136-115Q170-110 206-109Q482-105 552-141Q554-161 464-648Q463-660 444-708Q434-732 445-754ZM289-580Q298-581 302-574Q307-566 304-560L283-507Q276-492 267-489Q242-483 232-471Q247-461 278-456Q309-451 318-445Q355-418 295-334Q271-302 249-296Q229-290 176-295Q151-297 131-301Q110-306 94-312Q79-318 79-328Q79-339 83-343Q88-348 104-349Q112-350 131-350Q149-350 177-351Q232-352 253-360L225-366Q212-369 202-375Q191-382 183-390Q167-408 171-428Q202-556 289-580ZM894-295Q896-304 901-306Q912-309 933-283Q949-264 963-236Q977-208 987-170Q1034-2 927 136Q865 216 775 240Q742 249 719 238Q675 219 641 204Q606 188 581 176Q565 167 570 156Q576 144 592 148Q660 168 700 158Q743 147 810 107Q928 36 953-31Q954-33 954-37Q945-84 869-163Q862-170 865-182ZM1135-725Q1155-760 1160-718Q1181-532 1184-378Q1187-222 1190-189Q1194-111 1285-105Q1316-103 1320-75Q1321-70 1321-60Q1320-51 1318-38Q1314-14 1307 1Q1301 15 1285 15Q1144 15 1135-121Q1133-152 1131-205Q1129-258 1127-332Q1125-400 1117-472Q1108-544 1093-621Q1088-647 1098-662ZM1467-145Q1498-107 1529-104Q1557-101 1561-84Q1564-72 1561-42Q1560-27 1557-16Q1553-6 1550 1Q1544 15 1529 15Q1473 15 1421-49Q1359 15 1285 15Q1264 15 1258-12L1249-53Q1246-69 1257-86Q1268-104 1285-105Q1404-114 1431-164Q1440-179 1450-179Q1465-179 1465-162Q1465-154 1466-150Q1467-146 1467-145ZM1390 108Q1396 100 1407 103Q1427 110 1446 121Q1464 132 1480 146Q1488 154 1483 164L1435 240Q1428 250 1417 242Q1407 234 1345 197Q1334 190 1341 180ZM1762-333Q1836-331 1864-149Q1867-132 1858-121L1809-57Q1796-41 1774-45Q1693-65 1641-117Q1599 14 1529 15Q1509 15 1500-14Q1491-43 1491-67Q1491-91 1512-101Q1516-103 1521-104Q1525-105 1529-105Q1583-108 1619-161Q1624-169 1640-194Q1655-220 1679-263Q1718-333 1762-333ZM1690-220Q1725-186 1780-174Q1781-217 1751-231Q1721-245 1690-220ZM2714-69Q2721-41 2714-17Q2703 15 2681 15Q2604 13 2578-119Q2546-43 2502-23Q2481-13 2448-9Q2415-5 2370-5Q2233-5 2288-156Q2294-172 2305-172Q2314-172 2322-153Q2329-135 2345-132Q2439-117 2512-145Q2551-160 2559-189Q2559-194 2556-220Q2553-247 2546-293Q2533-385 2531-406Q2530-426 2540-451L2563-502Q2569-516 2580-516Q2590-516 2592-500Q2607-378 2619-299Q2631-220 2641-183Q2660-110 2681-104Q2707-96 2714-69ZM2863-145Q2894-107 2925-104Q2953-101 2957-84Q2960-72 2957-42Q2956-27 2953-16Q2949-6 2946 1Q2940 15 2925 15Q2869 15 2817-49Q2755 15 2681 15Q2660 15 2654-12L2645-53Q2642-69 2653-86Q2664-104 2681-105Q2800-114 2827-164Q2836-179 2846-179Q2861-179 2861-162Q2861-154 2862-150Q2863-146 2863-145ZM2842 60Q2848 52 2859 55Q2879 62 2898 73Q2917 84 2933 98Q2941 106 2936 116L2888 192Q2880 203 2870 194Q2866 190 2853 182Q2839 173 2817 160L2784 214Q2777 224 2766 216Q2761 212 2743 201Q2724 190 2693 171Q2682 165 2690 154L2738 82Q2744 74 2755 77Q2785 87 2811 106ZM3348-248 3328-167Q3325-155 3303-145Q3293-141 3256-126Q3219-111 3157-86L2925 15Q2890 15 2880-34Q2870-83 2919-104Q2939-112 2954-118Q2968-125 2978-129Q2925-173 2940-238Q2971-372 3084-425Q3112-438 3151-420Q3189-402 3230-360Q3251-338 3245-325Q3240-313 3195-325Q3149-338 3086-323Q3020-308 3000-264Q2994-253 3028-222Q3113-149 3272-250Q3283-257 3293-263Q3302-269 3309-273Q3363-307 3348-248Z"/></symbol>
  <symbol id="rm-crescent" viewBox="0 0 24 24">
    <path d="M11 3.06A9 9 0 1 0 20.54 14.84 7.6 7.6 0 0 1 11 3.06z" fill="${GOLD}"/>
  </symbol>
</svg>`;

const lantern = (cls: string) => `<svg class="rm-lantern ${cls}" viewBox="0 0 60 124"><use href="#rm-lantern"/></svg>`;
const star = '<svg class="rm-orn" viewBox="0 0 24 24"><use href="#rm-star"/></svg>';
const crescent = '<svg class="rm-orn" viewBox="0 0 24 24"><use href="#rm-crescent"/></svg>';

/** The greeting strip above the header. Each phase's words are marked data-rm-when (ramadan.css shows the current
 *  phase's). Before Ramadan: how long is left and a live clock, and on wider screens the habit and a link to the app.
 *  The drawn Arabic beside an English greeting is decoration (hidden in Arabic, where the greeting itself is Arabic),
 *  so screen readers hear it once. */
const banner = (daysLeft: string) => `<div class="rm-banner">
    <span class="rm-banner-hang" aria-hidden="true">${lantern('rm-gold')}</span>
    <p class="rm-greet">
      <svg class="rm-moon" viewBox="0 0 24 24" aria-hidden="true"><use href="#rm-crescent"/></svg>
      <strong data-rm-when="before" data-rm-days>${daysLeft}</strong>
      <span class="rm-clock" data-rm-when="before" data-rm-clock aria-hidden="true"></span>
      <span class="rm-greet-line" data-rm-when="before" data-t="ramadan.habitShort">Build your Qur’an habit before it begins.</span>
      <a class="rm-greet-cta public-only" data-rm-when="before" href="/get/?c=ramadan" data-t="ramadan.ctaShort">Start today</a>
      <strong data-rm-when="during" data-t="ramadan.kareem">Ramadan Kareem</strong>
      <span class="rm-greet-ar" data-rm-when="during" aria-hidden="true"><svg viewBox="0 0 4090 1410"><use href="#rm-kareem"/></svg></span>
      <span class="rm-greet-line" data-rm-when="during" data-t="ramadan.line">May this month bring you closer to the Qur’an.</span>
      <strong data-rm-when="eid" data-t="ramadan.eid">Eid Mubarak</strong>
      <span class="rm-greet-ar rm-greet-eid" data-rm-when="eid" aria-hidden="true"><svg viewBox="0 0 3360 1110"><use href="#rm-eid"/></svg></span>
      <span class="rm-greet-line" data-rm-when="eid" data-t="ramadan.eidLine">May Allah accept from us and from you.</span>
    </p>
    <span class="rm-banner-hang" aria-hidden="true">${lantern('rm-rose')}</span>
  </div>`;

/** A string of lights: the wire and five layers of bulbs that twinkle out of step (ramadan.css draws them). */
const LIGHTS = (where: string) => `<div class="rm-lights ${where}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;

/** What hangs into the side margins on wide screens, from just under the header. */
const HANGERS = `<div class="rm-hangers" aria-hidden="true">
    <div class="rm-side rm-side-start">
      <span class="rm-hang rm-h-a rm-hl">${lantern('rm-gold')}</span>
      <span class="rm-hang rm-h-b">${star}</span>
      <span class="rm-hang rm-h-c">${crescent}</span>
      <span class="rm-hang rm-h-d">${star}</span>
    </div>
    <div class="rm-side rm-side-end">
      <span class="rm-hang rm-h-a rm-hl">${lantern('rm-rose')}</span>
      <span class="rm-hang rm-h-b">${crescent}</span>
      <span class="rm-hang rm-h-c">${star}</span>
      <span class="rm-hang rm-h-d rm-hl">${lantern('rm-jade')}</span>
    </div>
  </div>`;

const FOOT_GREETING = `<div class="wrap rm-foot-greet">
      <p><svg class="rm-moon" viewBox="0 0 24 24" aria-hidden="true"><use href="#rm-crescent"/></svg><span data-rm-when="before" data-t="ramadan.footSoon">Getting ready for Ramadan with you, from everyone at Revisely.</span><span data-rm-when="during" data-t="ramadan.foot">Ramadan Kareem from everyone at Revisely.</span><span data-rm-when="eid" data-t="ramadan.footEid">Eid Mubarak from everyone at Revisely.</span></p>
    </div>`;

/** The home's Ramadan card, after the slideshow: before Ramadan the countdown, the expected day and the habit; then
 *  Ramadan's and Eid's words. The link goes to /get/, which sends iPhones to the App Store (campaign "ramadan"). */
const unit = (k: string, label: string) =>
  `<div class="rm-unit"><b data-rm-n="${k}">00</b><span data-t="ramadan.u.${k}">${label}</span></div>`;
const countSection = (expected: string) => `<section class="rm-count" aria-labelledby="rm-count-title">
      <div class="wrap">
        <div class="rm-count-card">
          <span class="rm-count-hang rm-count-hang-start" aria-hidden="true">${lantern('rm-gold')}</span>
          <span class="rm-count-hang rm-count-hang-end" aria-hidden="true">${lantern('rm-jade')}</span>
          <p class="rm-kicker"><svg class="rm-moon" viewBox="0 0 24 24" aria-hidden="true"><use href="#rm-crescent"/></svg><span data-t="ramadan.kicker">Ramadan 1448</span></p>
          <h2 class="rm-count-title" id="rm-count-title"><span data-rm-when="before" data-t="ramadan.soonTitle">Ramadan is almost here.</span><span data-rm-when="during" data-t="ramadan.kareemTitle">Ramadan Kareem.</span><span data-rm-when="eid" data-t="ramadan.eidTitle">Eid Mubarak.</span></h2>
          <div class="rm-timer" data-rm-when="before" role="timer" aria-labelledby="rm-count-title">
            ${unit('d', 'days')}${unit('h', 'hours')}${unit('m', 'minutes')}${unit('s', 'seconds')}
          </div>
          <p class="rm-expected" data-rm-when="before" data-rm-expected>${expected}</p>
          <p class="rm-count-text" data-rm-when="before" data-t="ramadan.habit">Build your Qur’an habit now: a little revision every day, so Ramadan finds you ready instead of starting from zero.</p>
          <p class="rm-count-text" data-rm-when="during" data-t="ramadan.duringText">This blessed month, keep the Qur’an you’ve memorized close: a little revision every day, alongside your fasting and your night prayers.</p>
          <p class="rm-count-text" data-rm-when="eid" data-t="ramadan.eidText">May Allah accept your fasting and your prayers. Keep the habit you built this Ramadan going, a little every day.</p>
          <a class="rm-cta" href="/get/?c=ramadan"><span data-rm-when="before" data-t="ramadan.cta">Start your habit today</span><span data-rm-when="during" data-t="ramadan.ctaDuring">Revise with Revisely</span><span data-rm-when="eid" data-t="ramadan.ctaEid">Keep the habit going</span></a>
        </div>
      </div>
    </section>

    `;

const STYLESHEET = '<link rel="stylesheet" href="/assets/ramadan.css">';
const SCRIPT = '<script src="/assets/ramadan.js" defer></script>';

export interface DressOptions {
  /** The phase to paint (the worker's, in UTC; ramadan.js puts in the visitor's). Ramadan itself by default. */
  phase?: RamadanPhase;
  dates?: RamadanDates;
  /** The time the countdown's English is worked out for. */
  now?: number;
}

/** The page dressed for Ramadan (unchanged if it already is, or once Ramadan and Eid are over). Pages with no site
 *  header get the class, the stylesheet and the script only (the palette). */
export function dressForRamadan(html: string, opts: DressOptions = {}): string {
  const phase = opts.phase ?? 'during';
  const dates = opts.dates ?? {};
  if (phase === 'after' || !/<body[\s>]/.test(html)) return html;
  const attrs =
    ` data-rm-phase="${phase}"` +
    (dates.start ? ` data-rm-start="${dates.start}"` : '') +
    (dates.eid ? ` data-rm-eid="${dates.eid}"` : '');
  let added = false;
  let out = html.replace(/<body(\s+class="([^"]*)")?([^>]*)>/, (tag, _attr, classes: string | undefined, rest: string) => {
    const list = (classes ?? '').split(/\s+/).filter(Boolean);
    if (list.includes(RAMADAN_ON)) return tag;
    added = true;
    return `<body class="${[...list, RAMADAN_ON].join(' ')}"${attrs}${rest}>\n  ${SPRITE}\n  <div class="rm-sky" aria-hidden="true"></div>`;
  });
  if (!added) return html;
  out = out.replace('</head>', `  ${STYLESHEET}\n</head>`);
  const daysLeft = daysLeftEnglish(opts.now ?? Date.now(), dates);
  out = out.replace(/(\n?[ \t]*)<header class="site-header">([\s\S]*?)<\/header>/, (_m, indent: string, inner: string) =>
    `${indent}${banner(daysLeft)}${indent}<header class="site-header">${inner}  ${LIGHTS('rm-head')}\n  </header>${indent}${HANGERS}`,
  );
  out = out.replace(
    /<footer class="site-footer">/,
    `<footer class="site-footer">\n    ${LIGHTS('rm-foot')}\n    ${FOOT_GREETING}`,
  );
  // The home's card goes after the slideshow, before its first section.
  if (/<body class="(?:[^"]*\s)?home[\s"]/.test(out)) {
    const at = out.search(/<section class="(?:recite|revo)"/);
    const card = countSection(expectedEnglish(dates));
    out = at >= 0 ? out.slice(0, at) + card + out.slice(at) : out.replace('</main>', `${card}</main>`);
  }
  return out.replace('</body>', `${SCRIPT}\n</body>`);
}
