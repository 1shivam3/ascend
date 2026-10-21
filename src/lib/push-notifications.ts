'use client';

/**
 * localStorage key for the per-subscription delete token issued by
 * /api/notifications/subscribe. The server stores only a hash of it;
 * presenting it on DELETE proves this device owns the subscription.
 */
const PUSH_DELETE_TOKEN_KEY = 'ascend_push_delete_token';

function storePushDeleteToken(token: string) {
  try {
    localStorage.setItem(PUSH_DELETE_TOKEN_KEY, token);
  } catch {}
}

function readPushDeleteToken(): string | null {
  try {
    return localStorage.getItem(PUSH_DELETE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearPushDeleteToken() {
  try {
    localStorage.removeItem(PUSH_DELETE_TOKEN_KEY);
  } catch {}
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { getSupabase } = await import('./supabase/client');
    const supabase = getSupabase();
    const { data: { session } } = await supabase!.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {}
  return headers;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface PushSubscriptionResult {
  success: boolean;
  subscription?: PushSubscription;
  error?: string;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(vapidPublicKey?: string): Promise<PushSubscriptionResult> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, error: 'Push notifications are not supported by this browser.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission denied.' };
    }

    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
       const key =
        vapidPublicKey ||
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!key) {
        return {
          success: false,
          error:
            'Push notifications are not configured on this server. Please contact the app administrator.',
        };
      }

      const convertedKey = urlBase64ToUint8Array(key);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });
    }

    // Persist subscription to backend — include auth token so the server
    // can link the subscription to the signed-in user (not a guest).
    try {
      const subJson = subscription.toJSON();
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subscription: subJson,
          userAgent: navigator.userAgent,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      // The server issues a delete token on first registration (and rotates
      // it for the owning signed-in user); persist it for unsubscribe.
      const data = await res.json().catch(() => null);
      if (data?.deleteToken) {
        storePushDeleteToken(data.deleteToken);
      }
    } catch (err) {
      console.warn('Could not sync push subscription to server:', err);
    }

    return { success: true, subscription };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to subscribe to push notifications.' };
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // Notify server — the DELETE requires proof of ownership: the delete
      // token issued at subscribe time and/or the signed-in session.
      try {
        const headers = await buildAuthHeaders();
        const res = await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ endpoint, deleteToken: readPushDeleteToken() }),
        });
        if (res.ok) {
          clearPushDeleteToken();
        }
      } catch {}
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
