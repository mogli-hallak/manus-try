import React, { useState } from 'react';
import { Calendar, Check, Plus, Trash2 } from 'lucide-react';
import { BLUEPRINT_LIMITS, TimeOptionSummary } from '../types/meetup';

interface WhenTabProps {
  summaries: TimeOptionSummary[];
  mySlotIds: string[];
  currentUid: string;
  isCreator: boolean;
  isLocked: boolean;
  onToggleVote: (slotId: string) => Promise<void>;
  onAddTimeOption: (label: string, dateIso: string, startTime: string) => Promise<void>;
  onDeleteTimeOption: (slotId: string) => Promise<void>;
}

export const WhenTab: React.FC<WhenTabProps> = ({
  summaries,
  mySlotIds,
  currentUid,
  isCreator,
  isLocked,
  onToggleVote,
  onAddTimeOption,
  onDeleteTimeOption,
}) => {
  const [newDate, setNewDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [newTime, setNewTime] = useState('20:30');
  const [customLabel, setCustomLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const maxVotes = Math.max(0, ...summaries.map((s) => s.voteCount));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    let label = customLabel.trim();
    if (!label) {
      const parsed = new Date(`${newDate}T${newTime}:00`);
      const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
      const dayStr = Number.isNaN(parsed.getTime())
        ? newDate
        : `יום ${dayNames[parsed.getDay()]} ${parsed.getDate()}.${parsed.getMonth() + 1}`;
      label = `${dayStr} · ${newTime}`;
    }

    setAdding(true);
    try {
      await onAddTimeOption(label, newDate, newTime);
      setCustomLabel('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-display font-semibold text-slate-900 dark:text-slate-100">
            מתי נוח לכולם?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            סמנו את כל המועדים שמתאימים לכם. התוצאות מתעדכנות בזמן אמת.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {summaries.map((item) => {
          const isSelected = mySlotIds.includes(item.option.id);
          const isLeading = maxVotes > 0 && item.voteCount === maxVotes;
          const canDelete =
            !isLocked &&
            summaries.length > 1 &&
            (isCreator || item.option.createdBy === currentUid);

          return (
            <div
              key={item.option.id}
              className={`rounded-2xl border p-4 transition-colors ${
                isSelected
                  ? 'bg-[#1E3A5F]/[0.05] dark:bg-[#4A7BB7]/10 border-[#1E3A5F] dark:border-[#4A7BB7]'
                  : 'bg-white dark:bg-[#18202A] border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onToggleVote(item.option.id)}
                  className="flex-1 min-h-[40px] text-right flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-[#1E3A5F] dark:bg-[#4A7BB7] border-transparent text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </span>
                    <span className="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.option.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isLeading && (
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        מועד מוביל
                      </span>
                    )}
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                      {item.voteCount} זמינים
                    </span>
                  </div>
                </button>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void onDeleteTimeOption(item.option.id)}
                    aria-label="הסר אפשרות זמן"
                    title="הסר אפשרות זמן"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Thin live progress bar */}
              <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#1E3A5F] dark:bg-[#4A7BB7] transition-all duration-300"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="truncate">
                  {item.voterNames.length > 0
                    ? item.voterNames.join(' · ')
                    : 'עדיין ללא הצבעות'}
                </span>
                <span className="tabular-nums shrink-0">{item.percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {!isLocked && (
        <form
          onSubmit={handleAdd}
          className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span>הוסף אפשרות זמן נוספת</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.TIME_LABEL_MAX}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="כותרת (אופציונלי)"
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={adding}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            <span>{adding ? 'מוסיף...' : 'הוסף שעה להצבעה'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
