# Book Price Calculator — backend setup

The calculator on the website talks to a small Google Apps Script "web app"
that saves each quote into a Google Sheet and emails you a notification.
Nothing you enter here is ever visible in the website's HTML/JavaScript.

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet. Name it something like "Kitab Guru Quotes".
2. Leave it empty — the script creates the header row and a "Quotes" tab
   automatically the first time it runs.
3. Copy the Sheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

## 2. Create the Apps Script project

1. In that same spreadsheet, click **Extensions → Apps Script**.
2. Delete the placeholder code in `Code.gs` and paste in the entire contents
   of [`Code.gs`](./Code.gs) from this folder.
3. Near the top of the file, fill in the two constants:
   - `SPREADSHEET_ID` — the ID you copied in step 1.
   - `NOTIFY_EMAIL` — the email address that should get a notification for
     every new quote (e.g. `ebooks@kitabguru.com`).
4. Save the project (File → Save, or Ctrl/Cmd+S). Give it a name like
   "Kitab Guru Quotes Backend".

## 3. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me (your Google account)
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
calculator will now save every quote to your Sheet and email you when a new
one comes in.

Until you do this, the calculator still works end-to-end for browsing and
testing — it just skips the save-to-Sheet step and shows a quiet console
note instead of failing.

## Updating later

If you ever need to redeploy after editing `Code.gs` (e.g. to change the
notification email), use **Deploy → Manage deployments → edit (pencil icon)
→ New version → Deploy**. Redeploying as a brand-new deployment instead of a
new version will change the URL, which means you'd need to update
`QUOTE_API_URL` again.

## Notes

- No password, API key, or credential from this setup ever needs to be
  pasted into the website's code — only the Web App URL, which is not a
  secret (it's a write-only endpoint scoped to this one script).
- The Sheet ID and notification email live only inside the Apps Script
  project, which only you can see and edit.
