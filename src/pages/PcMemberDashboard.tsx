import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, ClipboardList, FileText, Send, Users } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';
import { CircularsSection } from '@/components/CircularsSection';
import { MemberDirectory } from '@/components/MemberDirectory';
import { ChurchAttendanceLog } from '@/components/ChurchAttendanceLog';
import { MyChurchEvents } from '@/components/MyChurchEvents';
import { MinuteBook } from '@/components/MinuteBook';
import { InformationRequestsSection } from '@/components/InformationRequestsSection';
import { CountBadge } from '@/components/CountBadge';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { supabase } from '@/lib/supabase';
import type { Church } from '@/types';

type PcView = 'members' | 'attendance' | 'my_events' | 'minutes' | 'circulars' | 'requests';

// PC Member: view every church's youth members and attendance (view only), attend their own church's events,
// send and receive circulars, and send and receive requests.
export function PcMemberDashboard() {
  const [view, setView] = useState<PcView>('members');
  const [churches, setChurches] = useState<Church[]>([]);
  const unread = useUnreadCounts(view === 'requests' ? 'requests' : view === 'circulars' ? 'circulars' : null);

  useEffect(() => {
    supabase.from('churches').select('id, name, location, created_at').order('name').then(({ data }) => {
      if (data) setChurches(data as Church[]);
    });
  }, []);

  const tabs: { key: PcView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'members', label: 'Church Members', icon: <Users size={16} /> },
    { key: 'attendance', label: 'Attendance Log', icon: <ClipboardList size={16} /> },
    { key: 'my_events', label: 'My Church Events', icon: <CalendarDays size={16} /> },
    { key: 'minutes', label: 'Minute Book', icon: <BookOpen size={16} /> },
    { key: 'circulars', label: 'Circulars', icon: <FileText size={16} />, badge: unread.circulars },
    { key: 'requests', label: 'Requests', icon: <Send size={16} />, badge: unread.requests },
  ];

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PC Member Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">View church members and attendance, attend your church's events, and stay in touch with the pastorate.</p>
      </div>

      <div className="w-full max-w-full overflow-x-auto mb-6">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1.5 shadow-sm w-max min-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${view === tab.key ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {tab.icon}
              {tab.label}
              <CountBadge count={tab.badge || 0} />
            </button>
          ))}
        </div>
      </div>

      {view === 'members' && <MemberDirectory churches={churches} />}
      {view === 'attendance' && <ChurchAttendanceLog churches={churches} />}
      {view === 'my_events' && <MyChurchEvents />}
      {view === 'minutes' && <MinuteBook />}
      {view === 'circulars' && <CircularsSection />}
      {view === 'requests' && <InformationRequestsSection mode="both" />}
    </DashboardShell>
  );
}