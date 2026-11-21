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
  <symbol id="rm-crescent" viewBox="0 0 24 24">
    <path d="M11 3.06A9 9 0 1 0 20.54 14.84 7.6 7.6 0 0 1 11 3.06z" fill="${GOLD}"/>
  </symbol>
</svg>`;

const lantern = (cls: string) => `<svg class="rm-lantern ${cls}" viewBox="0 0 60 124"><use href="#rm-lantern"/></svg>`;
const star = '<svg class="rm-orn" viewBox="0 0 24 24"><use href="#rm-star"/></svg>';
const crescent = '<svg class="rm-orn" viewBox="0 0 24 24"><use href="#rm-crescent"/></svg>';

/** The greeting strip above the header. The Arabic beside the English is decoration (hidden in Arabic, where the
 *  greeting itself is Arabic), so screen readers hear the greeting once. */
const BANNER = `<div class="rm-banner">
    <span class="rm-banner-hang" aria-hidden="true">${lantern('rm-gold')}</span>
    <p class="rm-greet">
      <svg class="rm-moon" viewBox="0 0 24 24" aria-hidden="true"><use href="#rm-crescent"/></svg>
      <strong data-t="ramadan.kareem">Ramadan Kareem</strong>
      <span class="rm-greet-ar" aria-hidden="true"><svg viewBox="0 0 4090 1410"><use href="#rm-kareem"/></svg></span>
      <span class="rm-greet-line" data-t="ramadan.line">May this month bring you closer to the Qur’an.</span>
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
      <p><svg class="rm-moon" viewBox="0 0 24 24" aria-hidden="true"><use href="#rm-crescent"/></svg><span data-t="ramadan.foot">Ramadan Kareem from everyone at Revisely.</span></p>
    </div>`;

const STYLESHEET = '<link rel="stylesheet" href="/assets/ramadan.css">';

/** The page dressed for Ramadan (unchanged if it already is). Pages with no site header get the class and the
 *  stylesheet only (the palette). */
export function dressForRamadan(html: string): string {
  if (!/<body[\s>]/.test(html)) return html;
  let added = false;
  let out = html.replace(/<body(\s+class="([^"]*)")?([^>]*)>/, (tag, _attr, classes: string | undefined, rest: string) => {
    const list = (classes ?? '').split(/\s+/).filter(Boolean);
    if (list.includes(RAMADAN_ON)) return tag;
    added = true;
    return `<body class="${[...list, RAMADAN_ON].join(' ')}"${rest}>\n  ${SPRITE}\n  <div class="rm-sky" aria-hidden="true"></div>`;
  });
  if (!added) return html;
  out = out.replace('</head>', `  ${STYLESHEET}\n</head>`);
  out = out.replace(/(\n?[ \t]*)<header class="site-header">([\s\S]*?)<\/header>/, (_m, indent: string, inner: string) =>
    `${indent}${BANNER}${indent}<header class="site-header">${inner}  ${LIGHTS('rm-head')}\n  </header>${indent}${HANGERS}`,
  );
  out = out.replace(
    /<footer class="site-footer">/,
    `<footer class="site-footer">\n    ${LIGHTS('rm-foot')}\n    ${FOOT_GREETING}`,
  );
  return out;
}
