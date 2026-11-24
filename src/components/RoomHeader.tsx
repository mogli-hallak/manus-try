import React, { useState } from 'react';
import { Check, Clock, Lock, Share2, Trash2 } from 'lucide-react';
import { ParticipantDoc, RoomDoc } from '../types/meetup';
import { formatRemainingTime } from '../utils/ranking';

interface RoomHeaderProps {
  room: RoomDoc;
  participants: ParticipantDoc[];
  nowMs: number;
  isCreator: boolean;
  onLockDecision: () => void;
  onRequestDeleteRoom: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  room,
  participants,
  nowMs,
  isCreator,
  onLockDecision,
  onRequestDeleteRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const { formatted, isExpired } = formatRemainingTime(room.endsAt, nowMs);

  const handleCopyShareLink = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const visibleParticipants = participants.slice(0, 5);
  const extraCount = Math.max(0, participants.length - 5);

  return (
    <div className="bg-white dark:bg-[#18202A] border-b border-slate-200/80 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-slate-100 truncate">
              {room.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-mono-tabular">
                <Clock className="w-3.5 h-3.5" />
                <span>{room.status === 'locked' ? 'החלטה נעולה' : isExpired ? '00:00' : formatted}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{participants.length} מחוברים</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Live participant avatars */}
          <div
            className="hidden sm:flex items-center -space-x-2 space-x-reverse pl-1"
            aria-label="משתתפים בחדר"
          >
            {visibleParticipants.map((p) => (
              <div
                key={p.uid}
                title={p.name}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ring-2 ring-white dark:ring-[#18202A] ${p.avatarTone}`}
              >
                {p.initials}
              </div>
            ))}
            {extraCount > 0 && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 ring-2 ring-white dark:ring-[#18202A] tabular-nums">
                +{extraCount}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>הועתק</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>שתף קישור</span>
              </>
            )}
          </button>

          {room.status === 'open' && isCreator && (
            <button
              type="button"
              onClick={onLockDecision}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>סגור החלטה</span>
            </button>
          )}

          {isCreator && (
            <button
              type="button"
              onClick={onRequestDeleteRoom}
              title="מחק חדר"
              aria-label="מחק חדר"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900/50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile participant strip */}
      {participants.length > 0 && (
        <div className="sm:hidden border-t border-slate-100 dark:border-slate-800/80 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {participants.map((p) => (
            <div key={p.uid} className="inline-flex items-center gap-1.5 shrink-0">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${p.avatarTone}`}
              >
                {p.initials}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
