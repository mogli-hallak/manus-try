import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Moon,
  Save,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { AVATAR_TONES, CATEGORY_LABELS, extractInitials } from '../data/decks';
import {
  AuthUserSummary,
  BLUEPRINT_LIMITS,
  RoomCategory,
  UserProfileDoc,
} from '../types/meetup';

interface ProfileSettingsViewProps {
  profile: UserProfileDoc | null;
  authUser: AuthUserSummary | null;
  darkMode: boolean;
  onToggleDarkMode: (nextDark: boolean) => void;
  useDemoMode: boolean;
  onToggleDemoMode: () => void;
  canToggleCloud: boolean;
  recentRoomsCount: number;
  onClearRecentRooms: () => void;
  onSaveProfile: (patch: {
    displayName: string;
    bio: string;
    city: string;
    avatarTone: string;
    defaultCategory: RoomCategory;
    defaultDurationMinutes: number;
    notifyMeetingStarting: boolean;
    notifyDecisionFinalized: boolean;
    notifyChecklistAdded: boolean;
    showCityOnPublicCard: boolean;
  }) => Promise<void>;
}

const DURATION_OPTIONS = [
  { minutes: 15, label: '15 דקות' },
  { minutes: 60, label: 'שעה' },
  { minutes: 180, label: '3 שעות' },
];

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  profile,
  authUser,
  darkMode,
  onToggleDarkMode,
  useDemoMode,
  onToggleDemoMode,
  canToggleCloud,
  recentRoomsCount,
  onClearRecentRooms,
  onSaveProfile,
}) => {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [avatarTone, setAvatarTone] = useState(
    profile?.avatarTone ?? AVATAR_TONES[1]
  );
  const [defaultCategory, setDefaultCategory] = useState<RoomCategory>(
    profile?.defaultCategory ?? 'food'
  );
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState<number>(
    profile?.defaultDurationMinutes ?? 60
  );
  const [notifyMeetingStarting, setNotifyMeetingStarting] = useState<boolean>(
    profile?.notifyMeetingStarting ?? true
  );
  const [notifyDecisionFinalized, setNotifyDecisionFinalized] = useState<boolean>(
    profile?.notifyDecisionFinalized ?? true
  );
  const [notifyChecklistAdded, setNotifyChecklistAdded] = useState<boolean>(
    profile?.notifyChecklistAdded ?? true
  );
  const [showCityOnPublicCard, setShowCityOnPublicCard] = useState<boolean>(
    profile?.showCityOnPublicCard ?? true
  );

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [clearedHistory, setClearedHistory] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setCity(profile.city);
    setAvatarTone(profile.avatarTone);
    setDefaultCategory(profile.defaultCategory);
    setDefaultDurationMinutes(profile.defaultDurationMinutes);
    setNotifyMeetingStarting(profile.notifyMeetingStarting);
    setNotifyDecisionFinalized(profile.notifyDecisionFinalized);
    setNotifyChecklistAdded(profile.notifyChecklistAdded);
    setShowCityOnPublicCard(profile.showCityOnPublicCard);
  }, [profile]);

  const previewInitials = extractInitials(displayName || 'אורח');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!displayName.trim()) {
      setSaveError('יש להזין שם תצוגה.');
      return;
    }
    setSaving(true);
    try {
      await onSaveProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        city: city.trim(),
        avatarTone,
        defaultCategory,
        defaultDurationMinutes,
        notifyMeetingStarting,
        notifyDecisionFinalized,
        notifyChecklistAdded,
        showCityOnPublicCard,
      });
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'שמירת הפרופיל נכשלה, נסו שנית.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFriendCode = async () => {
    if (!profile?.friendCode) return;
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyFriendLink = async () => {
    if (!profile?.friendCode) return;
    const url = `${window.location.origin}${window.location.pathname}?addFriend=${encodeURIComponent(
      profile.friendCode
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-12">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
          פרופיל והגדרות
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ניהול כרטיס החבר האישי שלך, העדפות יצירת מפגשים והתראות ברירת מחדל.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Main Column: Profile Identity */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <span
                className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${avatarTone}`}
              >
                {previewInitials}
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {displayName.trim() || 'הפרופיל שלך'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {authUser?.isGoogleUser && authUser.email
                    ? authUser.email
                    : useDemoMode
                      ? 'פרופיל מקומי במצב הדגמה'
                      : 'מחובר כאורח מאומת'}
                </div>
              </div>
            </div>
          </div>

          {/* Avatar Color Selection */}
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              צבע אווטאר
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {AVATAR_TONES.map((tone) => {
                const selected = avatarTone === tone;
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => setAvatarTone(tone)}
                    aria-label="בחר צבע אווטאר"
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-transform cursor-pointer ${tone} ${
                      selected
                        ? 'ring-2 ring-offset-2 ring-[#1E3A5F] dark:ring-[#6AA2E8] dark:ring-offset-[#18202A] scale-105'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {selected ? <Check className="w-4 h-4" /> : previewInitials}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="profile-name-input"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                שם תצוגה
              </label>
              <input
                id="profile-name-input"
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="השם שיוצג לחברים"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="profile-city-input"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                עיר או אזור
              </label>
              <input
                id="profile-city-input"
                type="text"
                maxLength={BLUEPRINT_LIMITS.CITY_MAX}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="לדוגמה: תל אביב"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-bio-input"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              העדפות אישיות / תיאור קצר
            </label>
            <textarea
              id="profile-bio-input"
              rows={2}
              maxLength={BLUEPRINT_LIMITS.BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="לדוגמה: מעדיף אוכל צמחוני, פנוי בדרך כלל בערבי חמישי"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 resize-none"
            />
          </div>

          <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
            <span className="text-sm text-slate-700 dark:text-slate-300">
              הצג עיר בכרטיס החבר הציבורי שלי
            </span>
            <input
              type="checkbox"
              checked={showCityOnPublicCard}
              onChange={(e) => setShowCityOnPublicCard(e.target.checked)}
              className="w-5 h-5 accent-[#1E3A5F] rounded cursor-pointer"
            />
          </label>

          {/* Shareable Friend Code Box */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  קוד החבר האישי שלך
                </div>
                <div
                  dir="ltr"
                  className="text-lg font-mono font-bold tracking-wider text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums"
                >
                  {profile?.friendCode || '------'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyFriendCode}
                  disabled={!profile?.friendCode}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>הועתק</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>העתק קוד</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyFriendLink}
                  disabled={!profile?.friendCode}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>קישור הועתק</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" />
                      <span>קישור להוספה</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              חברים שמזינים קוד זה או פותחים את הקישור יכולים לשלוח לך בקשת חברות ולהזמין אותך לקבוצות.
            </p>
          </div>
        </section>

        {/* Right / Secondary Column: App & Meetup Settings */}
        <aside className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <User className="w-4 h-4 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                הגדרות והעדפות ברירת מחדל
              </h2>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                מצב תצוגה
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/80">
                <button
                  type="button"
                  onClick={() => onToggleDarkMode(false)}
                  className={`min-h-[40px] rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    !darkMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>בהיר</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleDarkMode(true)}
                  className={`min-h-[40px] rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    darkMode
                      ? 'bg-[#1E2936] text-slate-100 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>כהה</span>
                </button>
              </div>
            </div>

            {/* Default Category */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                קטגוריית ברירת מחדל במפגש חדש
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['food', 'movie', 'activity'] as RoomCategory[]).map((cat) => {
                  const active = defaultCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setDefaultCategory(cat)}
                      className={`min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer truncate ${
                        active
                          ? 'border-[#1E3A5F] dark:border-[#4A7BB7] bg-[#1E3A5F]/[0.06] dark:bg-[#4A7BB7]/15 text-[#1E3A5F] dark:text-[#6AA2E8]'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {CATEGORY_LABELS[cat].short}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Default Voting Duration */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                משך זמן ברירת מחדל להצבעה
              </span>
              <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/80">
                {DURATION_OPTIONS.map((opt) => {
                  const active = defaultDurationMinutes === opt.minutes;
                  return (
                    <button
                      key={opt.minutes}
                      type="button"
                      onClick={() => setDefaultDurationMinutes(opt.minutes)}
                      className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-white dark:bg-[#1E2936] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Default Notifications */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                העדפות התראות ברירת מחדל
              </span>

              <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  התראה לפני תחילת מפגש
                </span>
                <input
                  type="checkbox"
                  checked={notifyMeetingStarting}
                  onChange={(e) => setNotifyMeetingStarting(e.target.checked)}
                  className="w-4 h-4 accent-[#1E3A5F] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  התראה כשההחלטה ננעלת
                </span>
                <input
                  type="checkbox"
                  checked={notifyDecisionFinalized}
                  onChange={(e) => setNotifyDecisionFinalized(e.target.checked)}
                  className="w-4 h-4 accent-[#1E3A5F] rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  התראה על פריט ציוד חדש
                </span>
                <input
                  type="checkbox"
                  checked={notifyChecklistAdded}
                  onChange={(e) => setNotifyChecklistAdded(e.target.checked)}
                  className="w-4 h-4 accent-[#1E3A5F] rounded cursor-pointer"
                />
              </label>
            </div>

            {saveError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{saveError}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {savedNotice ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>הפרופיל וההגדרות נשמרו</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'שומר שינויים...' : 'שמור פרופיל והגדרות'}</span>
                </>
              )}
            </button>
          </div>

          {/* Sync & History Utilities */}
          <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                סנכרון נתונים: {useDemoMode ? 'מקומי בדפדפן' : 'Firebase בזמן אמת'}
              </span>
              {canToggleCloud && (
                <button
                  type="button"
                  onClick={onToggleDemoMode}
                  className="font-medium text-[#1E3A5F] dark:text-[#6AA2E8] underline underline-offset-4 cursor-pointer"
                >
                  {useDemoMode ? 'עבור לענן Firebase' : 'עבור להדגמה מקומית'}
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                חדרים בהיסטוריה המקומית ({recentRoomsCount})
              </span>
              <button
                type="button"
                disabled={recentRoomsCount === 0}
                onClick={() => {
                  onClearRecentRooms();
                  setClearedHistory(true);
                  window.setTimeout(() => setClearedHistory(false), 2000);
                }}
                className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearedHistory ? 'נוקה' : 'נקה היסטוריה'}</span>
              </button>
            </div>
          </div>
        </aside>
      </form>
    </main>
  );
};
