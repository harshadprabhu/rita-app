import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { TicketWithRelations } from '../../types/ticket';

function ticketRows(tickets: TicketWithRelations[]) {
  return tickets.map((t) => ({
    'Ticket #': t.ticket_number,
    Store: t.store?.name ?? '',
    Requester: t.requester?.display_name ?? '',
    Assignee: t.assignee?.display_name ?? '',
    Category: t.category ?? '',
    Priority: t.priority,
    Status: t.status,
    Lifecycle: t.lifecycle,
    'SLA Breached': t.sla_breached ? 'Yes' : 'No',
    'Created At': t.created_at,
    'Resolved At': t.resolved_at ?? '',
  }));
}

export async function exportTicketsToPdf(tickets: TicketWithRelations[]): Promise<void> {
  const rows = ticketRows(tickets);
  const tableRows = rows
    .map(
      (r) => `<tr>${Object.values(r).map((v) => `<td style="padding:4px;border:1px solid #ccc;font-size:10px;">${v}</td>`).join('')}</tr>`,
    )
    .join('');
  const headerCells = Object.keys(rows[0] ?? {})
    .map((h) => `<th style="padding:4px;border:1px solid #ccc;background:#1B3A7A;color:#fff;font-size:10px;">${h}</th>`)
    .join('');
  const html = `
    <html><body>
      <h2 style="font-family:sans-serif;color:#1B3A7A;">RITA Ticket Export</h2>
      <table style="border-collapse:collapse;width:100%;">
        <tr>${headerCells}</tr>
        ${tableRows}
      </table>
    </body></html>
  `;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  }
}

export async function exportTicketsToSpreadsheet(tickets: TicketWithRelations[]): Promise<void> {
  const rows = ticketRows(tickets);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');
  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

  const path = `${FileSystem.cacheDirectory}rita-tickets-${Date.now()}.xlsx`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
}
