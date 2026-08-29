/**
 * Kitab Guru — Book Price Calculator backend.
 *
 * This script receives quote data from the website's "Know Your Book Price"
 * calculator, appends it to a Google Sheet, and emails a notification.
 *
 * SETUP: see SETUP.md in this same folder for step-by-step instructions.
 * You only need to edit the two constants directly below.
 */

// 1. Paste your Google Sheet ID here (the long string in the sheet's URL
//    between /d/ and /edit).
const SPREADSHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';

// 2. The email address that should receive a notification for every new quote.
const NOTIFY_EMAIL = 'PASTE_NOTIFICATION_EMAIL_HERE';

// Name of the sheet/tab inside the spreadsheet where quotes are stored.
const SHEET_NAME = 'Quotes';

const COLUMNS = [
  'Quote ID', 'Date', 'Time', 'Timestamp', 'Country', 'Currency',
  'Book Title', 'Author', 'ISBN', 'Format', 'Retail Price', 'Kitab Guru Price',
  'Discount', 'Price Source', 'Source Marketplace/Country', 'Contact Method',
  'Quote Status'
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'saveQuote';

    if (action === 'saveQuote') {
      return handleSaveQuote(body);
    }
    if (action === 'updateContactMethod') {
      return handleUpdateContactMethod(body);
    }
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
  if (!NOTIFY_EMAIL || NOTIFY_EMAIL.indexOf('PASTE_') === 0) return;

  const subject = 'New Kitab Guru Quote — ' + (data.quoteId || '');
  const body = [
    'New Kitab Guru Quote',
    '',
    'Quote ID: ' + (data.quoteId || ''),
    'Country: ' + (data.country || ''),
    'Book: ' + (data.bookTitle || ''),
    'Author: ' + (data.author || ''),
    'Format: ' + (data.format || ''),
    'Retail Price: ' + (data.currency || '') + ' ' + (data.retailPrice || ''),
    'Kitab Guru Price: ' + (data.currency || '') + ' ' + (data.kitabGuruPrice || ''),
    'Currency: ' + (data.currency || ''),
    'Price Source: ' + (data.priceSource || ''),
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
