import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type AttendanceExportRow = { name: string; church?: string; inStatus: string; outStatus: string; result: string };
export type AttendanceExportData = {
  eventTitle: string;
  eventDate: string;
  venue?: string | null;
  scopeLabel?: string;      // church name shown in the heading and file name
  showChurch?: boolean;     // add a Church column (events with several churches)
  rows: AttendanceExportRow[];
};

const slug = (value: string) => value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const count = (rows: AttendanceExportRow[], result: string) => rows.filter((row) => row.result === result).length;
const baseName = (data: AttendanceExportData) => `attendance-${slug(data.eventTitle)}-${data.eventDate}${data.scopeLabel ? `-${slug(data.scopeLabel)}` : ''}`;
const prettyDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString();
const header = (data: AttendanceExportData) => ['No.', 'Name', ...(data.showChurch ? ['Church'] : []), 'IN', 'OUT', 'Attendance'];
const body = (data: AttendanceExportData) => data.rows.map((row, index) => [index + 1, row.name, ...(data.showChurch ? [row.church || ''] : []), row.inStatus, row.outStatus, row.result]);

// One Excel file (.xlsx) for one event
export function downloadAttendanceExcel(data: AttendanceExportData) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Attendance log'],
    ['Event', data.eventTitle],
    ['Date', prettyDate(data.eventDate)],
    ['Venue', data.venue || ''],
    ...(data.scopeLabel ? [['Church', data.scopeLabel]] : []),
    ['Present', count(data.rows, 'Present'), 'Absent', count(data.rows, 'Absent'), 'Pending', count(data.rows, 'Pending')],
    [],
    header(data),
    ...body(data),
  ]);
  sheet['!cols'] = [{ wch: 6 }, { wch: 28 }, ...(data.showChurch ? [{ wch: 22 }] : []), { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Attendance');
  XLSX.writeFile(book, `${baseName(data)}.xlsx`);
}

// One PDF for one event
export function downloadAttendancePdf(data: AttendanceExportData) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Attendance log', 14, 18);
  doc.setFontSize(12);
  doc.text(data.eventTitle, 14, 26);
  doc.setFontSize(9);
  doc.text(`${prettyDate(data.eventDate)}${data.venue ? ` · ${data.venue}` : ''}${data.scopeLabel ? ` · ${data.scopeLabel}` : ''}`, 14, 32);
  doc.text(`Present ${count(data.rows, 'Present')}    Absent ${count(data.rows, 'Absent')}    Pending ${count(data.rows, 'Pending')}`, 14, 38);
  autoTable(doc, {
    head: [header(data)],
    body: body(data),
    startY: 44,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [249, 115, 22] },
  });
  doc.save(`${baseName(data)}.pdf`);
}