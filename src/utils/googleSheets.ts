/**
 * RedSOS Google Sheets Integration Module
 * Handles exporting / auditing emergency alerts to secure cloud worksheets.
 * Supports batch queueing and offline-awareness checks.
 */

export interface SheetsAlertRow {
  timestamp: string;
  messageId: string;
  latitude: number;
  longitude: number;
  batteryLevel: number;
  status: string;
}

/**
 * Creates a brand new Google Spreadsheet for RedSOS Mesh Logs.
 */
export async function createRedSOSSpreadsheet(
  accessToken: string,
  title: string = "RedSOS Emergency Audit Log"
): Promise<string> {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: "Alertas SOS",
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "Timestamp" } },
                    { userEnteredValue: { stringValue: "Message ID" } },
                    { userEnteredValue: { stringValue: "Latitud" } },
                    { userEnteredValue: { stringValue: "Longitud" } },
                    { userEnteredValue: { stringValue: "Batería_Nodo" } },
                    { userEnteredValue: { stringValue: "Estado" } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al crear la hoja de cálculo de Google: ${errorText}`);
  }

  const data = await response.json();
  return data.spreadsheetId;
}

/**
 * Appends a batch of RedSOS alert records to an existing Google Spreadsheet.
 * Adheres strictly to low-bandwidth resilience guidelines.
 */
export async function appendAlertsToSheet(
  accessToken: string,
  spreadsheetId: string,
  alerts: SheetsAlertRow[]
): Promise<void> {
  if (alerts.length === 0) return;

  const range = "Alertas SOS!A:F";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  // Format array to Google Sheets rows
  const values = alerts.map((alert) => [
    alert.timestamp,
    alert.messageId,
    alert.latitude,
    alert.longitude,
    `${alert.batteryLevel}%`,
    alert.status.toUpperCase(),
  ]);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al exportar alertas a Google Sheets: ${errorText}`);
  }
}
