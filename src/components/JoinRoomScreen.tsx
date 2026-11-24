import React, { useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { CATEGORY_LABELS } from '../data/decks';
import { AuthUserSummary, BLUEPRINT_LIMITS, RoomDoc } from '../types/meetup';
import { GoogleSignInButton } from './GoogleSignInButton';

interface JoinRoomScreenProps {
  room: RoomDoc | null;
  roomId: string;
  isLoading: boolean;
  user: AuthUserSummary | null;
  defaultName: string;
  onJoin: (name: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  onBackHome: () => void;
  authNotice: string | null;
}

export const JoinRoomScreen: React.FC<JoinRoomScreenProps> = ({
  room,
  roomId,
  isLoading,
  user,
  defaultName,
  onJoin,
  onGoogleSignIn,
  onBackHome,
  authNotice,
}) => {
  const [name, setName] = useState(defaultName || user?.displayName || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) return;
    setSubmitting(true);
    try {
      await onJoin(cleaned);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-[#1E3A5F] rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500 dark:text-slate-400">טוען פרטי מפגש...</p>
      </div>
    );
  }

  if (!room && !user) {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              חדר <span dir="ltr" className="font-mono-tabular">{roomId}</span>
            </p>
            <h1 className="text-xl font-display font-bold text-slate-900 dark:text-slate-100">
              הצטרפות למפגש משותף
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              הקלד את שמך הפרטי כדי להיכנס לחדר ולהצביע יחד עם החברים.
            </p>
          </div>

          {authNotice && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 text-xs text-amber-900 dark:text-amber-200">
              {authNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <label
              htmlFor="guest-name-input"
              className="block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              מה השם שלך?
            </label>
            <input
              id="guest-name-input"
              type="text"
              required
              autoFocus
              maxLength={BLUEPRINT_LIMITS.NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: נועה"
              className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
            />
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{submitting ? 'מתחבר לחדר...' : 'כניסה לחדר'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white dark:bg-[#18202A] text-slate-400">
                או התחברות מזוהה
              </span>
            </div>
          </div>

          <GoogleSignInButton
            onClick={onGoogleSignIn}
            label="המשך עם Google"
            className="w-full"
          />
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="max-w-md mx-auto px-4 py-12">
        <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200 dark:border-slate-800 p-6 shadow-xs text-center space-y-4">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            החדר לא נמצא
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ייתכן שהמפגש נמחק על ידי המארגן או שקוד החדר שגוי.
          </p>
          <button
            type="button"
            onClick={onBackHome}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1E3A5F] text-white text-sm font-medium hover:bg-[#172E4B] transition-colors cursor-pointer"
          >
            חזרה למסך הבית
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Users className="w-3.5 h-3.5" />
            <span>הזמנה מאת {room.creatorName}</span>
            <span aria-hidden="true">·</span>
            <span>{CATEGORY_LABELS[room.category]?.short}</span>
          </div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-slate-100">
            {room.title}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label
            htmlFor="join-name-input"
            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            איך להציג אותך בקבוצה?
          </label>
          <input
            id="join-name-input"
            type="text"
            required
            autoFocus
            maxLength={BLUEPRINT_LIMITS.NAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="השם הפרטי שלך"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
          />
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>{submitting ? 'מצטרף...' : 'היכנס לחדר המשותף'}</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </form>
      </div>
    </main>
  );
};
