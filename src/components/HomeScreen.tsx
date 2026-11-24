import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Film,
  History,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { CATEGORY_LABELS, createDefaultTimeOptions } from '../data/decks';
import {
  AuthUserSummary,
  BLUEPRINT_LIMITS,
  FriendGroupDoc,
  GroupWithMembers,
  RoomCategory,
  RoomDoc,
  RoomMode,
} from '../types/meetup';

export interface RecentRoomSummary {
  id: string;
  title: string;
  category: RoomCategory;
  visitedAt: number;
}

interface HomeScreenProps {
  user: AuthUserSummary | null;
  defaultName: string;
  defaultCategory?: RoomCategory;
  defaultDurationMinutes?: number;
  groups?: GroupWithMembers[];
  groupPreset?: FriendGroupDoc | null;
  onSelectGroupPreset?: (group: FriendGroupDoc | null) => void;
  onOpenGroups?: () => void;
  myRooms: RoomDoc[];
  recentRooms: RecentRoomSummary[];
  isCreating: boolean;
  onCreateRoom: (params: {
    title: string;
    category: RoomCategory;
    mode: RoomMode;
    durationMinutes: number;
    creatorName: string;
    initialTimeOptions: ReturnType<typeof createDefaultTimeOptions>;
  }) => Promise<void>;
  onOpenRoom: (roomId: string) => void;
  useDemoMode: boolean;
  onToggleDemoMode: () => void;
  authNotice: string | null;
}

const DURATION_CHOICES = [
  { minutes: 15, label: '15 דקות' },
  { minutes: 60, label: 'שעה' },
  { minutes: 180, label: '3 שעות' },
];

const CATEGORY_CARDS: Array<{
  id: RoomCategory;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'food', icon: Utensils },
  { id: 'movie', icon: Film },
  { id: 'activity', icon: Users },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  defaultName,
  defaultCategory = 'food',
  defaultDurationMinutes = 60,
  groups = [],
  groupPreset = null,
  onSelectGroupPreset,
  onOpenGroups,
  myRooms,
  recentRooms,
  isCreating,
  onCreateRoom,
  onOpenRoom,
  useDemoMode,
  onToggleDemoMode,
  authNotice,
}) => {
  const [title, setTitle] = useState('');
  const [creatorName, setCreatorName] = useState(defaultName);
  const [durationMinutes, setDurationMinutes] = useState<number>(defaultDurationMinutes);
  const [category, setCategory] = useState<RoomCategory>(defaultCategory);
  const [initialTimeOptions, setInitialTimeOptions] = useState(() =>
    createDefaultTimeOptions()
  );
  const [showTimeEditor, setShowTimeEditor] = useState(false);
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customTime, setCustomTime] = useState('20:30');
  const [joinCode, setJoinCode] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultName && !creatorName.trim()) {
      setCreatorName(defaultName);
    }
  }, [defaultName, creatorName]);

  useEffect(() => {
    if (groupPreset) {
      setCategory(groupPreset.defaultCategory);
      setTitle(`מפגש של ${groupPreset.name}`.slice(0, BLUEPRINT_LIMITS.TITLE_MAX));
    } else {
      setCategory(defaultCategory);
    }
  }, [groupPreset, defaultCategory]);

  useEffect(() => {
    setDurationMinutes(defaultDurationMinutes);
  }, [defaultDurationMinutes]);

  const effectiveCreatorName = creatorName.trim() || user?.displayName || '';
  const myRoomIds = new Set(myRooms.map((r) => r.id));
  const externalRecentRooms = recentRooms.filter((r) => !myRoomIds.has(r.id));

  const handleAddInitialTimeOption = () => {
    if (!customDate || !customTime) return;
    if (initialTimeOptions.length >= BLUEPRINT_LIMITS.TIME_SLOTS_MAX) return;
    const parsed = new Date(`${customDate}T${customTime}:00`);
    const dayFmt = Number.isNaN(parsed.getTime())
      ? customDate
      : parsed.toLocaleDateString('he-IL', {
          weekday: 'long',
          day: 'numeric',
          month: 'numeric',
        });
    const label = `${dayFmt} · ${customTime}`.slice(0, BLUEPRINT_LIMITS.TIME_LABEL_MAX);
    setInitialTimeOptions((prev) => [
      ...prev,
      {
        id: `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        label,
        dateIso: customDate,
        startTime: customTime,
      },
    ]);
  };

  const handleRemoveInitialTimeOption = (id: string) => {
    setInitialTimeOptions((prev) => (prev.length > 1 ? prev.filter((o) => o.id !== id) : prev));
  };

  const handleFullSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!effectiveCreatorName) {
      setFormError('יש להזין את שמך כדי לפתוח חדר.');
      return;
    }
    const roomTitle = title.trim() || 'ערב חברים';
    await onCreateRoom({
      title: roomTitle,
      category,
      mode: 'full',
      durationMinutes,
      creatorName: effectiveCreatorName,
      initialTimeOptions,
    });
  };

  const handleQuickDecision = async () => {
    setFormError(null);
    const nameToUse = effectiveCreatorName || 'מארגן';
    const quickTitle = title.trim() || CATEGORY_LABELS[category].title;
    await onCreateRoom({
      title: quickTitle,
      category,
      mode: 'quick',
      durationMinutes: 15,
      creatorName: nameToUse,
      initialTimeOptions: [],
    });
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode
      .trim()
      .replace(/^.*room=/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleaned.length >= 3) {
      onOpenRoom(cleaned);
    }
  };

  const handleCopyInvite = async (roomId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(roomId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-10">
      {authNotice && (
        <div className="mb-6 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <span>{authNotice}</span>
          <button
            type="button"
            onClick={onToggleDemoMode}
            className="text-xs font-semibold underline underline-offset-4 hover:opacity-80 cursor-pointer"
          >
            {useDemoMode ? 'חזור לסנכרון ענן' : 'עבור למצב הדגמה מקומי'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column: Hero + Create Room Form */}
        <section className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
              מתאמים מפגש ומחליטים יחד תוך דקה
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              פותחים חדר משותף, שולחים קישור לקבוצה, בוחרים שעה שמתאימה לכולם, מחליקים על רעיונות ומחלקים ציוד בזמן אמת.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#create-room-form"
                className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                <CalendarClock className="w-4 h-4" />
                <span>יצירת מפגש חדש</span>
              </a>

              <button
                type="button"
                onClick={handleQuickDecision}
                disabled={isCreating}
                className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <Zap className="w-4 h-4 text-[#1E3A5F] dark:text-[#6AA2E8]" />
                <span>החלטה מהירה ב-30 שניות</span>
              </button>
            </div>
          </div>

          <form
            id="create-room-form"
            onSubmit={handleFullSubmit}
            className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  פרטי המפגש החדש
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  החברים מצטרפים בלחיצה על הקישור עם שמם הפרטי בלבד
                </p>
              </div>
              {useDemoMode && (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  מצב הדגמה מקומי
                </span>
              )}
            </div>

            {groupPreset ? (
              <div className="rounded-xl bg-[#1E3A5F]/[0.06] dark:bg-[#4A7BB7]/15 border border-[#1E3A5F]/20 dark:border-[#4A7BB7]/30 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-[#1E3A5F] dark:text-[#6AA2E8]">
                    מפגש עבור הקבוצה: {groupPreset.name}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 mr-2 tabular-nums">
                    ({groupPreset.memberUids.length} חברים)
                  </span>
                </div>
                {onSelectGroupPreset && (
                  <button
                    type="button"
                    onClick={() => onSelectGroupPreset(null)}
                    aria-label="בטל שיוך קבוצה"
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              groups.length > 0 &&
              onSelectGroupPreset && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      התאמה מהירה לפי קבוצה שמורה:
                    </span>
                    {onOpenGroups && (
                      <button
                        type="button"
                        onClick={onOpenGroups}
                        className="text-[#1E3A5F] dark:text-[#6AA2E8] hover:underline underline-offset-4 cursor-pointer"
                      >
                        כל הקבוצות
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {groups.slice(0, 4).map(({ group }) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => onSelectGroupPreset(group)}
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 hover:border-[#1E3A5F] dark:hover:border-[#4A7BB7] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="creator-name-input"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  השם שלך
                </label>
                <input
                  id="creator-name-input"
                  type="text"
                  required
                  maxLength={BLUEPRINT_LIMITS.NAME_MAX}
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  placeholder={user?.displayName || 'לדוגמה: עומר'}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] dark:focus:border-[#4A7BB7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="event-title-input"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  שם המפגש
                </label>
                <input
                  id="event-title-input"
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.TITLE_MAX}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="לדוגמה: ערב שישי אצל עומר"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] dark:focus:border-[#4A7BB7]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                משך זמן להצבעה
              </span>
              <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/80">
                {DURATION_CHOICES.map((opt) => {
                  const active = durationMinutes === opt.minutes;
                  return (
                    <button
                      key={opt.minutes}
                      type="button"
                      onClick={() => setDurationMinutes(opt.minutes)}
                      className={`min-h-[40px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-white dark:bg-[#1E2936] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                קטגוריית החלקה
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {CATEGORY_CARDS.map(({ id, icon: Icon }) => {
                  const active = category === id;
                  const meta = CATEGORY_LABELS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCategory(id)}
                      className={`text-right p-3.5 rounded-xl border transition-colors cursor-pointer flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 ${
                        active
                          ? 'border-[#1E3A5F] dark:border-[#4A7BB7] bg-[#1E3A5F]/[0.05] dark:bg-[#4A7BB7]/10'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          active
                            ? 'text-[#1E3A5F] dark:text-[#6AA2E8]'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {meta.short}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {meta.title}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Collapsible Initial Time Slots Editor */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTimeEditor((v) => !v)}
                className="w-full min-h-[42px] px-3.5 py-2 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-900/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <span className="tabular-nums">
                  עריכת אפשרויות זמן התחלתיות ({initialTimeOptions.length})
                </span>
                {showTimeEditor ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showTimeEditor && (
                <div className="p-3.5 space-y-3 border-t border-slate-200/70 dark:border-slate-800 bg-white dark:bg-[#18202A]">
                  <ul className="space-y-1.5">
                    {initialTimeOptions.map((opt) => (
                      <li
                        key={opt.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <span>{opt.label}</span>
                        {initialTimeOptions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveInitialTimeOption(opt.id)}
                            aria-label={`הסר ${opt.label}`}
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      dir="ltr"
                      className="flex-1 min-w-[130px] min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      dir="ltr"
                      className="w-24 min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-xs text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddInitialTimeOption}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>הוסף</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInitialTimeOptions(createDefaultTimeOptions())}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline underline-offset-4 cursor-pointer mr-auto"
                    >
                      אפס לברירת מחדל
                    </button>
                  </div>
                </div>
              )}
            </div>

            {formError && (
              <p className="text-sm text-rose-600 dark:text-rose-400">{formError}</p>
            )}

            <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 min-h-[48px] px-6 py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isCreating ? 'יוצר חדר משותף...' : 'פתח חדר והתחל'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Secondary Column: Join by Code + My Created Rooms + Recently Visited Rooms */}
        <aside className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleJoinByCode}
            className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              קיבלת קישור או קוד חדר?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              הדבק כאן את קוד החדר (למשל abc123) או את הקישור המלא כדי להיכנס מיד.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="קוד חדר (לדוגמה: k7m9x2)"
                dir="ltr"
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>הצטרף</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                המפגשים שיצרתי
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {myRooms.length}
              </span>
            </div>

            {myRooms.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                עדיין לא נוצרו חדרים בחשבון זה.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {myRooms.map((rm) => (
                  <li
                    key={rm.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRoom(rm.id)}
                      className="text-right min-w-0 flex-1 cursor-pointer group"
                    >
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-[#1E3A5F] dark:group-hover:text-[#6AA2E8] transition-colors">
                        {rm.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{CATEGORY_LABELS[rm.category]?.short}</span>
                        <span aria-hidden="true">·</span>
                        <span>{rm.status === 'locked' ? 'נעול' : 'פתוח להצבעה'}</span>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr" className="font-mono-tabular">
                          {rm.id}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyInvite(rm.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      aria-label="העתק קישור הזמנה"
                      title="העתק קישור הזמנה"
                    >
                      {copiedId === rm.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {externalRecentRooms.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-500" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    חדרים שנפתחו לאחרונה
                  </h3>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {externalRecentRooms.length}
                </span>
              </div>

              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {externalRecentRooms.map((rm) => (
                  <li
                    key={rm.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRoom(rm.id)}
                      className="text-right min-w-0 flex-1 cursor-pointer group"
                    >
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-[#1E3A5F] dark:group-hover:text-[#6AA2E8] transition-colors">
                        {rm.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{CATEGORY_LABELS[rm.category]?.short}</span>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr" className="font-mono-tabular">
                          {rm.id}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyInvite(rm.id)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      aria-label="העתק קישור הזמנה"
                      title="העתק קישור הזמנה"
                    >
                      {copiedId === rm.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>סנכרון: {useDemoMode ? 'דפדפן מקומי (ללא שרת)' : 'Firebase בזמן אמת'}</span>
            <button
              type="button"
              onClick={onToggleDemoMode}
              className="underline underline-offset-4 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              {useDemoMode ? 'עבור ל-Firebase' : 'הדגמה מקומית'}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
};
