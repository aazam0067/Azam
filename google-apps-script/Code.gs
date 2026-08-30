/**
 * Kitab Guru — Book Price Calculator backend.
 *
 * This script receives quote data from the website's "Know Your Book Price"
 * calculator, appends it to a Google Sheet, emails a notification, and
 * serves as a shared price cache so repeated lookups for the same book
 * don't have to hit an external pricing API again.
 *
 * SETUP: see SETUP.md in this same folder for step-by-step instructions.
 * This Sheet and Apps Script project should be created while logged into
 * eBooksWorld3622@gmail.com. You only need to edit SPREADSHEET_ID below —
 * NOTIFY_EMAIL is already set.
 */

// 1. Paste your Google Sheet ID here (the long string in the sheet's URL
//    between /d/ and /edit).
const SPREADSHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';

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

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'saveQuote';

    if (action === 'saveQuote') return handleSaveQuote(body);
    if (action === 'updateContactMethod') return handleUpdateContactMethod(body);
    if (action === 'getCachedPrice') return handleGetCachedPrice(body);
    if (action === 'cachePrice') return handleCachePrice(body);

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

  const subject = 'New Kitab Guru Quote — ' + (data.quoteId || '');
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
