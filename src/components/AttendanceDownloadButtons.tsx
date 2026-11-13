import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import type { AttendanceExportData } from '@/lib/attendanceExport';

// "Excel" and "PDF" buttons for the attendance log of the event that is on screen.
// The file-making code is loaded only when a button is pressed.
export function AttendanceDownloadButtons({ data }: { data: AttendanceExportData | null }) {
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'xlsx' | 'pdf') => {
    if (!data) return;
    setBusy(kind);
    setError(null);
    try {
      const lib = await import('@/lib/attendanceExport');
      if (kind === 'xlsx') lib.downloadAttendanceExcel(data);
      else lib.downloadAttendancePdf(data);
    } catch {
      setError('Could not create the file. In the project folder run: npm install xlsx jspdf jspdf-autotable');
    }
    setBusy(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!data || busy !== null} onClick={() => run('xlsx')} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
          <FileSpreadsheet size={15} /> {busy === 'xlsx' ? 'Preparing...' : 'Download Excel'}
        </button>
        <button type="button" disabled={!data || busy !== null} onClick={() => run('pdf')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
          <FileText size={15} /> {busy === 'pdf' ? 'Preparing...' : 'Download PDF'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}