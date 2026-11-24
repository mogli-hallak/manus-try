import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as WebPushModule from 'web-push';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof WebPushModule;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const VAPID_CACHE_FILE = path.join(__dirname, '.vapid-keys.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, '.push-subscriptions.json');

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

interface NotificationPreferences {
  meetingStarting: boolean;
  decisionFinalized: boolean;
  checklistAdded: boolean;
}

interface StoredSubscription {
  roomId: string;
  uid: string;
  userName: string;
  endpoint: string;
  subscription: WebPushModule.PushSubscription;
  preferences: NotificationPreferences;
  updatedAt: number;
}

interface PushNotificationBody {
  title: string;
  body: string;
  tag: string;
  url: string;
  roomId: string;
  type: 'meeting_starting_soon' | 'decision_finalized' | 'checklist_item_added' | 'test_notification';
}

function loadOrCreateVapidKeys(): VapidKeys {
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPublic && envPrivate) {
    return { publicKey: envPublic, privateKey: envPrivate };
  }

  try {
    if (fs.existsSync(VAPID_CACHE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_CACHE_FILE, 'utf8')) as VapidKeys;
      if (parsed.publicKey && parsed.privateKey) {
        return parsed;
      }
    }
  } catch {
    // regenerate if corrupt
  }

  const generated = webpush.generateVAPIDKeys();
  try {
    fs.writeFileSync(VAPID_CACHE_FILE, JSON.stringify(generated, null, 2), 'utf8');
  } catch {
    // ignore read-only fs in restricted environments
  }
  return generated;
}

const vapidKeys = loadOrCreateVapidKeys();
const vapidSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:notifications@nifgashim.app';
webpush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey);

function loadSubscriptions(): StoredSubscription[] {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
      if (Array.isArray(parsed)) {
        return parsed as StoredSubscription[];
      }
    }
  } catch {
    // ignore
  }
  return [];
}

let subscriptions: StoredSubscription[] = loadSubscriptions();

function saveSubscriptions() {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2), 'utf8');
  } catch {
    // ignore if filesystem is read-only
  }
}

// Track sent notification tags to prevent duplicate alerts
const sentTagTimestamps = new Map<string, number>();

function wasRecentlySent(tag: string, windowMs = 60_000): boolean {
  const now = Date.now();
  for (const [key, ts] of sentTagTimestamps.entries()) {
    if (now - ts > 60 * 60 * 1000) {
      sentTagTimestamps.delete(key);
    }
  }
  const prev = sentTagTimestamps.get(tag);
  if (prev && now - prev < windowMs) {
    return true;
  }
  sentTagTimestamps.set(tag, now);
  return false;
}

async function dispatchRoomPush(
  roomId: string,
  payload: PushNotificationBody,
  options: { excludeUid?: string; targetUid?: string; prefKey?: keyof NotificationPreferences }
): Promise<{ sent: number; removed: number }> {
  const targets = subscriptions.filter((sub) => {
    if (sub.roomId !== roomId) return false;
    if (options.targetUid && sub.uid !== options.targetUid) return false;
    if (options.excludeUid && sub.uid === options.excludeUid) return false;
    if (options.prefKey && sub.preferences && sub.preferences[options.prefKey] === false) {
      return false;
    }
    return true;
  });

  if (targets.length === 0) {
    return { sent: 0, removed: 0 };
  }

  let sent = 0;
  const expiredEndpoints = new Set<string>();
  const jsonPayload = JSON.stringify(payload);

  await Promise.all(
    targets.map(async (item) => {
      try {
        await webpush.sendNotification(item.subscription, jsonPayload, {
          TTL: 60 * 60,
          urgency: 'normal',
        });
        sent += 1;
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number((error as { statusCode: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.add(item.endpoint);
        } else {
          console.error('Web Push delivery error:', error);
        }
      }
    })
  );

  if (expiredEndpoints.size > 0) {
    subscriptions = subscriptions.filter((s) => !expiredEndpoints.has(s.endpoint));
    saveSubscriptions();
  }

  return { sent, removed: expiredEndpoints.size };
}

// Background meeting reminder timers keyed by roomId
const scheduledReminders = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleMeetingReminderTimer(params: {
  roomId: string;
  roomTitle: string;
  meetingTimeMs: number;
  meetingLabel?: string;
}) {
  const existing = scheduledReminders.get(params.roomId);
  if (existing) {
    clearTimeout(existing);
    scheduledReminders.delete(params.roomId);
  }

  const leadMs = 15 * 60 * 1000;
  const triggerAtMs = params.meetingTimeMs - leadMs;
  const delayMs = triggerAtMs - Date.now();

  if (params.meetingTimeMs <= Date.now()) {
    return { scheduled: false, reason: 'past_time' };
  }

  // Node setTimeout max safe delay is ~24.8 days
  if (delayMs > 2_000_000_000) {
    return { scheduled: false, reason: 'too_far' };
  }

  const fire = () => {
    scheduledReminders.delete(params.roomId);
    const tag = `room-${params.roomId}-starting-${Math.floor(params.meetingTimeMs / 60_000)}`;
    if (wasRecentlySent(tag, 10 * 60_000)) return;
    const minsLeft = Math.max(1, Math.round((params.meetingTimeMs - Date.now()) / 60_000));
    void dispatchRoomPush(
      params.roomId,
      {
        title: `המפגש עומד להתחיל: ${params.roomTitle}`,
        body: params.meetingLabel
          ? `${params.meetingLabel} (בעוד כ-${minsLeft} דקות)`
          : `מתחילים בעוד כ-${minsLeft} דקות`,
        tag,
        url: `/?room=${encodeURIComponent(params.roomId)}`,
        roomId: params.roomId,
        type: 'meeting_starting_soon',
      },
      { prefKey: 'meetingStarting' }
    );
  };

  if (delayMs <= 0) {
    // Meeting is already within the 15-minute window
    fire();
    return { scheduled: true, immediate: true };
  }

  const timer = setTimeout(fire, delayMs);
  scheduledReminders.set(params.roomId, timer);
  return { scheduled: true, triggerAtMs };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/push/vapid-public-key', (_req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.get('/api/push/status', (req, res) => {
    const roomId = String(req.query.roomId || '').trim();
    const uid = String(req.query.uid || '').trim();
    if (!roomId) {
      res.status(400).json({ error: 'Missing roomId' });
      return;
    }
    const roomSubs = subscriptions.filter((s) => s.roomId === roomId);
    const mine = uid ? roomSubs.find((s) => s.uid === uid) : undefined;
    res.json({
      roomSubscribersCount: roomSubs.length,
      isSubscribed: Boolean(mine),
      preferences: mine?.preferences ?? {
        meetingStarting: true,
        decisionFinalized: true,
        checklistAdded: true,
      },
    });
  });

  app.post('/api/push/subscribe', (req, res) => {
    const { roomId, uid, userName, subscription, preferences } = req.body ?? {};
    if (
      typeof roomId !== 'string' ||
      !roomId.trim() ||
      typeof uid !== 'string' ||
      !uid.trim() ||
      !subscription ||
      typeof subscription.endpoint !== 'string' ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      res.status(400).json({ error: 'Invalid subscription payload' });
      return;
    }

    const cleanRoomId = roomId.trim();
    const cleanUid = uid.trim();
    const cleanName = typeof userName === 'string' && userName.trim() ? userName.trim().slice(0, 40) : 'משתתף';
    const nextPrefs: NotificationPreferences = {
      meetingStarting: preferences?.meetingStarting !== false,
      decisionFinalized: preferences?.decisionFinalized !== false,
      checklistAdded: preferences?.checklistAdded !== false,
    };

    subscriptions = subscriptions.filter(
      (s) => !(s.roomId === cleanRoomId && (s.uid === cleanUid || s.endpoint === subscription.endpoint))
    );
    subscriptions.push({
      roomId: cleanRoomId,
      uid: cleanUid,
      userName: cleanName,
      endpoint: subscription.endpoint,
      subscription,
      preferences: nextPrefs,
      updatedAt: Date.now(),
    });
    saveSubscriptions();

    res.json({ ok: true, count: subscriptions.filter((s) => s.roomId === cleanRoomId).length });
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const { roomId, uid, endpoint } = req.body ?? {};
    subscriptions = subscriptions.filter((s) => {
      if (endpoint && s.endpoint === endpoint && (!roomId || s.roomId === roomId)) {
        return false;
      }
      if (roomId && uid && s.roomId === roomId && s.uid === uid) {
        return false;
      }
      return true;
    });
    saveSubscriptions();
    res.json({ ok: true });
  });

  app.post('/api/push/notify', async (req, res) => {
    const {
      type,
      roomId,
      roomTitle,
      actorName,
      itemLabel,
      winningOption,
      winningTimeLabel,
      minutesLeft,
      excludeUid,
      targetUid,
      dedupeKey,
    } = req.body ?? {};

    if (typeof roomId !== 'string' || !roomId.trim() || typeof type !== 'string') {
      res.status(400).json({ error: 'Invalid notification request' });
      return;
    }

    const cleanRoomId = roomId.trim();
    const safeTitle = typeof roomTitle === 'string' && roomTitle.trim() ? roomTitle.trim() : 'מפגש משותף';
    const roomUrl = `/?room=${encodeURIComponent(cleanRoomId)}`;

    let payload: PushNotificationBody;
    let prefKey: keyof NotificationPreferences | undefined;

    if (type === 'checklist_item_added') {
      const safeItem = typeof itemLabel === 'string' && itemLabel.trim() ? itemLabel.trim() : 'פריט חדש';
      const safeActor = typeof actorName === 'string' && actorName.trim() ? actorName.trim() : 'חבר בקבוצה';
      const tag = dedupeKey
        ? `room-${cleanRoomId}-checklist-${dedupeKey}`
        : `room-${cleanRoomId}-checklist-${safeItem}`;
      if (wasRecentlySent(tag, 5_000)) {
        res.json({ sent: 0, deduplicated: true });
        return;
      }
      prefKey = 'checklistAdded';
      payload = {
        title: `פריט חדש ברשימת הציוד · ${safeTitle}`,
        body: `${safeActor} הוסיף: ${safeItem}`,
        tag,
        url: roomUrl,
        roomId: cleanRoomId,
        type: 'checklist_item_added',
      };
    } else if (type === 'decision_finalized') {
      const tag = `room-${cleanRoomId}-finalized`;
      if (wasRecentlySent(tag, 30_000)) {
        res.json({ sent: 0, deduplicated: true });
        return;
      }
      prefKey = 'decisionFinalized';
      const details: string[] = [];
      if (typeof winningOption === 'string' && winningOption.trim()) {
        details.push(winningOption.trim());
      }
      if (typeof winningTimeLabel === 'string' && winningTimeLabel.trim()) {
        details.push(winningTimeLabel.trim());
      }
      payload = {
        title: `ההחלטה ננעלה · ${safeTitle}`,
        body: details.length > 0 ? details.join(' · ') : 'כנסו לצפות בסיכום הסופי של המפגש.',
        tag,
        url: roomUrl,
        roomId: cleanRoomId,
        type: 'decision_finalized',
      };
    } else if (type === 'meeting_starting_soon') {
      const mins = Number(minutesLeft) > 0 ? Math.round(Number(minutesLeft)) : 15;
      const tag = `room-${cleanRoomId}-starting`;
      if (wasRecentlySent(tag, 10 * 60_000)) {
        res.json({ sent: 0, deduplicated: true });
        return;
      }
      prefKey = 'meetingStarting';
      payload = {
        title: `המפגש עומד להתחיל · ${safeTitle}`,
        body: `מתחילים בעוד ${mins} דקות`,
        tag,
        url: roomUrl,
        roomId: cleanRoomId,
        type: 'meeting_starting_soon',
      };
    } else if (type === 'test_notification') {
      payload = {
        title: `התראות פעילות · ${safeTitle}`,
        body: 'תקבלו עדכון שקט כשהמפגש מתקרב, כשהחלטה ננעלת או כשמתווסף ציוד.',
        tag: `room-${cleanRoomId}-test-${Date.now()}`,
        url: roomUrl,
        roomId: cleanRoomId,
        type: 'test_notification',
      };
    } else {
      res.status(400).json({ error: 'Unknown notification type' });
      return;
    }

    const result = await dispatchRoomPush(cleanRoomId, payload, {
      excludeUid: typeof excludeUid === 'string' ? excludeUid : undefined,
      targetUid: typeof targetUid === 'string' ? targetUid : undefined,
      prefKey,
    });

    res.json({ ok: true, ...result });
  });

  app.post('/api/push/schedule-meeting', (req, res) => {
    const { roomId, roomTitle, meetingTimeMs, meetingLabel } = req.body ?? {};
    if (
      typeof roomId !== 'string' ||
      !roomId.trim() ||
      typeof meetingTimeMs !== 'number' ||
      Number.isNaN(meetingTimeMs)
    ) {
      res.status(400).json({ error: 'Invalid schedule payload' });
      return;
    }

    const result = scheduleMeetingReminderTimer({
      roomId: roomId.trim(),
      roomTitle: typeof roomTitle === 'string' && roomTitle.trim() ? roomTitle.trim() : 'מפגש',
      meetingTimeMs,
      meetingLabel: typeof meetingLabel === 'string' ? meetingLabel : undefined,
    });
    res.json({ ok: true, ...result });
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nifgashim server running on http://localhost:${PORT}`);
  });
}

void startServer();
