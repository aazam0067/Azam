# Kitab Guru — Book Price Calculator backend

This Apps Script web app stores quotes and inquiries in Google Sheets, sends quote
notifications, caches successful prices, and proxies Google Books lookups so API
keys are not shipped to the visitor's browser.

## 1. Create or select the Google Sheet

1. Sign in to the Google account that should own the spreadsheet and notification
   workflow.
2. Create a spreadsheet named something like **Kitab Guru Quotes**.
3. Copy its spreadsheet ID from the URL. The script creates the `Quotes`,
   `PriceCache`, and `Inquiries` tabs automatically.

## 2. Create the Apps Script project

1. Open the spreadsheet and choose **Extensions → Apps Script**.
2. Replace the editor's `Code.gs` with the complete contents of this repository's
   `google-apps-script/Code.gs`.
3. Save the project.

> Updating the GitHub copy does not automatically update the Apps Script project.
> Paste the updated file into the deployed Apps Script project before deploying
> a new version.

## 3. Store configuration privately

In Apps Script, open **Project Settings → Script Properties → Add script property**.
Add these properties. Their values must stay in Script Properties and must not be
committed to GitHub.

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | The ID copied from your Google Sheet URL |
| `NOTIFY_EMAIL` | The inbox that should receive new quote notifications |
| `GOOGLE_BOOKS_API_KEYS` | One or more newly created Google Books API keys, comma-separated |

Create a **new** Google Books API key in Google Cloud Console. Enable the Books API
and restrict the key to that API. Since requests are made server-side by Apps
Script, website HTTP-referrer restrictions are not appropriate for this proxy.
Keep the key out of HTML, JavaScript, GitHub, screenshots, and chat messages.
For stronger application-level restrictions, move this proxy to a server with a
stable outbound IP and apply an IP restriction as well.

The keys previously present in the public HTML should be considered exposed.
Rotate or delete them in Google Cloud Console; removing them from the latest
commit does not remove them from earlier Git history.

## 4. Deploy as a web app

1. Choose **Deploy → New deployment** (or edit the existing deployment).
2. Select **Web app**.
3. Set **Execute as** to the account that owns the Sheet and Apps Script.
4. Set **Who has access** to **Anyone** because the public calculator needs to
   submit quote and search requests.
5. Authorize the requested Sheet, email, and external-request permissions.
6. Deploy and copy the web app URL ending in `/exec`.

The deployment URL is a public endpoint, not a password. Do not rely on hiding it
as a security control. Keep the script's input validation and monitor usage. For
stronger abuse protection, add a server-verified CAPTCHA/Turnstile challenge or
move public actions behind a rate-limited backend.

## 5. Connect it to the website

In `index.html`, find `QUOTE_API_URL` and set it to the deployed web app URL.
This URL is required by the browser and is not a secret. The Google Books API key
is now read only by Apps Script from Script Properties.

After changing `Code.gs`, deploy a **new version** of the existing web app
deployment so the URL stays the same. Then publish the website changes from the
security branch after reviewing and testing them.

## Backend actions

- `saveQuote`: validates and stores quote information; repeated quote IDs are
  treated as duplicates.
- `updateContactMethod`: updates the chosen contact channel for a known quote.
- `getCachedPrice` / `cachePrice`: reads and writes the 24-hour shared price cache.
- `logInquiry`: records books whose price could not be confirmed.
- `checkRetailerPrice`: looks up a valid ISBN through the TextbookX fallback.
- `googleBooksSearch`: proxies Google Books requests using server-side keys and
  caches identical lookups briefly.

Customer-provided text is length-limited and escaped before being written to
Sheets, reducing spreadsheet formula-injection risk. This is input hardening,
not a substitute for a CAPTCHA or edge-level rate limiting.

## Notes

- The website's public contact email, WhatsApp number, social profile links,
  Google Analytics measurement ID, and AdSense publisher ID are intentionally
  public-facing identifiers. Remove them only if you do not want customers to
  see or use those public channels.
- The Sheet ID and notification address are configuration values, not passwords,
  but they are moved to Script Properties to avoid unnecessary disclosure.
- Do not put private API keys, access tokens, passwords, service-account JSON,
  or recovery codes in this repository.
