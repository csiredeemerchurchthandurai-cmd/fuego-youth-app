import { useState, useEffect, useCallback } from 'react';
import { X, Edit3, Check, Calendar, MessageSquare, Star, Trash2, Phone, Mail, MapPin, Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Alert } from '@/components/ui';
import type { YouthMember, AttendanceRecord, MemberFeedback, AttendanceFeedback } from '@/types';

interface MemberDetailDrawerProps {
  member: YouthMember;
  onClose: () => void;
  onUpdated: () => void;
}

export function MemberDetailDrawer({ member, onClose, onUpdated }: MemberDetailDrawerProps) {
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(member.full_name);
  const [phone, setPhone] = useState(member.phone);
  const [email, setEmail] = useState(member.email);
  const [dob, setDob] = useState(member.date_of_birth || '');
  const [address, setAddress] = useState(member.address || '');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [feedback, setFeedback] = useState<MemberFeedback[]>([]);
  const [attFeedback, setAttFeedback] = useState<AttendanceFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'details' | 'attendance' | 'feedback'>('details');

  const isSuperAdmin = profile?.role === 'super_admin';

  // New feedback form
  const [feedbackText, setFeedbackText] = useState('');
  const [rating, setRating] = useState(3);

  const fetchData = useCallback(async () => {
    const { data: attData } = await supabase
      .from('attendance')
      .select('id, otp_session_id, youth_member_id, church_id, marked_by, attendance_date, created_at, status, feedback_submitted, approved_by, approved_at')
      .eq('youth_member_id', member.id)
      .order('attendance_date', { ascending: false });
    if (attData) setAttendance(attData as AttendanceRecord[]);

    if (isSuperAdmin) {
      const { data: fbData } = await supabase.from('member_feedback').select('id, youth_member_id, given_by, given_by_role, feedback_text, rating, created_at').eq('youth_member_id', member.id).order('created_at', { ascending: false });
      if (fbData) setFeedback(fbData as MemberFeedback[]);

      // Fetch attendance feedback (only super_admin can read)
      const { data: attFbData } = await supabase.from('attendance_feedback').select('id, attendance_id, youth_member_id, feedback_text, rating, created_at').eq('youth_member_id', member.id).order('created_at', { ascending: false });
      if (attFbData) setAttFeedback(attFbData as AttendanceFeedback[]);
    }
  }, [member.id, isSuperAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveEdit = async () => {
    setError(null);
    const { error: updateError } = await supabase.from('youth_members').update({
      full_name: fullName,
      phone,
      email,
      date_of_birth: dob || null,
      address,
    }).eq('id', member.id);
    if (updateError) { setError(updateError.message); return; }
    setEditing(false);
    setSuccess('Member updated successfully!');
    onUpdated();
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const addFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    const { error: insertError } = await supabase.from('member_feedback').insert({
      youth_member_id: member.id,
      given_by: profile.id,
      given_by_role: profile.role,
      feedback_text: feedbackText,
      rating,
    });
    if (insertError) { setError(insertError.message); return; }
    setFeedbackText('');
    setRating(3);
    setSuccess('Feedback added!');
    fetchData();
    setTimeout(() => setSuccess(null), 3000);
  };

  const deleteFeedback = async (id: string) => {
    if (!confirm('Delete this feedback?')) return;
    const { error: delError } = await supabase.from('member_feedback').delete().eq('id', id);
    if (delError) { setError(delError.message); return; }
    fetchData();
  };

  const attendanceCount = attendance.length;
  const recentAttendance = attendance.slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-orange-500 to-red-600 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
              {member.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold">{member.full_name}</h2>
              <p className="text-xs text-orange-100">Member Details</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {error && <div className="m-4"><Alert type="error" message={error} /></div>}
        {success && <div className="m-4"><Alert type="success" message={success} /></div>}

        {/* Tabs */}
        <div className="flex gap-1 p-4 border-b border-gray-100 sticky top-[88px] bg-white z-10">
          {([
            { key: 'details', label: 'Details', icon: <Edit3 size={14} /> },
            { key: 'attendance', label: `Attendance (${attendanceCount})`, icon: <Calendar size={14} /> },
            ...(isSuperAdmin ? [{ key: 'feedback' as const, label: `Feedback (${feedback.length + attFeedback.length})`, icon: <MessageSquare size={14} /> }] : []),
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Details Tab */}
        {tab === 'details' && (
          <div className="p-5 space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Full Name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Date of Birth</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Address</label>
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    <Check size={16} /> Save
                  </button>
                  <button onClick={() => { setEditing(false); setFullName(member.full_name); setPhone(member.phone); setEmail(member.email); setDob(member.date_of_birth || ''); setAddress(member.address || ''); }} className="text-gray-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 text-sm">Personal Information</h3>
                  <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-orange-600 text-sm font-semibold hover:text-orange-700 transition-colors">
                    <Edit3 size={14} /> Edit
                  </button>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <Phone size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{phone || 'No phone set'}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <Mail size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{email || 'No email set'}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <Cake size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{dob ? new Date(dob).toLocaleDateString() : 'No DOB set'}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <MapPin size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-700">{address || 'No address set'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-orange-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-orange-700">{attendanceCount}</div>
                    <div className="text-xs text-orange-600 font-medium">Total Attendance</div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-blue-700">{feedback.length}</div>
                    <div className="text-xs text-blue-600 font-medium">Feedback Count</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Attendance Tab */}
        {tab === 'attendance' && (
          <div className="p-5">
            {recentAttendance.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No attendance records yet.</p>
            ) : (
              <div className="space-y-2">
                {recentAttendance.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                      a.status === 'approved' ? 'bg-emerald-100' : a.status === 'rejected' ? 'bg-red-100' : 'bg-amber-100'
                    }`}>
                      <Calendar size={16} className={a.status === 'approved' ? 'text-emerald-600' : a.status === 'rejected' ? 'text-red-600' : 'text-amber-600'} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">{new Date(a.attendance_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div className="text-xs text-gray-400">Marked at {new Date(a.created_at).toLocaleTimeString()}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                      a.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : a.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                    }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feedback Tab — super_admin only */}
        {tab === 'feedback' && isSuperAdmin && (
          <div className="p-5 space-y-4">
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex items-center gap-2">
              <MessageSquare size={16} className="text-purple-600" />
              <p className="text-xs text-purple-700 font-medium">Session feedback is only visible to Super Admin.</p>
            </div>

            {/* Attendance session feedback */}
            {attFeedback.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Session Feedback ({attFeedback.length})</h3>
                <div className="space-y-3">
                  {attFeedback.map((f) => (
                    <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={14} className={n <= f.rating ? 'fill-orange-400 text-orange-400' : 'text-gray-200'} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-gray-700">{f.feedback_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={addFeedback} className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-gray-900 text-sm">Add Leader Feedback</h3>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} className="p-1">
                      <Star size={20} className={n <= rating ? 'fill-orange-400 text-orange-400' : 'text-gray-300'} />
                    </button>
                  ))}
                </div>
              </div>
              <textarea required value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} placeholder="Write your feedback..." rows={3} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">Submit Feedback</button>
            </form>

            <div>
              <h3 className="font-semibold text-gray-900 text-sm mb-3">Leader Feedback ({feedback.length})</h3>
              {feedback.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No leader feedback recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {feedback.map((f) => (
                    <div key={f.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={14} className={n <= f.rating ? 'fill-orange-400 text-orange-400' : 'text-gray-200'} />
                          ))}
                        </div>
                        <button onClick={() => deleteFeedback(f.id)} className="p-1 text-gray-300 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="text-sm text-gray-700">{f.feedback_text}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">{f.given_by_role.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
