const { google } = require('googleapis');
require('dotenv').config();

// We expect GOOGLE_SHEET_ID to be provided in environment variables.
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

let sheetsClient = null;

/**
 * Initialize and authenticate the Google Sheets API client.
 * Returns the authenticated client or throws an error.
 */
const getAuthClient = async () => {
    if (sheetsClient) return sheetsClient;

    try {
        // Authenticate using Application Default Credentials
        // In local development, you must set GOOGLE_APPLICATION_CREDENTIALS
        // environment variable to the path of your Service Account JSON file.
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
        return sheetsClient;
    } catch (error) {
        console.error(`[Google Sheets Service] Failed to authenticate with Google Sheets API:`, error.message);
        console.error(`[Google Sheets Service] Error stack:`, error.stack);
        throw error;
    }
};

/**
 * Fetch values from a specific range.
 * @param {string} range (e.g., 'Sheet1!A1:B2')
 */
const getSheetData = async (range) => {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set.');

    const client = await getAuthClient();
    try {
        const response = await client.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range
        });
        return response.data.values; // Returns array of arrays
    } catch (error) {
        console.error(`[Google Sheets Service] Error reading data from range ${range}:`, error.message);
        console.error(`[Google Sheets Service] Error stack:`, error.stack);
        throw error;
    }
};

/**
 * Append a row of data to a specific range.
 * @param {string} range (e.g., 'Sheet1!A:C')
 * @param {Array} values Array containing row arrays (e.g., [[val1, val2, ...]])
 */
const appendSheetData = async (range, values) => {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set.');

    const client = await getAuthClient();
    try {
        console.log(`[Google Sheets Service] Appending data to range ${range}, rows count:`, values ? values.length : 0, `data:`, values);
        const response = await client.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: values
            }
        });
        return response.data;
    } catch (error) {
        console.error(`[Google Sheets Service] Error appending data to range ${range}:`, error.message);
        console.error(`[Google Sheets Service] Error stack:`, error.stack);
        throw error;
    }
};

/**
 * Update a specific range of data.
 * @param {string} range (e.g., 'PlayerMasterData!A2:F2')
 * @param {Array} values Array containing row arrays (e.g., [[val1, val2, ...]])
 */
const updateSheetData = async (range, values) => {
    if (!SPREADSHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set.');

    const client = await getAuthClient();
    try {
        console.log(`[Google Sheets Service] Updating data in range ${range}, rows count:`, values ? values.length : 0, `data:`, values);
        const response = await client.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: values
            }
        });
        return response.data;
    } catch (error) {
        console.error(`[Google Sheets Service] Error updating data to range ${range}:`, error.message);
        console.error(`[Google Sheets Service] Error stack:`, error.stack);
        throw error;
    }
};

module.exports = {
    getSheetData,
    appendSheetData,
    updateSheetData
};
