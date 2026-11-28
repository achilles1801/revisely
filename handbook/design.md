# The design

Moved from CLAUDE.md word for word on Nov 22 2026. CLAUDE.md keeps the rules every session needs.

## The design

The app has one design, Threads-style (the plan was the doc "Revisely: Threads-style UI Migration",
Claude Docs). It shipped screen by screen behind a tester switch; on 2026-10-27 the owner made it the
app, and the classic design (glass, gradients, the LiquidGlass tab bar, the Mihrab palette) and the
switch were removed. The theme is decided once per phone (`resolveThemeMode`): a Light/Dark
chosen in either design is kept, a phone that had run the app without choosing stays dark (the
classic default), and a fresh install starts in light.
- Tokens are `src/theme/v2.ts` (`paletteV2(isDark, accent)`, `typeV2`, `layoutV2`, `radiusV2`,
  `markV2`). `useTheme()` gives `palette` and, for older code, `theme`: the same colours under the
  older names (`textPrimary`, `accent`, `glass`, …; `v2ThemeColors`). The reader's page colours are
  `theme/readPalette` (`getReadPalette(isDark)`). **Colours live only in `src/theme`:** a hex,
  `rgb()`/`rgba()`/`hsl()` in a string, or an alpha glued on (`+ '22'`), anywhere else in `src/`
  fails `src/design/__tests__/noRawColours.test.ts` (Google's "G" is the one exemption, listed
  there with the reason). A colour built some other way (a template from numbers) isn't caught.
- The look: white / black grounds, flat. Content is a feed of rows on 0.5pt separators with a
  16pt gutter; each row has an avatar-size mark (40 top-level, 36 reply, 28 nested; `v2/Mark`),
  a name (15/600), metadata (13) and a ⋯ menu, and rows of one thread are joined by a 2pt line
  (`v2/ThreadRow`, ported from the Layl app's ThreadCard). No cards, no glass, no gradient but
  Home's glow, the accent's progress fill, Premium's mark and ring (`premium`) and the badges' materials (`BADGE_MATERIALS`,
  Settings → Account; Majd approved them on Nov 26 2026): the primary button is a solid pill
  (`v2/PillButton`). Every menu is `v2/ActionSheet` (handle, 18/600 title, icon rows, red
  destructive rows, a Cancel bar); its action runs after the sheet has gone. The one exception is
  the held verse's menu (`verse/VerseMenu`, Oct 27 2026): a small card beside the verse
  (`verse/menuPlacement`: below it, above it near the bottom, beside the finger for a verse that
  fills the page), nothing dimmed behind it, no title or Cancel; any touch outside closes it.
  It is a view in the screen, not a Modal, so its action runs at once and the verse sheet or the
  share sheet can open straight after. The tab bar (`navigation/TabBar`) is flat and icon-only,
  with a small accent dot under the current tab that follows a swipe (below); `ActionBar` takes
  its place for a screen's own actions. No Threads/Meta names, logos or icons, no likes or reposts.
- A mark inside a ring, a disc or a badge (a check, a glyph) is centred by its box: the box is square and centres its
  child, the ring is drawn behind it (absolute), and the icon is never absolute itself. An icon is text: given
  `absoluteFill` its glyph sits at the box's top start, cut by the ring (the Calendar's day card, Nov 26 2026).
  `jest/rings.ts` (`offCentreMarks`) checks a rendered ring; `components/__tests__/ringMarks.test.tsx` checks the shared
  ones and that no `<Ionicons>` in `src/` is placed absolutely.
- Shared pieces live in `src/components/v2/`; Home's feed in `src/components/home/feed/`. Every sheet
  is `v2/Sheet` (handle, centred title, optional Cancel/Save, optional foot bar, and `pinned`: a sheet's own
  main action kept on screen under its scrolling content; the backdrop is its sibling) and every menu `v2/ActionSheet`; segmented controls are `v2/PillTabs`. Sheets with their
  own frame (gorhom `PlanSheet`) take the same colours and corners.
- A sheet closes by a tap on the backdrop, or by dragging its handle or header down (Oct 27 2026):
  it follows the finger on the UI thread and the backdrop fades with it; past 120pt (or 30% of a
  short sheet) or a downward fling over 800pt/s it goes, otherwise it springs back
  (`shouldDismiss` in `v2/Sheet`). Only the handle and the header start the drag, so the content's
  scroll views and pickers (Audio Options' wheels) keep theirs. For VoiceOver the handle is a
  "Close" button and the escape gesture closes it. The gesture lives in the modal's own
  `GestureHandlerRootView` (iOS needs one inside a native modal); `jest.setup.ts` loads Gesture
  Handler's jest setup for every test. Gorhom's sheets pan down to close by themselves.
- The verse (translation) sheet keeps its own frame (`verse/VerseSheet`: it expands to nearly the
  whole screen from the grabber) and drags the same way: the grabber and the header follow the
  finger down, the backdrop fades, and `verseSheetRelease` decides (at normal height `shouldDismiss`;
  expanded, the same threshold brings it back to normal height and half the sheet, or a quarter
  flung, closes it; up expands). The verse drags the sheet down too, but only from its top: its
  ScrollView doesn't bounce, and a pan running alongside its own scroll (`Gesture.Native`) waits
  until the offset is 0. Before (Oct 28 2026) it acted only on release and closed on an 80pt
  bounce, so it never followed the finger.
- The owner's rules from testing (Oct 26 2026):
  - **Minimal.** Home is one Today post (pages, juz, surahs, the action, how much is memorized); no
    second card restating it, and no ⋯ (Nov 2026): where today starts ends with "Change", which opens Jump to
    (`lib/jump`, `home/JumpSheet`) directly (HOME-3, Nov 25 2026; Edit schedule is in Settings → Revision); the memorized line,
    "17.9% of the Quran memorized ›" (one decimal, of 604 pages; always shown, no setting; it wraps,
    never truncates), opens the memorized pages ready to edit. In Revisely Dev (MEM-9, Majd's option B, Nov 27 2026) the
    line and the juz dots are off Home: Memorized pages is a row of Settings' first level, right under Revision, opening a
    Settings-style editor (`screens/main/MemorizedPagesScreen`, `components/memorization/MemorizedEditor`), and Activity's
    Memorization section opens it too (MEM-10), until `lib/release/memorizedInSettings` is on. The old "Behind? / back a day" (Home
    and the plan editor's "Running behind?") is gone: Jump to covers it. Under the memorized line,
    **juz dots** (`v2/JuzDots`): thirty, one per
    juz, each lit by that juz's memorized share (`juzFractions`; half a juz, half a dot) in the
    accent's `palette.ring` colours (both ends ≥ 3:1 on the ground): no words, the line's text for
    VoiceOver, Reduce Motion respected. The user chose them on Oct 28 2026 over a ring around the mark and a
    hairline (both removed, with the tester-only setting that compared them). Lists show the **last 3** things (`RecentSection`) with "See all"
    to `ActivityAll` (search, kind and date filters); none → one quiet line, no list, no
    "Earlier".
  - **Today's two lines** (`lib/todayLines`; the owner's option E, Nov 1 2026, mocks in
    `~/Documents/revisely-today-mocks/`; page numbers replaced by surahs and ayahs on Nov 7 2026,
    below): "Starts at Al-Mujadila ›" (or "Starts at Al-Baqarah, ayah 142 ›" when the page begins
    mid-surah; `placeOfPage`) over "20 pages · to At-Tahrim · Juz 28"; in progress "Continue at
    <where the first page not revised begins> ›" over a thin bar and "6 of 20"; done "● Done · 20
    pages" over "Adh-Dhariyat → Al-Hadid · Juz 27" (no ›, but a tap still opens the menu); across
    the cycle's end "20 pages · then Al-Fatihah"; carried pages "20 pages · 4 from yesterday first".
    Pages are read in the session's order. The › sheet's header holds the exact ranges, the surahs
    first and the pages as a quiet detail ("Al-Mujadila to At-Tahrim · Juz 28 · pp. 542–561").
    No-break spaces hold "ayah 142 ›", "20 pages" and "Juz 28" together and no-break hyphens hold
    surah names, so the › never stands alone and "Al-" never ends a line. Each line is two lines at most (`maxFontSizeMultiplier` 1.6, then it shrinks to
    fit); the name and streak and the sheet's header stop at 1.4, and so does the greeting, which
    also keeps 12pt from the icons (about 1.05 on an iPhone SE).
  - **Edit schedule, tidied** (Majd chose option A of the Edit schedule audit, Nov 22 2026: "for edit schedule let's
    do option A (tidy up) for now"; mocks `~/Documents/revisely-schedule-mocks/`, A1): the header says how much a day and
    how often each page comes round (never "Automatic"); Daily amount is the first row; the days don't fold; "Create
    new plan" and "Saved plans" (a sheet) are two rows; an edit on the automatic schedule says before Save that it
    becomes a custom plan (MEM-6). Other directions are being explored as mocks only.
  - Activity is a calendar (`activity/ActivityCalendar`): **a month by default**, ‹ › to step,
    and **Week as the finest view** (seven rows, each day's facts), kept per device. Day shades
    are `lib/activityHeatmap` levels in `palette.heat` (≥ 2:1 on the ground) with
    `palette.heatInk` numbers (≥ 4.5:1); the picked day is one line under the month. Things done
    are `lib/activityItems`.
  - **No floating timer.** The timer is in the reader's and the session's controls; a running one
    shows in Home's top bar (`RunningTimerChip`), with a thin progress line for a timed one. The
    button itself grows into the timer card (`timer/TimerCard`, Oct 28 2026; there is no separate
    floating button): in a bottom bar (reader, session) the card rises from it and sits just above
    the bar (`cardPlace`), from Home's top-bar chip it drops down; its controls fade in as it lands; a tap outside,
    a drag down (`shouldDismiss`, as sheets) or VoiceOver's escape shrinks it back into the chip.
    With Reduce Motion it fades. In the card: Stopwatch / Timer, the clock light at 60pt with one
    line under it, and one row of controls: for a timer, − length + (5-minute steps to an hour,
    then 15, then 30) and Down / Up; running, a red bin (Discard), Pause and End. A timer's length
    can be typed: tap the clock or the length, a number pad, 1–480 minutes (`parseMinutes`); the
    card rises above the keyboard. "Open the Quran" is a small link where it applies.
  - **Help, kept small** (Majd, Nov 8 2026: "helper buttons are good". This replaced the "No help"
    rule). A label or a subtitle still says what a control does (e.g. Keep daily amount), and sheets
    hold no paragraphs of explanation (the Mushaf picker's was removed, Nov 3 2026). On top of that,
    the few screens that can't explain themselves get one ? (`components/help/HelpButton`; every
    account since the November 2026 release set `HELP_FOR_EVERYONE` in `lib/help/availability`). They are on by default, new
    account or not; only the user hides them (HELP-4: Majd, Nov 8 2026). Home's is in the Today post's header, the schedule editor's
    before Save, the reader's a round button at the right of its header, and a session's the last
    row of its ⋯ menu (its header is full), Activity's in its top bar before search (for the tab on
    show: Overview or Insights), and a day's before +. It opens a `v2/Sheet` of at
    most four topics, about two sentences each, then "Ask Revo ›" (only while Revo is on for the
    account, `useRevoPresent`, so it follows Revo's release switch) and "Hide help buttons". Hiding
    is one switch for every screen, kept on the phone per account; Settings → Help and support → Help buttons
    turns it back on. BEHAVIOUR.md HELP-1 to HELP-3. No first-run guides,
    tooltips, coach marks, or ⓘ beside single controls.
    - **All help text is in `src/lib/help/topics.ts`.** Each topic lists the BEHAVIOUR.md rules it
      explains (`covers`). `src/lib/help/__tests__/topics.test.ts` keeps a hash of each covered rule
      in `reviewed.json` and fails when a rule changes until its topic is reviewed: read the topic
      against the rule, fix the words, then `UPDATE_HELP_REVIEWED=1 npx jest src/lib/help`. A topic
      no rule covers yet says why (`unruled`: the reader's gestures and player); the
      check can't watch those, so a rule with a scenario for one turns it into `covers`.
    - A change to something a topic describes (a label, a gesture, where a button is) updates the
      topic in the same PR. `{{labels}}` must be text the app shows (the test checks `src/`).
    - With Smart Tracking off, no topic mentions ratings or strength (`when`; HELP-3). The hidden
      page's topic shows only where it's offered. Surahs and juz, never page numbers.
- **Accents** (Settings → Appearance → Accent, a row like Theme: label on the left, the three pills
  on the right, swatches only on narrow screens or large text): **Indigo (the default)**, Crimson and Jade. The
  choice is the user doc's `accent` field (rules allow `indigo|crimson|jade`), so it follows the
  account. `DesignGate` applies it once the user loads, and Indigo applies when it's unset; the
  device keeps a copy for the first frame. Crimson and Indigo put the accent on the primary action,
  links, the active tab, "done", the calendar and a glow behind Home's top (`v2/HeroGlow`); Jade
  keeps ink buttons and grey links, with jade for "done" and a jade glow in light. An accent is a
  token set in `theme/v2` (`ACCENT_TOKENS`: `primary`, `done`/`doneText`, `accentText`, `link`,
  `accentSubtle`, `hero`, `progress`, `heat`/`heatInk`); never write an accent colour in a
  component. Status colours don't follow it: weak is `red`, strong is `good` (green); a warning
  that is advice (a long cycle) is ink, not red. Every combination is checked in
  `src/design/__tests__` (text 4.5:1, including ink and grey on `accentSubtle`; fills 3:1).
- **The page's one highlight is grey, never the accent** (Majd, Nov 21 2026: "i don't think we should highlite verses
  with the accent color because it can conflict with the mistake colors especially red-- we should have one global
  highlite color that doesnt conflict with other colors, maybe gray?"). `highlight` in `theme/v2` (light `#DEDEE3`,
  dark `#26262B`, solid, behind the ink) is every ayah highlighted on a mushaf page (`MushafPager`'s
  `highlightedAyah`: a held verse, the recitation playing, a search result, a similar ayah, "You continued with…", a
  passage opened from Insights) and Recite's box on the word being said; `highlightSoft` (`#F2F2F4` / `#121214`) is
  its lighter shade, Recite's band on the line. Mistakes keep their three colours (`mark…`), peeked words their veil.
  design.test holds it neutral, the same for every accent, at least ΔE 20 from every mistake colour, the peek veil's
  grey ink and the Ramadan theme, apart from the paper, and the ink at 4.5:1 on it. Before, an ayah was the accent's
  text colour at a quarter (Crimson's read as a mistake's red). A new highlight on a page uses these two, never a
  new colour.
- Taps don't buzz (`PressableScale` shrinks, `v2/Tap` dims); outcomes use `design/haptics`
  (`useHaptics()`). There is no Haptics setting (removed Oct 28 2026 to keep Settings short; the
  old stored value is cleared): they are only on outcomes, and iOS's System Haptics silences them.
- Fonts: SF Pro for Latin, Amiri for all Arabic. In a line that mixes them, put the Latin first
  and the Arabic last in a first-strong isolate (`⁨…⁩`): a line that starts with Arabic
  is laid out right to left (Insights' juz rows did).
- **Amiri's lines never clip** (Majd, Nov 22 2026, on a mistake's card: "u cant even see if theres a dumma or fatha on
  the top"; #879, #883). A Text draws only inside its own box, and Amiri's marks reach past the line the font declares.
  - `arabicFullV2(size)` (a 2.51× line) for anything with harakat: Qur'an words, phrases, ayat, the bismillah, the
    voweled surah names. Every word of the Qur'an reaches 1.481× the size above the baseline and 0.950× below.
  - `arabicV2(size)` (1.83×) for unvoweled names (a surah's name, the salam, a prayer's name): up to 1.001× above and
    0.651× below. Its old 1.6× line cut a hamza's top on iOS and a meem's tail on Android.
  - `arabicForV2(text, size)` where one place shows both (the plan picker's surah and juz names, the wheels, search).
  - Never Amiri by hand, nor a `lineHeight` over a helper's. A highlight behind a word (a nested Text's background)
    fills the line, so it covers the marks. A box that clips (`overflow: 'hidden'`, a fixed height) must hold the line,
    as the Recite bar's capsule caps its words' text size.
  - The numbers come from `swift scripts/measure-amiri-ink.swift` (CoreText over the word data and the names). Run it
    again if the font or the text changes. `src/design/__tests__/arabicLines.test.tsx` holds the lines to them and
    scans the app; `jest/arabicLines`'s `clippedArabic(root)` checks every Amiri line a test renders.
- **Surahs, their pages and first words** (the owner, Nov 7 and Nov 23 2026; NAME-1). People revise by surah, juz and
  the page in front of them, not by ayah numbers: "almost no one references the quran by ayah numbers when it comes to
  revising or memorizing ... it should just be the page". Every name comes from `lib/passages`:
  - `describePassage(pages, { form, juz, order, wholeJuz, exact })`: "Juz 28", "Al-Mulk", "Maryam, 5th page", "Maryam,
    3rd to 5th page", "Maryam, first 3 pages", "Juz 2, first 5 pages", "Maryam to Ta-Ha". `form: 'short'` (chips, chart
    labels) says "Start of Al-Baqarah" for pages from a surah's edge; `juz: true` adds " · Juz 28" when it helps;
    `order: 'given'` keeps a session's order; `exact` names the page at each end of a run across surahs.
  - `describeAyahs` names any ayahs the same way, with part of a page as "Maryam, 3rd page · start" (middle, end).
    `describePageRange`, `describeSession` (SESS-5: whole juz only on the juz plan), `placeOfPage` ("Starts at Al-Hadid,
    2nd page"), `partOfSurah` ("5th page", for a row already named by its surah), `pagesNote` ("p. 542"),
    `firstWordsOfPage` (a page's first words, from `src/data/pageFirstWords.json`) and `plainText` / `spokenText`
    (notifications and tests / VoiceOver). The text holds names together with no-break hyphens and spaces: in tests
    compare `plainText`.
  - Ayah numbers only where a verse is cited or played: `form: 'ayahs'` ("Yunus, ayah 16") or `'ayahsCompact'` ("Yunus
    16"), for a held verse, search results, Audio Options and "Play from". Nowhere else.
  - The mushaf's page numbers stay a quiet detail after the words ("Al-Mujadila · p. 542"), inside the reader and the
    session, and where the user chooses by page (Jump to's Page tab, the plan's start-point Page tab, page grids, From
    and To). Amounts are fine ("20 pages").
- `theme.onAccent` is the text colour on an `accent` fill. Use it instead of `'#fff'`.
- Following the system appearance needs `userInterfaceStyle: "automatic"` in app.config (now "light"):
  a native change for a versioned release. Until then Settings offers Light and Dark only
  (`systemAppearanceAvailable()`; `resolveThemeMode` in `context/ThemeContext`).
- `expo-blur` and `expo-glass-effect` were removed from `package.json` (and the tests' mocks) with
  the background-audio build (Oct 28 2026).

## Settings (SET-1)

Settings is a short first level with a page per group (Majd's option B from the Settings audit, Nov 22 2026; the audit
and its mocks are in Drive › Revisely › Product and design › Settings audit). `SettingsScreen` draws the first level, or
the page its route's `page` names (`lib/settingsPages`), pushed again so the back gesture returns to the first level.
- A new setting goes in its group's page (`page === '…'` in `SettingsScreen`). It shows on the first level only through
  that page's value: a few words for its state, never a paragraph.
- Revo's Settings section ids (`REVO_SETTINGS_SECTIONS`) stay as they are on the phone and the server. `pageOfSection` maps
  each to the page that holds its rows.
- A path written for users ("Settings → Reminders → …") names the page: in BEHAVIOUR.md, Revo's guide, help and strings.
