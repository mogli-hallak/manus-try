import React, { useState } from 'react';
import { Check, Lock, Plus, Trash2 } from 'lucide-react';
import { BLUEPRINT_LIMITS, ChecklistItemDoc } from '../types/meetup';

interface ChecklistTabProps {
  items: ChecklistItemDoc[];
  currentUid: string;
  isCreator: boolean;
  isLocked: boolean;
  onToggleClaim: (itemId: string) => Promise<void>;
  onAddItem: (label: string) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

const QUICK_SUGGESTIONS = [
  'קרח',
  'מים קרים',
  'מטען נייד',
  'מפיות',
  'שקיות אשפה',
  'קלפים / משחק',
];

export const ChecklistTab: React.FC<ChecklistTabProps> = ({
  items,
  currentUid,
  isCreator,
  isLocked,
  onToggleClaim,
  onAddItem,
  onDeleteItem,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newLabel.trim();
    if (!cleaned || isLocked) return;
    setAdding(true);
    try {
      await onAddItem(cleaned);
      setNewLabel('');
    } finally {
      setAdding(false);
    }
  };

  const handleQuickAdd = async (label: string) => {
    if (isLocked || adding) return;
    setAdding(true);
    try {
      await onAddItem(label);
    } finally {
      setAdding(false);
    }
  };

  const existingLabels = new Set(items.map((i) => i.label.trim()));
  const availableSuggestions = QUICK_SUGGESTIONS.filter(
    (s) => !existingLabels.has(s)
  );
  const claimedCount = items.filter((i) => Boolean(i.claimedByUid)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-display font-semibold text-slate-900 dark:text-slate-100">
            מי מביא מה?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            לחיצה על פריט פנוי משייכת אותו אליך ונועלת אותו משכפולים אצל כולם.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
          {claimedCount}/{items.length} שויכו
        </span>
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            אין פריטים ברשימה עדיין. הוסיפו פריט ראשון למטה.
          </p>
        ) : (
          items.map((item) => {
            const isMine = item.claimedByUid === currentUid;
            const isClaimedByOther = Boolean(item.claimedByUid) && !isMine;
            const canInteract = !isLocked && (!isClaimedByOther || isCreator);
            const canDelete =
              !isLocked && (isCreator || item.createdBy === currentUid);

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 pr-0 pl-2"
              >
                <button
                  type="button"
                  disabled={!canInteract}
                  onClick={() => void onToggleClaim(item.id)}
                  className={`flex-1 min-h-[56px] px-4 py-3 text-right flex items-center justify-between gap-3 transition-colors ${
                    canInteract
                      ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer'
                      : 'cursor-default opacity-85'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${
                        item.claimedByUid
                          ? isMine
                            ? 'bg-[#1E3A5F] dark:bg-[#4A7BB7] border-transparent text-white'
                            : 'bg-slate-200 dark:bg-slate-700 border-transparent text-slate-600 dark:text-slate-300'
                          : 'border-slate-300 dark:border-slate-600 bg-transparent'
                      }`}
                    >
                      {isMine ? (
                        <Check className="w-4 h-4" />
                      ) : isClaimedByOther ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : null}
                    </span>

                    <span
                      className={`text-sm font-medium truncate ${
                        item.claimedByUid
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  <span
                    className={`text-xs shrink-0 ${
                      isMine
                        ? 'font-semibold text-[#1E3A5F] dark:text-[#6AA2E8]'
                        : isClaimedByOther
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.claimedByName
                      ? `${item.claimedByName} מביא`
                      : 'לחץ לשיוך'}
                  </span>
                </button>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void onDeleteItem(item.id)}
                    aria-label="הסר פריט"
                    title="הסר פריט"
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {!isLocked && (
        <div className="space-y-2.5">
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.CHECKLIST_LABEL_MAX}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="הוסף פריט לרשימה (למשל: קרח, מנגל, כוסות)..."
              className="flex-1 min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18202A] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
            />
            <button
              type="submit"
              disabled={adding || !newLabel.trim()}
              className="min-h-[46px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>הוסף</span>
            </button>
          </form>

          {availableSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                הוספה מהירה:
              </span>
              {availableSuggestions.slice(0, 5).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={adding}
                  onClick={() => void handleQuickAdd(suggestion)}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
