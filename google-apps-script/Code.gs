/**
 * Kitab Guru — Book Price Calculator backend.
 *
 * This script receives quote data from the website's "Know Your Book Price"
 * calculator, appends it to a Google Sheet, emails a notification, serves
 * as a shared price cache so repeated lookups for the same book don't have
 * to hit an external pricing API again, and logs a lead whenever a
 * customer's book/edition couldn't be priced automatically so no interest
 * gets lost. Three tabs are created automatically on first use: "Quotes",
 * "PriceCache", and "Inquiries".
 *
 * SETUP: see SETUP.md in this same folder for step-by-step instructions.
 * This Sheet and Apps Script project should be created while logged into
 * eBooksWorld3622@gmail.com. You only need to edit SPREADSHEET_ID below —
 * NOTIFY_EMAIL is already set.
 */

// 1. Paste your Google Sheet ID here (the long string in the sheet's URL
//    between /d/ and /edit).
const SPREADSHEET_ID = '1LfDwX3TpEjxzZ3euCWJkBFas0DELaPOLqdHysTM4hE0';

// 2. The email address that receives a notification for every new quote.
const NOTIFY_EMAIL = 'eBooksWorld3622@gmail.com';

// Name of the sheet/tab where quotes are stored.
const SHEET_NAME = 'Quotes';

// Name of the sheet/tab used as the shared price cache, and how long a
// cached price stays valid before a fresh lookup is required.
const CACHE_SHEET_NAME = 'PriceCache';
const CACHE_TTL_HOURS = 24;

const COLUMNS = [
  'Quote ID', 'Date', 'Time', 'Timestamp', 'Country', 'Currency',
  'Book Title', 'Author', 'ISBN', 'Format', 'Retail Price', 'Kitab Guru Price',
  'Discount', 'Price Source', 'Source Marketplace/Country', 'Reference Link',
  'Contact Method', 'Quote Status'
];

const CACHE_COLUMNS = [
  'ISBN', 'Country', 'Format', 'Book Title', 'Currency', 'Retail Price',
  'Price Source', 'Reference Link', 'Timestamp'
];

// Sheet/tab that logs a lead every time a customer's book/edition
// couldn't be priced automatically and they were offered a way to
// message the team instead -- so nothing gets lost even when the
// calculator itself comes up empty.
const INQUIRY_SHEET_NAME = 'Inquiries';
const INQUIRY_COLUMNS = [
  'Timestamp', 'Country', 'Book Title', 'Author', 'Edition', 'ISBN'
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'saveQuote';

    if (action === 'saveQuote') return handleSaveQuote(body);
    if (action === 'updateContactMethod') return handleUpdateContactMethod(body);
    if (action === 'getCachedPrice') return handleGetCachedPrice(body);
    if (action === 'cachePrice') return handleCachePrice(body);
    if (action === 'logInquiry') return handleLogInquiry(body);
    if (action === 'checkRetailerPrice') return handleCheckRetailerPrice(body);
    if (action === 'debugRetailerPrice') return handleDebugRetailerPrice(body);

    return jsonResponse({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function handleSaveQuote(data) {
  const sheet = getSheet_();
  const now = new Date();

  sheet.appendRow([
    data.quoteId || '',
    Utilities.formatDate(now, 'Etc/UTC', 'yyyy-MM-dd'),
    Utilities.formatDate(now, 'Etc/UTC', 'HH:mm:ss'),
    now.toISOString(),
    data.country || '',
    data.currency || '',
    data.bookTitle || '',
    data.author || '',
    data.isbn || '',
    data.format || '',
    data.retailPrice || '',
    data.kitabGuruPrice || '',
    data.discount || '',
    data.priceSource || '',
    data.sourceMarketplace || '',
    data.referenceLink || '',
    data.contactMethod || '',
    'New'
  ]);

  sendNotificationEmail_(data);

  return jsonResponse({ ok: true, quoteId: data.quoteId });
}

function handleUpdateContactMethod(data) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const quoteIdCol = COLUMNS.indexOf('Quote ID');
  const contactCol = COLUMNS.indexOf('Contact Method');

  for (let i = 1; i < values.length; i++) {
    if (values[i][quoteIdCol] === data.quoteId) {
      sheet.getRange(i + 1, contactCol + 1).setValue(data.contactMethod || '');
      return jsonResponse({ ok: true });
    }
  }
  return jsonResponse({ ok: false, error: 'Quote ID not found' });
}

function handleLogInquiry(data) {
  const sheet = getInquirySheet_();
  sheet.appendRow([
    new Date().toISOString(),
    data.country || '',
    data.bookTitle || '',
    data.author || '',
    data.edition || '',
    data.isbn || ''
  ]);
  return jsonResponse({ ok: true });
}

function getInquirySheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(INQUIRY_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(INQUIRY_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(INQUIRY_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ── Retailer price fallback (TextbookX) ─────────────────────────────────
// Doesn't have a public pricing API, so this fetches its real pages
// server-side (a browser can't do this itself -- most sites don't allow
// cross-origin reads of their raw HTML) and reads the price straight out
// of the page. The frontend only calls this once Google Books has
// already come up empty for a book. Prices in USD regardless of visitor
// location, so the frontend converts to the customer's own currency the
// same way it already does for other cross-market reference prices.
//
// VitalSource was tried too, but dropped: its search page's behavior
// turned out to be inconsistent between identical requests (sometimes a
// direct redirect to the product page with real price data, sometimes a
// results page that loads everything via client-side JavaScript we have
// no way to run server-side) -- not reliable enough to keep active.
function handleCheckRetailerPrice(data) {
  const isbn = data.isbn || '';
  const hit = tryTextbookX_(isbn);
  if (!hit) return jsonResponse({ ok: false });
  return jsonResponse(Object.assign({ ok: true }, hit));
}

// TEMPORARY — diagnostic only, not called by the site. Shows exactly what
// the backend actually saw for a given ISBN, so a failure can be diagnosed
// instead of guessed at. Safe to delete once TextbookX is confirmed working.
function handleDebugRetailerPrice(data) {
  const isbn = (data && data.isbn) || '9780573705144';
  const url = 'https://www.textbookx.com/fastsearch2.php?s=' + encodeURIComponent(isbn) + '&product=book&act=new';
  const hops = [];
  let current = url;
  let final = null;
  for (let i = 0; i < 5; i++) {
    let res;
    try {
      res = UrlFetchApp.fetch(current, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { 'User-Agent': RETAILER_USER_AGENT }
      });
    } catch (e) {
      hops.push({ url: current, error: String(e) });
      break;
    }
    const code = res.getResponseCode();
    const headers = res.getHeaders();
    hops.push({ url: current, code: code, location: headers['Location'] || headers['location'] || null });
    if (code >= 300 && code < 400) {
      const location = headers['Location'] || headers['location'];
      if (!location) break;
      current = resolveUrl_(current, location);
      continue;
    }
    if (code === 200) final = { url: current, html: res.getContentText() };
    break;
  }
  if (!final) return jsonResponse({ ok: false, stage: 'fetch failed or no redirect resolved', hops: hops });
  const prices = extractPrices_(final.html);
  const dollarIndex = final.html.indexOf('7.74');
  return jsonResponse({
    ok: true,
    hops: hops,
    finalUrl: final.url,
    htmlLength: final.html.length,
    matchedProductPage: final.url.indexOf('/book/') !== -1,
    extractedPrices: prices,
    knownPriceFound: dollarIndex !== -1,
    knownPriceContext: dollarIndex !== -1 ? final.html.slice(Math.max(0, dollarIndex - 60), dollarIndex + 20) : null,
    htmlSnippet: final.html.slice(0, 500)
  });
}

// UrlFetchApp can follow redirects itself, but never tells you the URL it
// landed on -- and that final URL IS the product page we need to link to
// as the source. So redirects are followed by hand here instead, one hop
// at a time, keeping track of exactly where each request ends up.
//
// UrlFetchApp's own default User-Agent gets flatly 403'd by VitalSource
// (confirmed directly) -- a real browser UA is required.
const RETAILER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Apps Script's runtime has no URL class to resolve a relative redirect
// against its base (confirmed: "URL is not defined") -- TextbookX's own
// redirect is relative ("/book/12345", not a full https://... URL), so
// this has to be done by hand: absolute/protocol-relative URLs pass
// through untouched, anything else is treated as root-relative to the
// current request's own origin.
function resolveUrl_(base, location) {
  if (/^https?:\/\//i.test(location)) return location;
  const originMatch = base.match(/^(https?:\/\/[^/]+)/i);
  const origin = originMatch ? originMatch[1] : '';
  if (location.indexOf('//') === 0) return (base.match(/^https?:/i) || ['https:'])[0] + location;
  if (location.indexOf('/') === 0) return origin + location;
  return origin + '/' + location;
}

function fetchFollowingRedirects_(url) {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = UrlFetchApp.fetch(current, {
      muteHttpExceptions: true,
      followRedirects: false,
      headers: { 'User-Agent': RETAILER_USER_AGENT }
    });
    const code = res.getResponseCode();
    if (code >= 300 && code < 400) {
      const headers = res.getHeaders();
      const location = headers['Location'] || headers['location'];
      if (!location) return null;
      current = resolveUrl_(current, location);
      continue;
    }
    if (code !== 200) return null;
    return { url: current, html: res.getContentText() };
  }
  return null;
}

// Price shows up in two different forms depending on the page: some
// templates embed it as plain "price":"12.34" / "price": 12.34 in the
// page's own JSON-LD/structured data, others just render it as visible
// text like "$12.34" with no structured data at all (confirmed both
// happen on TextbookX depending on the listing). Catch both forms and
// let the caller decide which instance to use. A "$0.00" placeholder
// (sample chapters, out-of-stock markers) is filtered out by requiring > 0.
function extractPrices_(html) {
  const jsonMatches = html.match(/"price"\s*:\s*"?(\d+\.\d{2})"?/g) || [];
  const dollarMatches = html.match(/\$\s?(\d+\.\d{2})/g) || [];
  const prices = [];
  jsonMatches.concat(dollarMatches).forEach(function(m) {
    const n = m.match(/(\d+\.\d{2})/);
    if (n) {
      const val = parseFloat(n[1]);
      if (val > 0) prices.push(val);
    }
  });
  return prices;
}

function tryVitalSource_(isbn) {
  if (!isbn) return null;
  try {
    const result = fetchFollowingRedirects_('https://www.vitalsource.com/search?term=' + encodeURIComponent(isbn));
    if (!result || result.url.indexOf('/products/') === -1) return null;
    const prices = extractPrices_(result.html);
    if (!prices.length) return null;
    return {
      retailPrice: Math.min.apply(null, prices),
      currency: 'USD',
      format: 'eBook (VitalSource)',
      sourceLabel: 'VitalSource',
      referenceLink: result.url
    };
  } catch (e) {
    return null;
  }
}

function tryTextbookX_(isbn) {
  if (!isbn) return null;
  try {
    const result = fetchFollowingRedirects_('https://www.textbookx.com/fastsearch2.php?s=' + encodeURIComponent(isbn) + '&product=book&act=new');
    if (!result || result.url.indexOf('/book/') === -1) return null;
    const prices = extractPrices_(result.html);
    if (!prices.length) return null;
    return {
      retailPrice: Math.min.apply(null, prices),
      currency: 'USD',
      format: 'Book (TextbookX)',
      sourceLabel: 'TextbookX',
      referenceLink: result.url
    };
  } catch (e) {
    return null;
  }
}

// ── Shared price cache ───────────────────────────────────────────────────
// Keyed by ISBN + country + format. This is a protection layer, not the
// primary reliability mechanism — the frontend's PRICE_SOURCES fallback
// chain still has to work on its own for books nobody has searched before.

function cacheKey_(isbn, country, format) {
  return [isbn, country, format || ''].join('|');
}

function handleGetCachedPrice(data) {
  const sheet = getCacheSheet_();
  const values = sheet.getDataRange().getValues();
  const isbnCol = CACHE_COLUMNS.indexOf('ISBN');
  const countryCol = CACHE_COLUMNS.indexOf('Country');
  const formatCol = CACHE_COLUMNS.indexOf('Format');
  const currencyCol = CACHE_COLUMNS.indexOf('Currency');
  const priceCol = CACHE_COLUMNS.indexOf('Retail Price');
  const sourceCol = CACHE_COLUMNS.indexOf('Price Source');
  const linkCol = CACHE_COLUMNS.indexOf('Reference Link');
  const tsCol = CACHE_COLUMNS.indexOf('Timestamp');

  const wantKey = cacheKey_(data.isbn, data.country, data.format);
  const cutoff = Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowKey = cacheKey_(row[isbnCol], row[countryCol], row[formatCol]);
    if (rowKey !== wantKey) continue;

    const ts = new Date(row[tsCol]).getTime();
    if (isNaN(ts) || ts < cutoff) return jsonResponse({ ok: true, hit: false });

    return jsonResponse({
      ok: true,
      hit: true,
      currency: row[currencyCol],
      retailPrice: row[priceCol],
      format: row[formatCol],
      priceSource: row[sourceCol],
      referenceLink: row[linkCol]
    });
  }
  return jsonResponse({ ok: true, hit: false });
}

function handleCachePrice(data) {
  const sheet = getCacheSheet_();
  const values = sheet.getDataRange().getValues();
  const isbnCol = CACHE_COLUMNS.indexOf('ISBN');
  const countryCol = CACHE_COLUMNS.indexOf('Country');
  const formatCol = CACHE_COLUMNS.indexOf('Format');
  const wantKey = cacheKey_(data.isbn, data.country, data.format);
  const now = new Date();

  const row = [
    data.isbn || '', data.country || '', data.format || '', data.title || '',
    data.currency || '', data.retailPrice || '', data.priceSource || '',
    data.referenceLink || '', now.toISOString()
  ];

  for (let i = 1; i < values.length; i++) {
    const rowKey = cacheKey_(values[i][isbnCol], values[i][countryCol], values[i][formatCol]);
    if (rowKey === wantKey) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return jsonResponse({ ok: true, updated: true });
    }
  }

  sheet.appendRow(row);
  return jsonResponse({ ok: true, updated: false });
}

function getCacheSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CACHE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CACHE_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CACHE_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sendNotificationEmail_(data) {
  if (!NOTIFY_EMAIL) return;

  const subject = 'New KG Quote ' + (data.country || '');
  const body = [
    'New Kitab Guru Quote',
    '',
    'Quote ID: ' + (data.quoteId || ''),
    'Country: ' + (data.country || ''),
    'Book: ' + (data.bookTitle || ''),
    'Author: ' + (data.author || ''),
    'ISBN: ' + (data.isbn || ''),
    'Format: ' + (data.format || ''),
    'Retail Price: ' + (data.currency || '') + ' ' + (data.retailPrice || ''),
    'Kitab Guru Price: ' + (data.currency || '') + ' ' + (data.kitabGuruPrice || ''),
    'Discount: ' + (data.discount || ''),
    'Currency: ' + (data.currency || ''),
    'Price Source: ' + (data.priceSource || ''),
    'Reference Link: ' + (data.referenceLink || 'N/A'),
    'Contact Method: ' + (data.contactMethod || 'Not yet chosen'),
    'Date/Time: ' + new Date().toString()
  ].join('\n');

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Simple health check — visiting the deployed web app URL in a browser
// (GET request) should show this instead of an error.
function doGet(e) {
  return jsonResponse({ ok: true, message: 'Kitab Guru quote endpoint is live.' });
}
