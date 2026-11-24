import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationPreferences,
  PushStatusResult,
  getRoomPushStatus,
  notifyRoomPushEvent,
  showServiceWorkerNotification,
  subscribeRoomNotifications,
  unsubscribeRoomNotifications,
} from '../services/pushService';

interface PushNotificationsControlProps {
  roomId: string;
  roomTitle: string;
  uid: string;
  userName: string;
  compact?: boolean;
}

export const PushNotificationsControl: React.FC<PushNotificationsControlProps> = ({
  roomId,
  roomTitle,
  uid,
  userName,
  compact = false,
}) => {
  const [status, setStatus] = useState<PushStatusResult>({
    supported: true,
    pushManagerSupported: true,
    permission: 'default',
    isSubscribed: false,
    mode: 'inactive',
    preferences: DEFAULT_NOTIFICATION_PREFS,
  });
  const [busy, setBusy] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isInIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    let mounted = true;
    void getRoomPushStatus(roomId, uid).then((res) => {
      if (mounted) setStatus(res);
    });
    return () => {
      mounted = false;
    };
  }, [roomId, uid]);

  const handleToggleEnable = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      if (status.isSubscribed) {
        await unsubscribeRoomNotifications(roomId, uid);
        setStatus((prev) => ({
          ...prev,
          isSubscribed: false,
          mode: 'inactive',
        }));
      } else {
        const next = await subscribeRoomNotifications({
          roomId,
          uid,
          userName,
          preferences: status.preferences,
        });
        setStatus(next);
        if (next.permission === 'denied') {
          setFeedback(
            isInIframe
              ? 'הרשאת ההתראות חסומה בתוך חלון התצוגה המקדימה. פתחו את האפליקציה בטאב נפרד כדי לאפשר התראות.'
              : 'ההתראות חסומות בהגדרות הדפדפן עבור אתר זה.'
          );
        }
      }
    } catch {
      setFeedback('לא ניתן היה להפעיל התראות במכשיר זה.');
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePreference = async (key: keyof NotificationPreferences) => {
    const nextPrefs: NotificationPreferences = {
      ...status.preferences,
      [key]: !status.preferences[key],
    };
    setStatus((prev) => ({ ...prev, preferences: nextPrefs }));
    if (status.isSubscribed) {
      const updated = await subscribeRoomNotifications({
        roomId,
        uid,
        userName,
        preferences: nextPrefs,
      });
      setStatus(updated);
    }
  };

  const handleSendTest = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      if (status.mode === 'web-push') {
        const res = await notifyRoomPushEvent({
          type: 'test_notification',
          roomId,
          roomTitle,
          targetUid: uid,
        });
        if (res.sent === 0) {
          await showServiceWorkerNotification({
            title: `התראות פעילות · ${roomTitle}`,
            body: 'תקבלו עדכון שקט כשהמפגש מתקרב, כשהחלטה ננעלת או כשמתווסף ציוד.',
            tag: `room-${roomId}-test`,
            url: `/?room=${encodeURIComponent(roomId)}`,
            roomId,
            type: 'test_notification',
          });
        }
      } else {
        await showServiceWorkerNotification({
          title: `התראות פעילות · ${roomTitle}`,
          body: 'תקבלו עדכון שקט כשהמפגש מתקרב, כשהחלטה ננעלת או כשמתווסף ציוד.',
          tag: `room-${roomId}-test`,
          url: `/?room=${encodeURIComponent(roomId)}`,
          roomId,
          type: 'test_notification',
        });
      }
      setTestSent(true);
      setTimeout(() => setTestSent(false), 2500);
    } finally {
      setBusy(false);
    }
  };

  if (!status.supported) {
    return null;
  }

  const modeSummary =
    status.mode === 'web-push'
      ? 'ערוץ פעיל: Web Push (VAPID) + Service Worker'
      : status.mode === 'sw-local'
        ? 'ערוץ פעיל: Service Worker מקומי ברקע'
        : 'כבוי עבור חדר זה';

  if (compact) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {status.isSubscribed ? (
              <Bell className="w-4 h-4 text-[#1E3A5F] dark:text-[#6AA2E8] shrink-0" />
            ) : (
              <BellOff className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {status.isSubscribed ? 'התראות למכשיר פעילות' : 'התראות למכשיר'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {status.isSubscribed
                  ? modeSummary
                  : 'תחילת מפגש · נעילת החלטה · ציוד חדש'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {status.isSubscribed && (
              <button
                type="button"
                onClick={handleSendTest}
                disabled={busy}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {testSent ? 'נשלח' : 'בדיקה'}
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleEnable}
              disabled={busy}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                status.isSubscribed
                  ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  : 'bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] text-white'
              }`}
            >
              {status.isSubscribed ? 'כבה' : 'הפעל'}
            </button>
          </div>
        </div>
        {feedback && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">{feedback}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#1E3A5F] dark:text-[#6AA2E8]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              התראות Web Push למכשיר
            </h3>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {modeSummary}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleEnable}
          disabled={busy}
          className={`flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
            status.isSubscribed
              ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              : 'bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white'
          }`}
        >
          {status.isSubscribed ? 'בטל התראות לחדר זה' : 'הפעל התראות לחדר זה'}
        </button>

        {status.isSubscribed && (
          <button
            type="button"
            onClick={handleSendTest}
            disabled={busy}
            className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {testSent ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>נשלח</span>
              </>
            ) : (
              <span>בדוק התראה</span>
            )}
          </button>
        )}
      </div>

      {status.isSubscribed && (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {(
            [
              ['meetingStarting', 'תזכורת לפני תחילת המפגש'],
              ['decisionFinalized', 'כשננעלת ההחלטה הסופית'],
              ['checklistAdded', 'כשחבר מוסיף פריט לרשימת הציוד'],
            ] as Array<[keyof NotificationPreferences, string]>
          ).map(([key, label]) => {
            const checked = status.preferences[key];
            return (
              <label
                key={key}
                className="flex items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-1"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => void handleTogglePreference(key)}
                  className="w-4 h-4 rounded accent-[#1E3A5F] dark:accent-[#4A7BB7] cursor-pointer"
                />
              </label>
            );
          })}
        </div>
      )}

      {feedback && (
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          {feedback}
        </p>
      )}
    </div>
  );
};
