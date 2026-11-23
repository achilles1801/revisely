// The home's Recite section (mistake detection: Recite, Mark mistakes, Test me) shows where RECITE_SECTION is "1":
// dev.revisely.app, until the release. docs/index.html marks the section and its header link
// data-when="RECITE_SECTION", and site.css hides them unless <body> has the class recite-on, which this adds.
//
// revisely.app serves its home straight from the assets (wrangler.jsonc runs the worker for /api and the account pages
// only), so the worker never sees it there. At the release the one line is in docs/index.html:
// <body class="home recite-on">. worker/__tests__/reciteSection.test.ts holds both until then.

/** The class on the home's <body> that shows the section. */
export const RECITE_ON = 'recite-on';

/** The home with its Recite section shown; any other page (no <body class="home…">) unchanged. */
export function showReciteSection(html: string): string {
  return html.replace(/<body class="([^"]*)">/, (tag, classes: string) => {
    const list = classes.split(/\s+/).filter(Boolean);
    if (!list.includes('home') || list.includes(RECITE_ON)) return tag;
    return `<body class="${[...list, RECITE_ON].join(' ')}">`;
  });
}
