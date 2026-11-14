// Supabase Edge Function: sends web push notifications for new circulars, requests and comments,
// and a reminder 5 minutes before each event starts (called every minute by pg_cron).
// Trigger it with Database Webhooks (see setup notes).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const GLOBAL_ROLES = ['super_admin', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor'];

// Event times are stored without a time zone, so they are read in this zone (change with the EVENT_TIMEZONE secret)
const TIMEZONE = Deno.env.get('EVENT_TIMEZONE') || 'Asia/Kolkata';
const REMINDER_MINUTES = 5;

function nowInTimezone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    seconds: Number(get('hour')) * 3600 + Number(get('minute')) * 60 + Number(get('second')),
  };
}

function timeToSeconds(time: string) {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + (seconds || 0);
}

// Who an event is for: a church event goes to that church; a pastorate event goes to everyone,
// or only to the chosen groups / youth members when the convener limited it
type EventRow = { scope: string; church_id: string | null; audience_roles?: string[] | null; audience_member_ids?: string[] | null; audience_user_ids?: string[] | null };

async function eventRecipients(event: EventRow): Promise<string[]> {
  let recipientIds: string[] = [];
  const limitedRoles: string[] = event.audience_roles ?? [];
  const limitedMembers: string[] = event.audience_member_ids ?? [];
  const limitedUsers: string[] = event.audience_user_ids ?? [];
  if (event.scope === 'pastorate' && (limitedRoles.length > 0 || limitedMembers.length > 0 || limitedUsers.length > 0)) {
    recipientIds.push(...limitedUsers);
    if (limitedRoles.length > 0) {
      const { data: byRole } = await supabase.from('profiles').select('id').in('role', limitedRoles);
      recipientIds.push(...(byRole ?? []).map((row) => row.id));
    }
    if (limitedMembers.length > 0) {
      const { data: byMember } = await supabase.from('youth_member_profiles').select('id').in('youth_member_id', limitedMembers);
      recipientIds.push(...(byMember ?? []).map((row) => row.id));
    }
  } else {
    let query = supabase.from('profiles').select('id');
    if (event.scope === 'local' && event.church_id) query = query.eq('church_id', event.church_id);
    const { data: people } = await query;
    recipientIds = (people ?? []).map((row) => row.id);
  }
  return recipientIds;
}

async function sendEventReminders() {
  const now = nowInTimezone();
  const tomorrow = new Date(`${now.date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);

  const { data: events } = await supabase
    .from('youth_events')
    .select('id, title, venue, event_date, start_time, scope, church_id, audience_roles, audience_member_ids, audience_user_ids')
    .in('event_date', [now.date, tomorrowDate])
    .not('start_time', 'is', null)
    .is('reminder_sent_at', null);

  for (const event of events ?? []) {
    const dayOffset = event.event_date === now.date ? 0 : 86400;
    const secondsUntilStart = dayOffset + timeToSeconds(event.start_time) - now.seconds;
    // Remind once, when the event is 5 minutes (or less) away and has not started
    if (secondsUntilStart > REMINDER_MINUTES * 60 || secondsUntilStart < -60) continue;

    // Claim the reminder so it is only ever sent once, even if two checks overlap
    const { data: claimed } = await supabase
      .from('youth_events')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', event.id)
      .is('reminder_sent_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    const recipientIds = await eventRecipients(event);

    const time = event.start_time.slice(0, 5);
    await sendTo(recipientIds, {
      title: `Starting soon: ${event.title}`,
      body: `Starts at ${time}${event.venue ? ` · ${event.venue}` : ''}`,
      tag: `event-reminder-${event.id}`,
    }, null, 'events');
  }
}

// Who a circular is addressed to (same rules as the app): "youth_member" = youth members plus the leaders around them
const YOUTH_AUDIENCE_ROLES = ['youth_member', 'local_youth_secretary', 'local_youth_treasurer', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor', 'pc_member'];
const ROLE_AUDIENCES = ['local_youth_secretary', 'local_youth_treasurer', 'pc_member', 'pastorate_convenor', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'church_admin'];

function audienceIncludes(audience: string | null, role: string) {
  if (role === 'super_admin' || role === 'church_admin') return true;
  if (!audience || audience === 'all') return true;
  if (audience === 'youth_member') return YOUTH_AUDIENCE_ROLES.includes(role);
  if (ROLE_AUDIENCES.includes(audience)) return audience === role;
  return true;
}

type Payload = { title: string; body: string; url?: string; tag?: string };

async function usersWithRole(role: string, churchId: string): Promise<string[]> {
  let query = supabase.from('profiles').select('id').eq('role', role);
  if (!GLOBAL_ROLES.includes(role)) query = query.eq('church_id', churchId);
  const { data } = await query;
  return (data ?? []).map((row) => row.id);
}

// Who receives a request: the chosen role in the chosen churches (all churches, some churches, or the sender's own church)
async function requestRecipients(request: { recipient_role: string; church_id: string; target_all_churches?: boolean | null; target_church_ids?: string[] | null }) {
  if (GLOBAL_ROLES.includes(request.recipient_role)) return usersWithRole(request.recipient_role, request.church_id);
  if (request.target_all_churches) {
    const { data } = await supabase.from('profiles').select('id').eq('role', request.recipient_role);
    return (data ?? []).map((row) => row.id);
  }
  if (request.target_church_ids && request.target_church_ids.length > 0) {
    const { data } = await supabase.from('profiles').select('id').eq('role', request.recipient_role).in('church_id', request.target_church_ids);
    return (data ?? []).map((row) => row.id);
  }
  return usersWithRole(request.recipient_role, request.church_id);
}

// The settings switches on the Notifications page (one column per kind in notification_preferences)
const CATEGORIES = ['circulars', 'events', 'minutes', 'requests', 'download_access'] as const;
type Category = (typeof CATEGORIES)[number];

// Sends to every saved device of the given people, except those who switched this kind off. Returns what happened.
async function sendTo(userIds: string[], payload: Payload, excludeId?: string | null, category?: Category) {
  let ids = [...new Set(userIds)].filter((id) => id && id !== excludeId);
  const result = { people: 0, devices: 0, sent: 0, failed: 0, errors: [] as string[] };
  if (ids.length === 0) return result;

  if (category && CATEGORIES.includes(category)) {
    const { data: off } = await supabase.from('notification_preferences').select('user_id').in('user_id', ids).eq(category, false);
    const blocked = new Set((off ?? []).map((row) => row.user_id));
    ids = ids.filter((id) => !blocked.has(id));
    if (ids.length === 0) return result;
  }
  result.people = ids.length;

  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', ids);
  result.devices = (subs ?? []).length;
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ url: '/', ...payload }));
      result.sent++;
    } catch (error) {
      result.failed++;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        // Shows up in Supabase -> Edge Functions -> send-push -> Logs (for example 403 from Apple = wrong VAPID_SUBJECT or keys)
        const detail = `${status ?? 'error'} ${(error as { body?: string }).body ?? (error as Error).message ?? ''}`.trim();
        console.error('Push failed:', new URL(sub.endpoint).host, detail);
        result.errors.push(detail);
      }
    }
  }));
  return result;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json();

  // "Send test notification" button: a signed-in person sends a test to their own devices
  if (body.type === 'SELF_TEST') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await supabase.auth.getUser(token);
    if (!auth.user) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    const result = await sendTo([auth.user.id], { title: 'Fuego test notification', body: 'Notifications are working on this device.', tag: 'self-test' });
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  const { type, table, record, old_record } = body;

  if (type === 'EVENT_REMINDERS') {
    await sendEventReminders();
    return new Response('ok');
  }

  if (table === 'circulars' && type === 'INSERT') {
    let query = supabase.from('profiles').select('id, role');
    // A church circular goes to that church plus the pastorate/super admin roles; a null church means everyone
    if (record.church_id) query = query.or(`church_id.eq.${record.church_id},role.in.(${GLOBAL_ROLES.join(',')})`);
    const { data } = await query;
    const audience = (data ?? []).filter((row) => audienceIncludes(record.target_audience, row.role));
    await sendTo(audience.map((row) => row.id), { title: 'New circular', body: record.title, tag: `circular-${record.id}` }, record.created_by, 'circulars');
  }

  // New event created: tell everyone it is meant for right away (the 5-minute reminder is sent separately)
  if (table === 'youth_events' && type === 'INSERT') {
    const recipients = await eventRecipients(record);
    const when = [record.event_date, record.start_time ? String(record.start_time).slice(0, 5) : null].filter(Boolean).join(' ');
    await sendTo(recipients, { title: `New event: ${record.title}`, body: `${when}${record.venue ? ` · ${record.venue}` : ''}`, tag: `event-${record.id}` }, record.created_by ?? null, 'events');
  }

  if (table === 'information_requests' && type === 'INSERT') {
    const recipients = await requestRecipients(record);
    await sendTo(recipients, { title: 'New request', body: `${record.requester_name || 'Someone'}: ${record.subject}`, tag: `request-${record.id}` }, record.requested_by, 'requests');
  }

  if (table === 'information_requests' && type === 'UPDATE' && old_record?.status === 'pending' && record.status !== 'pending') {
    await sendTo([record.requested_by], { title: `Request ${record.status}`, body: record.subject, tag: `request-${record.id}` }, record.decided_by, 'requests');
  }

  if (table === 'request_comments' && type === 'INSERT') {
    const { data: request } = await supabase.from('information_requests').select('requested_by, recipient_role, church_id, subject, target_all_churches, target_church_ids').eq('id', record.request_id).maybeSingle();
    if (request) {
      const recipients = [request.requested_by, ...(await requestRecipients(request))];
      await sendTo(recipients, { title: `New comment: ${request.subject}`, body: `${record.author_name || 'Someone'}: ${String(record.body).slice(0, 100)}`, tag: `request-${record.request_id}` }, record.author_id, 'requests');
    }
  }

  // Download access decided by the Super Admin (or expired): tell the person it concerns
  if (table === 'member_export_access' && type === 'UPDATE' && old_record?.status !== record.status) {
    const messages: Record<string, { title: string; body: string }> = {
      approved: { title: 'Download access approved', body: 'You can download member lists with full details for the next 5 hours.' },
      rejected: { title: old_record?.status === 'approved' ? 'Download access revoked' : 'Download access declined', body: 'Member lists with full details are no longer available to you.' },
      expired: { title: 'Download access expired', body: 'Your 5 hours are over. Request access again if you still need the full details.' },
    };
    const message = messages[record.status];
    if (message) await sendTo([record.user_id], { ...message, tag: `export-access-${record.user_id}` }, null, 'download_access');
  }

  // Minutes published: tell everyone in that church (youth members, church admin, local and pastorate admins, PC members)
  if (table === 'minute_books') {
    const justPublished = record.status === 'published' && (type === 'INSERT' || (type === 'UPDATE' && old_record?.status !== 'published'));
    if (justPublished) {
      const { data: people } = await supabase.from('profiles').select('id').eq('church_id', record.church_id);
      await sendTo((people ?? []).map((row) => row.id), { title: 'New minutes published', body: `${record.title} (${record.meeting_date})`, tag: `minutes-${record.id}` }, record.created_by, 'minutes');
    }
  }

  return new Response('ok');
});