// Supabase Edge Function: sends web push notifications for new circulars, events, requests, comments,
// minutes and download access, and a reminder 5 minutes before each event starts (called every minute by pg_cron).
// Every call writes a line to the function's Logs saying who it tried to reach and how many pushes were delivered.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const GLOBAL_ROLES = ['super_admin', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor'];

// Event times are stored without a time zone, so they are read in this zone (change with the EVENT_TIMEZONE secret)
const TIMEZONE = Deno.env.get('EVENT_TIMEZONE') || 'Asia/Kolkata';
const REMINDER_MINUTES = 5;

// The app calls this function from the browser (the "Send test notification" button), so it must answer CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
// or only to the chosen groups / people when the convener limited it
// deno-lint-ignore no-explicit-any
async function eventAudience(event: any): Promise<string[]> {
  const limitedRoles: string[] = event.audience_roles ?? [];
  const limitedMembers: string[] = event.audience_member_ids ?? [];
  const limitedUsers: string[] = event.audience_user_ids ?? [];
  if (event.scope === 'pastorate' && (limitedRoles.length > 0 || limitedMembers.length > 0 || limitedUsers.length > 0)) {
    const ids: string[] = [...limitedUsers];
    if (limitedRoles.length > 0) {
      const { data } = await supabase.from('profiles').select('id').in('role', limitedRoles);
      ids.push(...(data ?? []).map((row) => row.id));
    }
    if (limitedMembers.length > 0) {
      const { data } = await supabase.from('youth_member_profiles').select('id').in('youth_member_id', limitedMembers);
      ids.push(...(data ?? []).map((row) => row.id));
    }
    return ids;
  }
  let query = supabase.from('profiles').select('id');
  if (event.scope === 'local' && event.church_id) query = query.eq('church_id', event.church_id);
  const { data } = await query;
  return (data ?? []).map((row) => row.id);
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

    const recipientIds = await eventAudience(event);

    const time = event.start_time.slice(0, 5);
    const result = await sendTo(recipientIds, {
      title: `Starting soon: ${event.title}`,
      body: `Starts at ${time}${event.venue ? ` · ${event.venue}` : ''}`,
      tag: `event-reminder-${event.id}`,
    });
    console.log('event reminder', event.title, JSON.stringify(result));
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
async function requestRecipients(request: { recipient_role: string; church_id: string | null; target_all_churches?: boolean | null; target_church_ids?: string[] | null; target_user_ids?: string[] | null }) {
  // Named people (chosen by the Super Admin): only they receive it
  if (request.target_user_ids && request.target_user_ids.length > 0) return request.target_user_ids;
  if (GLOBAL_ROLES.includes(request.recipient_role)) return usersWithRole(request.recipient_role, request.church_id ?? '');
  if (request.target_all_churches) {
    const { data } = await supabase.from('profiles').select('id').eq('role', request.recipient_role);
    return (data ?? []).map((row) => row.id);
  }
  if (request.target_church_ids && request.target_church_ids.length > 0) {
    const { data } = await supabase.from('profiles').select('id').eq('role', request.recipient_role).in('church_id', request.target_church_ids);
    return (data ?? []).map((row) => row.id);
  }
  return usersWithRole(request.recipient_role, request.church_id ?? '');
}

type SendResult = { recipients: number; subscriptions: number; sent: number; failed: number; removed: number };

async function sendTo(userIds: string[], payload: Payload, excludeId?: string | null): Promise<SendResult> {
  const ids = [...new Set(userIds)].filter((id) => id && id !== excludeId);
  const result: SendResult = { recipients: ids.length, subscriptions: 0, sent: 0, failed: 0, removed: 0 };
  if (ids.length === 0) return result;
  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', ids);
  result.subscriptions = (subs ?? []).length;
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ url: '/', ...payload }));
      result.sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) { await supabase.from('push_subscriptions').delete().eq('id', sub.id); result.removed += 1; }
      else { result.failed += 1; console.error('push failed', status, (error as Error).message); }
    }
  }));
  return result;
}

Deno.serve(async (req) => {
  // Browser pre-flight request
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.json();

  // A signed-in person testing their own devices: checked by their login, not by the webhook secret
  if (body.type === 'SELF_TEST') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Not signed in' }, 401);
    const result = await sendTo([user.id], { title: 'Test notification', body: 'Notifications are working.', tag: 'test' });
    console.log('self test', JSON.stringify(result));
    return json({
      ok: true,
      devices: result.subscriptions,
      sent: result.sent,
      errors: result.failed > 0 ? [`${result.failed} device(s) rejected the push`] : [],
    });
  }

  // The secret lives in one place: the push_config table (the database triggers read the same row)
  const { data: config } = await supabase.from('push_config').select('webhook_secret').eq('id', 1).maybeSingle();
  const secret = config?.webhook_secret || Deno.env.get('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) {
    console.warn('rejected: the x-webhook-secret did not match');
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const { type, table, record, old_record } = body;
  const results: Record<string, unknown>[] = [];
  const note = (name: string, result: SendResult) => { results.push({ name, ...result }); console.log(name, JSON.stringify(result)); };

  // Health check: how many devices are signed up for notifications?
  if (type === 'PING') {
    const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true });
    return json({ ok: true, devices_subscribed: count ?? 0 });
  }
  // Send a test notification to one person: { "type": "TEST", "user_id": "..." }
  if (type === 'TEST') {
    const result = await sendTo([body.user_id], { title: 'Test notification', body: 'Notifications are working.', tag: 'test' });
    return json({ ok: true, ...result });
  }

  if (type === 'EVENT_REMINDERS') {
    await sendEventReminders();
    return json({ ok: true });
  }

  // A new event: tell the people it is for
  if (table === 'youth_events' && type === 'INSERT') {
    const when = `${new Date(`${record.event_date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${record.start_time ? ` at ${String(record.start_time).slice(0, 5)}` : ''}`;
    note('new event', await sendTo(await eventAudience(record), { title: `New event: ${record.title}`, body: `${when}${record.venue ? ` · ${record.venue}` : ''}`, tag: `event-${record.id}` }, record.created_by));
  }

  if (table === 'circulars' && type === 'INSERT') {
    let query = supabase.from('profiles').select('id, role');
    // A church circular goes to that church plus the pastorate/super admin roles; a null church means everyone
    if (record.church_id) query = query.or(`church_id.eq.${record.church_id},role.in.(${GLOBAL_ROLES.join(',')})`);
    const { data } = await query;
    const audience = (data ?? []).filter((row) => audienceIncludes(record.target_audience, row.role));
    note('circular', await sendTo(audience.map((row) => row.id), { title: 'New circular', body: record.title, tag: `circular-${record.id}` }, record.created_by));
  }

  if (table === 'information_requests' && type === 'INSERT') {
    note('new request', await sendTo(await requestRecipients(record), { title: 'New request', body: `${record.requester_name || 'Someone'}: ${record.subject}`, tag: `request-${record.id}` }, record.requested_by));
  }

  if (table === 'information_requests' && type === 'UPDATE' && old_record?.status === 'pending' && record.status !== 'pending') {
    note('request decided', await sendTo([record.requested_by], { title: `Request ${record.status}`, body: record.subject, tag: `request-${record.id}` }, record.decided_by));
  }

  if (table === 'request_comments' && type === 'INSERT') {
    const { data: request } = await supabase.from('information_requests').select('requested_by, recipient_role, church_id, subject, target_all_churches, target_church_ids, target_user_ids').eq('id', record.request_id).maybeSingle();
    if (request) {
      const recipients = [request.requested_by, ...(await requestRecipients(request))];
      note('request comment', await sendTo(recipients, { title: `New comment: ${request.subject}`, body: `${record.author_name || 'Someone'}: ${String(record.body).slice(0, 100)}`, tag: `request-${record.request_id}` }, record.author_id));
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
    if (message) note('download access', await sendTo([record.user_id], { ...message, tag: `export-access-${record.user_id}` }));
  }

  // Minutes published: tell everyone in that church (youth members, church admin, local and pastorate admins, PC members)
  if (table === 'minute_books') {
    const justPublished = record.status === 'published' && (type === 'INSERT' || (type === 'UPDATE' && old_record?.status !== 'published'));
    if (justPublished) {
      const { data: people } = await supabase.from('profiles').select('id').eq('church_id', record.church_id);
      note('minutes', await sendTo((people ?? []).map((row) => row.id), { title: 'New minutes published', body: `${record.title} (${record.meeting_date})`, tag: `minutes-${record.id}` }, record.created_by));
    }
  }

  return json({ ok: true, results });
});