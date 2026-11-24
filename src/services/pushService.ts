export interface NotificationPreferences {
  meetingStarting: boolean;
  decisionFinalized: boolean;
  checklistAdded: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  meetingStarting: true,
  decisionFinalized: true,
  checklistAdded: true,
};

export interface PushStatusResult {
  supported: boolean;
  pushManagerSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  mode: 'web-push' | 'sw-local' | 'inactive';
  preferences: NotificationPreferences;
}

const LOCAL_PREF_KEY_PREFIX = 'nifgashim_sw_notify_';
const SENT_LOCAL_TAGS_KEY = 'nifgashim_local_sent_tags';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    return null;
  }
}

export function getLocalNotificationPref(
  roomId: string
): { enabled: boolean; preferences: NotificationPreferences } | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_PREF_KEY_PREFIX}${roomId}`);
    if (!raw) return null;
    return JSON.parse(raw) as { enabled: boolean; preferences: NotificationPreferences };
  } catch {
    return null;
  }
}

function setLocalNotificationPref(
  roomId: string,
  enabled: boolean,
  preferences: NotificationPreferences
): void {
  try {
    localStorage.setItem(
      `${LOCAL_PREF_KEY_PREFIX}${roomId}`,
      JSON.stringify({ enabled, preferences })
    );
  } catch {
    // ignore storage errors
  }
}

export async function getRoomPushStatus(
  roomId: string,
  uid: string
): Promise<PushStatusResult> {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const notifSupported = typeof window !== 'undefined' && 'Notification' in window;
  const pushManagerSupported =
    swSupported && notifSupported && 'PushManager' in window;

  if (!swSupported || !notifSupported) {
    return {
      supported: false,
      pushManagerSupported: false,
      permission: 'unsupported',
      isSubscribed: false,
      mode: 'inactive',
      preferences: DEFAULT_NOTIFICATION_PREFS,
    };
  }

  const permission = Notification.permission;
  const localPref = getLocalNotificationPref(roomId);

  if (permission !== 'granted') {
    return {
      supported: true,
      pushManagerSupported,
      permission,
      isSubscribed: false,
      mode: 'inactive',
      preferences: localPref?.preferences ?? DEFAULT_NOTIFICATION_PREFS,
    };
  }

  try {
    const res = await fetch(
      `/api/push/status?roomId=${encodeURIComponent(roomId)}&uid=${encodeURIComponent(uid)}`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        isSubscribed: boolean;
        preferences: NotificationPreferences;
      };
      if (data.isSubscribed) {
        return {
          supported: true,
          pushManagerSupported,
          permission,
          isSubscribed: true,
          mode: 'web-push',
          preferences: data.preferences ?? DEFAULT_NOTIFICATION_PREFS,
        };
      }
    }
  } catch {
    // ignore network errors when checking server status
  }

  if (localPref?.enabled) {
    return {
      supported: true,
      pushManagerSupported,
      permission,
      isSubscribed: true,
      mode: 'sw-local',
      preferences: localPref.preferences ?? DEFAULT_NOTIFICATION_PREFS,
    };
  }

  return {
    supported: true,
    pushManagerSupported,
    permission,
    isSubscribed: false,
    mode: 'inactive',
    preferences: localPref?.preferences ?? DEFAULT_NOTIFICATION_PREFS,
  };
}

export async function subscribeRoomNotifications(params: {
  roomId: string;
  uid: string;
  userName: string;
  preferences?: NotificationPreferences;
}): Promise<PushStatusResult> {
  const prefs = params.preferences ?? DEFAULT_NOTIFICATION_PREFS;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('הדפדפן אינו תומך בהתראות Service Worker.');
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    return {
      supported: true,
      pushManagerSupported: 'PushManager' in window,
      permission,
      isSubscribed: false,
      mode: 'inactive',
      preferences: prefs,
    };
  }

  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);

  if (registration && 'pushManager' in registration) {
    try {
      const keyRes = await fetch('/api/push/vapid-public-key');
      if (keyRes.ok) {
        const { publicKey } = (await keyRes.json()) as { publicKey: string };
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const applicationServerKey = urlBase64ToUint8Array(publicKey);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
          });
        }

        const subRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: params.roomId,
            uid: params.uid,
            userName: params.userName,
            subscription: subscription.toJSON(),
            preferences: prefs,
          }),
        });

        if (subRes.ok) {
          setLocalNotificationPref(params.roomId, true, prefs);
          return {
            supported: true,
            pushManagerSupported: true,
            permission: 'granted',
            isSubscribed: true,
            mode: 'web-push',
            preferences: prefs,
          };
        }
      }
    } catch (err) {
      console.warn('PushManager subscription fell back to SW local notifications:', err);
    }
  }

  // Fallback when PushManager is blocked by sandboxed iframe or browser policy
  setLocalNotificationPref(params.roomId, true, prefs);
  return {
    supported: true,
    pushManagerSupported: 'PushManager' in window,
    permission: 'granted',
    isSubscribed: true,
    mode: 'sw-local',
    preferences: prefs,
  };
}

export async function unsubscribeRoomNotifications(
  roomId: string,
  uid: string
): Promise<void> {
  const local = getLocalNotificationPref(roomId);
  setLocalNotificationPref(
    roomId,
    false,
    local?.preferences ?? DEFAULT_NOTIFICATION_PREFS
  );

  let endpoint: string | undefined;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      endpoint = sub?.endpoint;
    }
  } catch {
    // ignore
  }

  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, uid, endpoint }),
    });
  } catch {
    // ignore
  }
}

export async function showServiceWorkerNotification(payload: {
  title: string;
  body: string;
  tag: string;
  url: string;
  roomId: string;
  type: string;
}): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted' ||
    !('serviceWorker' in navigator)
  ) {
    return false;
  }

  // Prevent duplicate local notifications for the same tag
  try {
    const raw = sessionStorage.getItem(SENT_LOCAL_TAGS_KEY);
    const tags: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const prev = tags[payload.tag];
    if (prev && Date.now() - prev < 60_000) {
      return false;
    }
    tags[payload.tag] = Date.now();
    sessionStorage.setItem(SENT_LOCAL_TAGS_KEY, JSON.stringify(tags));
  } catch {
    // ignore
  }

  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await registerServiceWorker());
    if (!reg) return false;

    if (reg.active) {
      reg.active.postMessage({
        type: 'SHOW_LOCAL_NOTIFICATION',
        payload,
      });
      return true;
    }

    await reg.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: payload.tag,
      renotify: false,
      requireInteraction: false,
      dir: 'rtl',
      lang: 'he',
      data: { url: payload.url, roomId: payload.roomId, type: payload.type },
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

export async function notifyRoomPushEvent(payload: {
  type: 'meeting_starting_soon' | 'decision_finalized' | 'checklist_item_added' | 'test_notification';
  roomId: string;
  roomTitle: string;
  actorName?: string;
  itemLabel?: string;
  winningOption?: string;
  winningTimeLabel?: string;
  minutesLeft?: number;
  excludeUid?: string;
  targetUid?: string;
  dedupeKey?: string;
}): Promise<{ sent: number }> {
  try {
    const res = await fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { sent: 0 };
    const data = (await res.json()) as { sent?: number };
    return { sent: data.sent ?? 0 };
  } catch {
    return { sent: 0 };
  }
}

export async function scheduleMeetingPushReminder(params: {
  roomId: string;
  roomTitle: string;
  meetingTimeMs: number;
  meetingLabel?: string;
}): Promise<void> {
  try {
    await fetch('/api/push/schedule-meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // ignore background schedule failures
  }
}
