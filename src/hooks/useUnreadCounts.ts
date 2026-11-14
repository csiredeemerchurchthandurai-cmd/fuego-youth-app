import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Feature = 'requests' | 'circulars';

// Roles that see circulars from every church; everyone else only sees their own church's
const GLOBAL_ROLES = ['super_admin', 'pastorate_youth_secretary', 'pastorate_youth_treasurer', 'pastorate_convenor'];

const CHANGED_EVENT = 'fuego:unread-changed';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const key = (userId: string, feature: Feature) => `fuego:lastSeen:${userId}:${feature}`;

function getLastSeen(userId: string, feature: Feature): string {
  try {
    const stored = localStorage.getItem(key(userId, feature));
    if (stored) return stored;
    // First time on this device: count anything from the last 7 days as unread
    const start = new Date(Date.now() - WEEK_MS).toISOString();
    localStorage.setItem(key(userId, feature), start);
    return start;
  } catch {
    return new Date(Date.now() - WEEK_MS).toISOString();
  }
}

function setLastSeen(userId: string, feature: Feature, at: Date = new Date()) {
  try { localStorage.setItem(key(userId, feature), at.toISOString()); } catch { /* storage unavailable */ }
}

/** Call when the user has actually been shown the latest items (e.g. after a list reload). Clears that badge. */
export function markFeatureSeen(userId: string, feature: Feature, at: Date = new Date()) {
  setLastSeen(userId, feature, at);
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Unread counts for the Requests and Circulars tabs.
 * Pass the feature whose tab is currently open: opening a tab clears its count.
 * New items that arrive while the tab is open still raise the badge until the list is refreshed.
 */
export function useUnreadCounts(active: Feature | null) {
  const { profile } = useAuth();
  const [counts, setCounts] = useState({ requests: 0, circulars: 0 });

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    const me = profile.id;

    // Requests: new requests sent to me, decisions (approved/rejected) on mine, and replies from other people
    const requestsSince = getLastSeen(me, 'requests');
    const [incoming, decisions, replies] = await Promise.all([
      supabase.from('information_requests').select('id', { count: 'exact', head: true }).neq('requested_by', me).gt('created_at', requestsSince),
      supabase.from('information_requests').select('id', { count: 'exact', head: true }).eq('requested_by', me).neq('status', 'pending').gt('decided_at', requestsSince),
      supabase.from('request_comments').select('id', { count: 'exact', head: true }).neq('author_id', me).gt('created_at', requestsSince),
    ]);
    [incoming, decisions, replies].forEach((result) => { if (result.error) console.warn('[unread badge] requests query failed:', result.error.message); });

    // Circulars written by someone else
    const circularsSince = getLastSeen(me, 'circulars');
    let circularQuery = supabase.from('circulars').select('id', { count: 'exact', head: true }).neq('created_by', me).gt('created_at', circularsSince);
    if (!GLOBAL_ROLES.includes(profile.role) && profile.church_id) {
      circularQuery = circularQuery.or(`church_id.is.null,church_id.eq.${profile.church_id}`);
    }
    const circulars = await circularQuery;
    if (circulars.error) console.warn('[unread badge] circulars query failed:', circulars.error.message);

    const next = {
      requests: (incoming.count || 0) + (decisions.count || 0) + (replies.count || 0),
      circulars: circulars.count || 0,
    };
    setCounts(next);

  }, [profile?.id, profile?.role, profile?.church_id]);

  // Opening a tab marks it as seen
  useEffect(() => {
    if (active && profile?.id) setLastSeen(profile.id, active);
    refresh();
  }, [active, profile?.id, refresh]);

  // Refresh every 20 seconds, when the app returns to the foreground, and when a list was just reloaded
  useEffect(() => {
    const timer = window.setInterval(refresh, 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return counts;
}