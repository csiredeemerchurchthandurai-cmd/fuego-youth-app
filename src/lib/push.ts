import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js');
}

export async function getCurrentSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export type EnableResult = 'enabled' | 'denied' | 'unsupported' | 'missing-key' | 'error';

export async function enablePush(userId: string): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'missing-key';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    await registerServiceWorker();
    const registration = await navigator.serviceWorker.ready;
    const subscription = (await registration.pushManager.getSubscription())
      || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error';
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent },
      { onConflict: 'endpoint' },
    );
    return error ? 'error' : 'enabled';
  } catch {
    return 'error';
  }
}

export async function disablePush() {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();
}