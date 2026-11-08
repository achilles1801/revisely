# revisely.app/record

Volunteers record a short script of recitations, some with mistakes on purpose, for testing (and later
training) Revisely's recitation checker. Each person gets a personal link. Their takes go straight into a
private folder in the owner's Google Drive. They never see the folder or anyone else's recordings, and no
names are stored anywhere except in a sheet only the owner opens.

| File | What it is |
| --- | --- |
| `docs/record/index.html` | The page. Not linked from the site, `noindex`. Works with no link (says so) and before setup (says "Not open yet"). |
| `docs/record/items.json` | The script: 35 items in two parts, built by `items.py`. |
| `scripts/record/items.py` | Builds `items.json` from the app's word list, checking every planted mistake's word. Each item's `truth` says what it contains, for scoring. |
| `scripts/record/apps-script.gs` | The upload end: a Google Apps Script web app that runs as the owner and writes to their Drive. |
| `scripts/record/mock_server.py` | The page plus a stand-in for the Apps Script, to try it on this computer. |

## Setting it up (once, about 10 minutes, on a computer)

Signed in to the Google account whose Drive should hold the recordings:

1. Go to [script.google.com](https://script.google.com) and click **New project**. Name it "Revisely recordings".
2. Delete everything in `Code.gs`, paste in `scripts/record/apps-script.gs`, and save (⌘S).
3. In the toolbar, pick **setup** in the function menu and click **Run**. Google asks for permission:
   **Review permissions**, pick your account, then on "Google hasn't verified this app" click **Advanced** and
   **Go to Revisely recordings (unsafe)**, then **Allow**. It's your own script, asking for your Drive and
   Sheets. The log at the bottom shows two links: the recordings folder and the codes sheet.
4. Click **Deploy**, then **New deployment**. Click the gear and pick **Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**, then **Deploy**. Copy the **Web app URL** (it ends in `/exec`).
5. Put that URL in `ENDPOINT` in `docs/record/index.html` (a PR into `main`; Cloudflare publishes it).

## Running it

- **Handing out links:** open the sheet "Revisely recording codes (private)" in your Drive. Give each person
  one link and write their name next to it. `P00` is for testing.
- **Closing a link:** delete its row. It stops working within 5 minutes.
- **Deleting someone's recordings:** delete their `P..` folder in "Revisely recordings (private)".
- **What arrives:** in each person's folder, `consent.json` (which box they ticked, when), `profile.json` (their
  answers) and one file per take, `<item>_take<n>.m4a` (or `.webm` on some Android phones). Each take's Drive
  description holds its length, the chosen passage for `n8` and the phone. The latest take of an item counts.
- **More links:** add rows to the sheet with a new code (`P41-` and 12 random letters and digits) and the link
  `https://revisely.app/record/#k=<code>`.
- **Changing the Apps Script later:** Deploy, Manage deployments, edit, Version: New version. The URL stays.

## Changing the script of items

Edit `ITEMS` in `items.py` and run `python3 scripts/record/items.py`. Don't change an item that people have
already recorded: give the new version a new id, or the recordings and their truth won't match.

## Trying it locally

```bash
python3 scripts/record/mock_server.py --out /tmp/record-test
```

Then open `http://localhost:8790/record/?endpoint=http://localhost:8790/mock#k=P00-localtest01`. The page
takes `?endpoint=` only on localhost.

## Privacy

Recordings are of volunteers who agreed on the page (or whose parent or guardian did). They never go into
this repository, the app or Firebase. The page tells volunteers the recordings are used to build and test the
checker, including training models, that it may become a paid feature, and how to have them deleted
(support@revisely.app with their code). This is separate from the app, so the app's privacy policy and App
Privacy answers don't change.
