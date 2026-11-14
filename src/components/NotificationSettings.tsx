import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// Notifications page for every signed-in person (members, leaders, admins):
//  1. turn notifications on/off for THIS phone or computer,
//  2. choose which kinds of notifications to receive,
//  3. send a test, and see a checklist that explains why notifications are not arriving.

// Needs the public VAPID key in your Vite env (.env and Vercel). Change the name if you already use another one.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

type Prefs = { circulars: boolean; events: boolean; minutes: boolean; requests: boolean; download_access: boolean };

const KINDS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'circulars', label: 'Circulars', hint: 'When a new circular is posted for you' },
  { key: 'events', label: 'Events', hint: 'New events and the reminder 5 minutes before they start' },
  { key: 'minutes', label: 'Minute book', hint: 'When minutes of a meeting are published' },
  { key: 'requests', label: 'Requests and comments', hint: 'New requests, decisions and comments' },
  { key: 'download_access', label: 'Download list access', hint: 'When your access to download member lists is approved, declined or expires' },
];

const DEFAULTS: Prefs = { circulars: true, events: true, minutes: true, requests: true, download_access: true };

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

type Check = { supported: boolean; ios: boolean; installed: boolean; permission: string; worker: boolean; subscribed: boolean; saved: boolean };

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [userId, setUserId] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const refreshCheck = useCallback(async (uid: string | null) => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const next: Check = { supported, ios, installed, permission: supported ? Notification.permission : 'unsupported', worker: false, subscribed: false, saved: false };
    if (supported) {
      const registration = await navigator.serviceWorker.getRegistration();
      next.worker = !!registration;
      const subscription = await registration?.pushManager.getSubscription();
      next.subscribed = !!subscription;
      if (subscription && uid) {
        const { data } = await supabase.from('push_subscriptions').select('id').eq('user_id', uid).eq('endpoint', subscription.endpoint).limit(1);
        next.saved = (data ?? []).length > 0;
      }
    }
    setCheck(next);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: row } = await supabase.from('notification_preferences').select('circulars, events, minutes, requests, download_access').eq('user_id', uid).maybeSingle();
        if (row) setPrefs({ ...DEFAULTS, ...row });
      }
      refreshCheck(uid);
    })();
  }, [refreshCheck]);

  const fail = (text: string) => setMessage({ kind: 'error', text });
  const done = (text: string) => setMessage({ kind: 'ok', text });

  // Switch on for this device: ask permission, subscribe, and save the device so the server can reach it
  const enable = async () => {
    setMessage(null);
    if (!userId) return fail('Please sign in again.');
    if (!VAPID_PUBLIC_KEY) return fail('The app is missing VITE_VAPID_PUBLIC_KEY, so notifications cannot be set up. Ask the administrator.');
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        fail('Notifications are blocked. Allow them for this app in your phone or browser settings, then try again.');
        return;
      }
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      }
      const json = subscription.toJSON();
      const row = { user_id: userId, endpoint: subscription.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' };
      const { data: existing } = await supabase.from('push_subscriptions').select('id').eq('endpoint', subscription.endpoint).limit(1);
      const { error } = existing && existing.length > 0
        ? await supabase.from('push_subscriptions').update(row).eq('id', existing[0].id)
        : await supabase.from('push_subscriptions').insert(row);
      if (error) throw error;
      done('Notifications are on for this device.');
    } catch (error) {
      fail(`Could not turn notifications on: ${(error as Error).message}`);
    } finally {
      setBusy(false);
      refreshCheck(userId);
    }
  };

  const disable = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      done('Notifications are off for this device.');
    } catch (error) {
      fail(`Could not turn notifications off: ${(error as Error).message}`);
    } finally {
      setBusy(false);
      refreshCheck(userId);
    }
  };

  // Each switch saves immediately
  const toggle = async (key: keyof Prefs) => {
    if (!userId) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
      setPrefs(prefs);
      fail(`Could not save your choice: ${error.message}`);
    }
  };

  // Asks the server to push to this person's saved devices - tests the whole chain, not just the phone
  const sendTest = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', { body: { type: 'SELF_TEST' } });
      if (error) throw error;
      if (!data || data.devices === 0) fail('The server has no saved device for you. Turn notifications on for this device first.');
      else if (data.sent === 0) fail(`The server could not deliver the test (${(data.errors ?? []).join('; ') || 'unknown error'}).`);
      else done(`Test sent to ${data.sent} device${data.sent === 1 ? '' : 's'}. It should appear in a few seconds.`);
    } catch (error) {
      fail(`Could not send the test: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const on = !!check?.subscribed && !!check?.saved && check?.permission === 'granted';
  const needsInstall = !!check && check.ios && !check.installed;

  const checklist: { ok: boolean; text: string }[] = check
    ? [
        { ok: check.supported, text: check.supported ? 'This device supports notifications' : 'This browser does not support notifications' },
        ...(check.ios ? [{ ok: check.installed, text: check.installed ? 'Opened from the Home Screen icon' : 'On iPhone, add the app to the Home Screen and open it from there' }] : []),
        { ok: check.permission === 'granted', text: check.permission === 'granted' ? 'Permission allowed' : check.permission === 'denied' ? 'Permission blocked in settings' : 'Permission not asked yet' },
        { ok: check.worker, text: check.worker ? 'Background service is running' : 'Background service is not registered yet' },
        { ok: check.subscribed, text: check.subscribed ? 'This device is subscribed' : 'This device is not subscribed' },
        { ok: check.saved, text: check.saved ? 'This device is saved on the server' : 'This device is not saved on the server' },
      ]
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Link to="/" className="mb-2 inline-block text-sm font-semibold text-orange-600 hover:text-orange-700">&larr; Back to dashboard</Link>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">Choose what Fuego sends to this device.</p>
      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${message.kind === 'ok' ? 'bg-green-50 text-green-800 ring-1 ring-green-200' : 'bg-red-50 text-red-800 ring-1 ring-red-200'}`}>{message.text}</div>
      )}

      {needsInstall && (
        <div className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-900 ring-1 ring-orange-200">
          On iPhone, notifications only work in the installed app. In Safari tap <b>Share</b>, then <b>Add to Home Screen</b>, then open Fuego from the new icon and come back to this page.
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Notifications on this device</p>
            <p className="text-sm text-gray-500">{on ? 'On' : 'Off'}</p>
          </div>
          {on ? (
            <button type="button" disabled={busy} onClick={disable} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Turn off</button>
          ) : (
            <button type="button" disabled={busy || needsInstall || (check ? !check.supported : true)} onClick={enable} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">Turn on</button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-3 font-semibold text-gray-900">What do you want to be told about?</p>
        <ul className="divide-y divide-gray-100">
          {KINDS.map((kind) => (
            <li key={kind.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{kind.label}</p>
                <p className="text-xs text-gray-500">{kind.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[kind.key]}
                aria-label={kind.label}
                onClick={() => toggle(kind.key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prefs[kind.key] ? 'bg-orange-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[kind.key] ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button type="button" disabled={busy} onClick={sendTest} className="rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50">Send test notification</button>
        </div>
      </section>

      {checklist.length > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="mb-3 font-semibold text-gray-900">Why am I not getting notifications?</p>
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li key={item.text} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 font-bold ${item.ok ? 'text-green-600' : 'text-red-600'}`}>{item.ok ? '✓' : '✗'}</span>
                <span className={item.ok ? 'text-gray-700' : 'font-medium text-gray-900'}>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}