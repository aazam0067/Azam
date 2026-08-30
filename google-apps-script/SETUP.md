# Book Price Calculator — backend setup

The calculator on the website talks to a small Google Apps Script "web app"
that saves each quote into a Google Sheet, emails a notification, and
serves as a shared price cache. Nothing you enter here is ever visible in
the website's HTML/JavaScript.

**Do all of the steps below while logged into `eBooksWorld3622@gmail.com`**
— Apps Script ties "execute as: me" and Sheet ownership to whichever
Google account creates and deploys it.

## 1. Create the Google Sheet

1. While logged into `eBooksWorld3622@gmail.com`, go to
   [sheets.google.com](https://sheets.google.com) and create a new, blank
   spreadsheet. Name it something like "Kitab Guru Quotes".
2. Leave it empty — the script creates the header rows and three tabs
   ("Quotes", "PriceCache", and "Inquiries") automatically the first time
   it runs.
3. Copy the Sheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

## 2. Create the Apps Script project

1. In that same spreadsheet, click **Extensions → Apps Script**.
2. Delete the placeholder code in `Code.gs` and paste in the entire contents
   of [`Code.gs`](./Code.gs) from this folder.
3. Near the top of the file, fill in:
   - `SPREADSHEET_ID` — the ID you copied in step 1.
   - `NOTIFY_EMAIL` is already set to `eBooksWorld3622@gmail.com` — change
     it only if you want notifications to go somewhere else.
4. Save the project (File → Save, or Ctrl/Cmd+S). Give it a name like
   "Kitab Guru Quotes Backend".

## 3. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me (`eBooksWorld3622@gmail.com`)
   - **Who has access:** Anyone
4. Click **Deploy**. The first time, Google will ask you to authorize the
   script — this is expected, since it needs permission to write to your
   Sheet and send email on your behalf. Review and allow it.
5. Copy the **Web app URL** it gives you (ends in `/exec`).

## 4. Connect it to the website

Open `index.html` and find this line (search for `QUOTE_API_URL`):

```js
const QUOTE_API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```

Replace the placeholder with the URL you copied in step 3. That's it — the
calculator will now save every quote, use the shared price cache, and email
`eBooksWorld3622@gmail.com` when a new quote comes in.

Until you do this, the calculator still works end-to-end for browsing and
testing — it just skips the cache lookup and save-to-Sheet steps and shows
a quiet console note instead of failing.

## About the Inquiries tab

Whenever a customer picks a book (or a specific edition) and none of the
price sources can confirm a current price, the calculator still offers
them a way to message the team directly — and logs a row to the
`Inquiries` tab (country, title, author, edition, ISBN) so that interest
isn't lost even when the automatic price check comes up empty.

## About the price cache

The `PriceCache` tab stores one row per (ISBN + country + format) the
calculator has successfully priced, along with when it was priced. Before
trying any external pricing API, the calculator asks this Sheet for a
recent match first — if found within `CACHE_TTL_HOURS` (24 hours by
default, changeable in `Code.gs`), it's used directly, saving an external
API call. This helps under repeated traffic for the same popular titles,
but it's a protection layer only — a book nobody has looked up before still
goes through the live fallback chain in `index.html`.

## About the price sources

`index.html` tries sources in this order for every fresh (non-cached)
lookup: Amazon → local retailer → Google Books (customer's own country) →
Google Books (US reference price). Only the two Google Books tiers are
live today — Amazon and the local-retailer registry are documented,
ready-to-fill placeholders (see the comments above `AMAZON_MARKETPLACES`
and `LOCAL_RETAILER_SOURCES` in `index.html`) pending credentials you don't
yet have. Nothing needs to change in this Apps Script file when you add
those later — they plug into the same fallback chain.

## Updating later

If you ever need to redeploy after editing `Code.gs`, use **Deploy → Manage
deployments → edit (pencil icon) → New version → Deploy**. Redeploying as a
brand-new deployment instead of a new version will change the URL, which
means you'd need to update `QUOTE_API_URL` again.

## Notes

- No password, API key, or credential from this setup ever needs to be
  pasted into the website's code — only the Web App URL, which is not a
  secret (it's a write-only endpoint scoped to this one script).
- The Sheet ID and notification email live only inside the Apps Script
  project, which only `eBooksWorld3622@gmail.com` can see and edit.
