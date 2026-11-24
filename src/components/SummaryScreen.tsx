import React, { useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  ListChecks,
  Lock,
  Share2,
  Sparkles,
} from 'lucide-react';
import {
  buildCalendarEventPayload,
  buildGoogleCalendarUrl,
  buildWhatsAppSummary,
  createGoogleCalendarEvent,
} from '../services/calendarService';
import {
  ChecklistItemDoc,
  RankedCardResult,
  RoomDoc,
  TimeOptionSummary,
} from '../types/meetup';
import { ConfirmModal } from './ConfirmModal';
import { PushNotificationsControl } from './PushNotificationsControl';

interface SummaryScreenProps {
  room: RoomDoc;
  currentUid: string;
  currentUserName: string;
  winningTime: TimeOptionSummary | null;
  winningCard: RankedCardResult | null;
  checklist: ChecklistItemDoc[];
  hasCalendarToken: boolean;
  onRequestGoogleAuth: () => Promise<string | null>;
  getCalendarToken: () => string | null;
  onCreateNewRoom: () => void;
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({
  room,
  currentUid,
  currentUserName,
  winningTime,
  winningCard,
  checklist,
  hasCalendarToken,
  onRequestGoogleAuth,
  getCalendarToken,
  onCreateNewRoom,
}) => {
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showCalendarConfirm, setShowCalendarConfirm] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [calendarSuccessLink, setCalendarSuccessLink] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const calendarUrl = buildGoogleCalendarUrl(room, winningTime, winningCard, checklist);
  const eventPayload = buildCalendarEventPayload(room, winningTime, winningCard, checklist);
  const whatsAppSummary = buildWhatsAppSummary(room, winningTime, winningCard, checklist);
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const claimedCount = checklist.filter((i) => Boolean(i.claimedByName)).length;

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(whatsAppSummary);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: `סיכום מפגש — ${room.title}`,
        text: whatsAppSummary,
        url: `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room.id)}`,
      });
    } catch {
      // user cancelled or share unavailable
    }
  };

  const handleStartCalendarSave = async () => {
    setCalendarError(null);
    let token = getCalendarToken();
    if (!token) {
      try {
        token = await onRequestGoogleAuth();
      } catch {
        setCalendarError('נדרשת התחברות עם Google כדי להוסיף ישירות ליומן.');
        return;
      }
    }
    if (token) {
      setShowCalendarConfirm(true);
    }
  };

  const handleConfirmCalendarCreate = async () => {
    const token = getCalendarToken();
    if (!token) {
      setShowCalendarConfirm(false);
      setCalendarError('אסימון הגישה ליומן פג, נסו להתחבר מחדש עם Google.');
      return;
    }

    setSavingCalendar(true);
    setCalendarError(null);
    try {
      const created = await createGoogleCalendarEvent(token, eventPayload);
      setCalendarSuccessLink(created.htmlLink || calendarUrl);
      setShowCalendarConfirm(false);
    } catch (err) {
      setCalendarError(
        err instanceof Error
          ? 'לא ניתן היה ליצור את האירוע ישירות. ניתן להשתמש בקישור התבנית למטה.'
          : 'שגיאה בשמירה ליומן'
      );
      setShowCalendarConfirm(false);
    } finally {
      setSavingCalendar(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <div className="rounded-3xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Lock className="w-3.5 h-3.5" />
              <span>ההחלטה ננעלה</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
              {room.title}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              אורגן על ידי {room.creatorName}
            </p>
          </div>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {room.mode !== 'quick' && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Clock className="w-4 h-4" />
                <span>הזמן הנבחר</span>
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {winningTime ? winningTime.option.label : 'לא נקבעה שעה'}
              </div>
              {winningTime && (
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {winningTime.voteCount} אישרו זמינות ({winningTime.percentage}%)
                </div>
              )}
            </div>
          )}

          <div
            className={`rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 p-4 space-y-1.5 ${
              room.mode === 'quick' ? 'sm:col-span-2' : ''
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Sparkles className="w-4 h-4" />
              <span>הבחירה המנצחת</span>
            </div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {winningCard ? winningCard.card.title : 'טרם דורגו כרטיסיות'}
            </div>
            {winningCard && (
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {winningCard.card.subtitle} · {winningCard.consensusPercent}% הסכמה ({winningCard.totalPoints} נק׳)
              </div>
            )}
          </div>
        </div>

        {/* Checklist Summary */}
        {room.mode !== 'quick' && checklist.length > 0 && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <ListChecks className="w-4 h-4 text-slate-500" />
                <span>חלוקת ציוד ומשימות</span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {claimedCount} מתוך {checklist.length} שויכו
              </span>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-800 px-4">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  className="py-3 flex items-center justify-between gap-3 text-sm"
                >
                  <span
                    className={
                      item.claimedByName
                        ? 'text-slate-800 dark:text-slate-200'
                        : 'text-slate-500 dark:text-slate-400'
                    }
                  >
                    {item.label}
                  </span>
                  <span
                    className={`text-xs ${
                      item.claimedByName
                        ? 'font-semibold text-[#1E3A5F] dark:text-[#6AA2E8]'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {item.claimedByName ? `${item.claimedByName} מביא` : 'פנוי לשיוך'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Collapsible WhatsApp Summary Preview */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="w-full min-h-[42px] px-4 py-2.5 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <span>תצוגה מקדימה להודעת הסיכום</span>
            {showPreview ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {showPreview && (
            <pre className="p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-white dark:bg-[#18202A] border-t border-slate-200/70 dark:border-slate-800">
              {whatsAppSummary}
            </pre>
          )}
        </div>

        {/* Calendar success / error banners */}
        {calendarSuccessLink && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3.5 flex items-center justify-between gap-3 text-sm text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>האירוע נוסף בהצלחה ל-Google Calendar שלך.</span>
            </div>
            <a
              href={calendarSuccessLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold underline underline-offset-4 shrink-0"
            >
              צפה ביומן
            </a>
          </div>
        )}

        {calendarError && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3.5 text-xs text-amber-900 dark:text-amber-200">
            {calendarError}
          </div>
        )}

        {/* Export Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            {copiedWhatsApp ? (
              <>
                <Check className="w-4 h-4" />
                <span>הועתק ללוח</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>העתק סיכום לוואטסאפ</span>
              </>
            )}
          </button>

          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>שתף</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleStartCalendarSave}
            className="flex-1 min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>
              {hasCalendarToken ? 'הוסף ל-Google Calendar' : 'שמור ישירות ב-Google Calendar'}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-4"
          >
            <span>פתח בטופס יומן Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={onCreateNewRoom}
            className="hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-4 cursor-pointer"
          >
            יצירת מפגש חדש
          </button>
        </div>
      </div>

      <PushNotificationsControl
        roomId={room.id}
        roomTitle={room.title}
        uid={currentUid}
        userName={currentUserName}
      />

      <ConfirmModal
        open={showCalendarConfirm}
        title="הוספת אירוע ל-Google Calendar"
        description="האפליקציה תיצור אירוע חדש ביומן Google הראשי שלך עם הפרטים הבאים:"
        details={[
          `כותרת: ${eventPayload.summary}`,
          `מיקום / פעילות: ${eventPayload.location}`,
          `תאריך ושעה: ${new Date(eventPayload.startIso).toLocaleString('he-IL')}`,
        ]}
        confirmLabel="אשר והוסף ליומן"
        isLoading={savingCalendar}
        onConfirm={handleConfirmCalendarCreate}
        onCancel={() => setShowCalendarConfirm(false)}
      />
    </main>
  );
};
