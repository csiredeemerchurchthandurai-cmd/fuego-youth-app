import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type FundHistoryRow = {
  changedAt: string;
  weekly: number;
  monthly: number;
  current: number;
  changedBy: string;
};
export type FundHistoryExportData = { churchName: string; rows: FundHistoryRow[] };

const slug = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const fileName = (data: FundHistoryExportData) => `fund-history-${slug(data.churchName || 'church')}-${new Date().toISOString().slice(0, 10)}`;
const head = ['Date and time', 'Weekly offering', 'Monthly contribution', 'Current youth fund', 'Updated by'];
const lines = (data: FundHistoryExportData) => data.rows.map((row) => [new Date(row.changedAt).toLocaleString(), row.weekly, row.monthly, row.current, row.changedBy]);

export function downloadFundHistoryExcel(data: FundHistoryExportData) {
  const sheet = XLSX.utils.aoa_to_sheet([['Fund history'], ['Church', data.churchName], [], head, ...lines(data)]);
  sheet['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 26 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Fund history');
  XLSX.writeFile(book, `${fileName(data)}.xlsx`);
}

export function downloadFundHistoryPdf(data: FundHistoryExportData) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Fund history', 14, 18);
  doc.setFontSize(10);
  doc.text(data.churchName, 14, 25);
  autoTable(doc, {
    head: [head],
    body: lines(data).map((line) => [line[0], `Rs ${line[1]}`, `Rs ${line[2]}`, `Rs ${line[3]}`, line[4]]),
    startY: 32,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [249, 115, 22] },
  });
  doc.save(`${fileName(data)}.pdf`);
}