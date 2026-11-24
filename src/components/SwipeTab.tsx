import React, { useCallback, useEffect, useState } from 'react';
import {
  AnimatePresence,
  PanInfo,
  motion,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { ArrowUp, Check, CheckCircle2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { CATEGORY_LABELS } from '../data/decks';
import {
  BLUEPRINT_LIMITS,
  DecisionCard,
  RankedCardResult,
  RoomCategory,
  SwipeScore,
} from '../types/meetup';

interface SwipeTabProps {
  category: RoomCategory;
  deck: DecisionCard[];
  myChoices: Record<string, SwipeScore>;
  ranked: RankedCardResult[];
  matchedCards: RankedCardResult[];
  currentUid: string;
  isCreator: boolean;
  isLocked: boolean;
  onSwipe: (cardId: string, score: SwipeScore) => Promise<void>;
  onUndoLast: (cardId: string) => Promise<void>;
  onAddCustomCard: (input: {
    title: string;
    subtitle: string;
    metaTag: string;
    description: string;
  }) => Promise<void>;
  onDeleteCustomCard: (cardId: string) => Promise<void>;
}

interface DraggableCardProps {
  card: DecisionCard;
  onSwipe: (score: SwipeScore) => void;
  disabled: boolean;
  canDelete: boolean;
  onDelete?: () => void;
}

const DraggableDecisionCard: React.FC<DraggableCardProps> = ({
  card,
  onSwipe,
  disabled,
  canDelete,
  onDelete,
}) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-10, 10]);

  const likeOpacity = useTransform(x, [35, 110], [0, 1]);
  const skipOpacity = useTransform(x, [-110, -35], [1, 0]);
  const superOpacity = useTransform(y, [-110, -35], [1, 0]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (disabled) return;
    if (info.offset.y < -85 && Math.abs(info.offset.x) < 110) {
      onSwipe(2);
    } else if (info.offset.x > 85) {
      onSwipe(1);
    } else if (info.offset.x < -85) {
      onSwipe(0);
    }
  };

  return (
    <motion.div
      style={{ x, y, rotate }}
      drag={!disabled}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.85}
      onDragEnd={handleDragEnd}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className="relative w-full rounded-3xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-6 sm:p-7 shadow-sm select-none touch-none cursor-grab active:cursor-grabbing min-h-[250px] flex flex-col justify-between"
    >
      {/* Subtle swipe direction hints */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute top-5 right-5 rounded-lg border border-emerald-600/40 bg-emerald-50/90 dark:bg-emerald-950/80 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
      >
        בעד (+1)
      </motion.div>
      <motion.div
        style={{ opacity: skipOpacity }}
        className="pointer-events-none absolute top-5 left-5 rounded-lg border border-slate-400/40 bg-slate-100/90 dark:bg-slate-800/90 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300"
      >
        דלג
      </motion.div>
      <motion.div
        style={{ opacity: superOpacity }}
        className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 rounded-lg border border-[#1E3A5F]/40 bg-slate-50/95 dark:bg-slate-800/95 px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] dark:text-[#6AA2E8]"
      >
        עדיפות גבוהה (+2)
      </motion.div>

      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{card.subtitle}</span>
            <span aria-hidden="true">·</span>
            <span>{card.metaTag}</span>
            {card.isCustom && card.createdByName && (
              <>
                <span aria-hidden="true">·</span>
                <span>הצעה של {card.createdByName}</span>
              </>
            )}
          </div>

          {canDelete && onDelete && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
              title="מחק הצעה מותאמת אישית"
              aria-label="מחק הצעה"
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <h3 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-slate-100 leading-snug">
          {card.title}
        </h3>

        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          {card.description}
        </p>
      </div>

      <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>החלק ימינה לבעד · שמאלה לדילוג · למעלה לעדיפות גבוהה</span>
      </div>
    </motion.div>
  );
};

export const SwipeTab: React.FC<SwipeTabProps> = ({
  category,
  deck,
  myChoices,
  ranked,
  matchedCards,
  currentUid,
  isCreator,
  isLocked,
  onSwipe,
  onUndoLast,
  onAddCustomCard,
  onDeleteCustomCard,
}) => {
  const [history, setHistory] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAllRanked, setShowAllRanked] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customSubtitle, setCustomSubtitle] = useState('');
  const [customMeta, setCustomMeta] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [submittingCard, setSubmittingCard] = useState(false);

  const remainingCards = deck.filter((c) => myChoices[c.id] === undefined);
  const currentCard = remainingCards[0] ?? null;
  const nextCard = remainingCards[1] ?? null;
  const swipedCount = deck.length - remainingCards.length;
  const deckProgress = deck.length > 0 ? Math.round((swipedCount / deck.length) * 100) : 0;

  const handleCardDecision = useCallback(
    async (score: SwipeScore) => {
      if (!currentCard || isLocked) return;
      setHistory((prev) => [...prev, currentCard.id]);
      await onSwipe(currentCard.id, score);
    },
    [currentCard, isLocked, onSwipe]
  );

  const handleUndo = useCallback(async () => {
    if (isLocked || history.length === 0) return;
    const lastId = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    await onUndoLast(lastId);
  }, [isLocked, history, onUndoLast]);

  // Keyboard shortcuts for desktop accessibility (Right = Like, Left = Skip, Up = Super, Backspace = Undo)
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (isLocked || showAddForm) return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (ev.key === 'ArrowRight' && currentCard) {
        ev.preventDefault();
        void handleCardDecision(1);
      } else if (ev.key === 'ArrowLeft' && currentCard) {
        ev.preventDefault();
        void handleCardDecision(0);
      } else if (ev.key === 'ArrowUp' && currentCard) {
        ev.preventDefault();
        void handleCardDecision(2);
      } else if (ev.key === 'Backspace' && history.length > 0) {
        ev.preventDefault();
        void handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLocked, showAddForm, currentCard, history.length, handleCardDecision, handleUndo]);

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || isLocked) return;
    setSubmittingCard(true);
    try {
      await onAddCustomCard({
        title: customTitle.trim(),
        subtitle: customSubtitle.trim() || CATEGORY_LABELS[category].short,
        metaTag:
          customMeta.trim() ||
          (category === 'food' ? '₪₪' : category === 'movie' ? 'צפייה משותפת' : 'רעיון קבוצתי'),
        description: customDesc.trim() || 'הצעה שהוספה על ידי משתתף בחדר.',
      });
      setCustomTitle('');
      setCustomSubtitle('');
      setCustomMeta('');
      setCustomDesc('');
      setShowAddForm(false);
    } finally {
      setSubmittingCard(false);
    }
  };

  const positiveRanked = ranked.filter((r) => r.totalPoints > 0);
  const displayedRanked = showAllRanked ? positiveRanked : positiveRanked.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header row + Add Custom Idea trigger */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-semibold text-slate-900 dark:text-slate-100">
              {CATEGORY_LABELS[category].title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              {swipedCount} מתוך {deck.length} כרטיסיות דורגו על ידך
            </p>
          </div>

          {!isLocked && (
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18202A] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{CATEGORY_LABELS[category].customActionLabel}</span>
            </button>
          )}
        </div>

        {/* Thin deck progress bar */}
        <div className="h-1 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1E3A5F] dark:bg-[#4A7BB7] transition-all duration-300"
            style={{ width: `${deckProgress}%` }}
          />
        </div>
      </div>

      {/* Add custom card form */}
      {showAddForm && !isLocked && (
        <form
          onSubmit={handleCreateCustom}
          className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200 dark:border-slate-800 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              הוספת רעיון חדש לחפיסה המשותפת
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              סגור
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              required
              maxLength={BLUEPRINT_LIMITS.TITLE_MAX}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="שם ההצעה (חובה)"
              className="sm:col-span-2 min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.CARD_META_MAX}
              value={customMeta}
              onChange={(e) => setCustomMeta(e.target.value)}
              placeholder={category === 'food' ? 'מחיר (₪ / ₪₪)' : 'משך / עלות'}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.CARD_SUBTITLE_MAX}
              value={customSubtitle}
              onChange={(e) => setCustomSubtitle(e.target.value)}
              placeholder="קטגוריה / ז׳אנר"
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              maxLength={BLUEPRINT_LIMITS.CARD_DESC_MAX}
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="תיאור קצר בשורה אחת"
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={submittingCard || !customTitle.trim()}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
          >
            {submittingCard ? 'שומר...' : 'הוסף לחפיסה של כולם'}
          </button>
        </form>
      )}

      {/* Real-time Group Match Banner */}
      {matchedCards.length > 0 && (
        <div className="rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 px-4 py-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <div className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                נמצאה התאמה קבוצתית
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 tabular-nums shrink-0">
              {matchedCards.length} התאמות
            </span>
          </div>
          <div className="text-xs text-emerald-800 dark:text-emerald-300 pr-7 leading-relaxed">
            {matchedCards
              .slice(0, 3)
              .map((m) => `${m.card.title} (${m.consensusPercent}%)`)
              .join(' · ')}
          </div>
        </div>
      )}

      {/* Swipe Card Stack */}
      <div className="relative">
        {currentCard ? (
          <div className="space-y-4">
            <div className="relative">
              {nextCard && (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-3 top-3 bottom-0 rounded-3xl bg-slate-100 dark:bg-[#141A23] border border-slate-200/70 dark:border-slate-800/70 opacity-70 pointer-events-none"
                />
              )}

              <AnimatePresence mode="popLayout">
                <DraggableDecisionCard
                  key={currentCard.id}
                  card={currentCard}
                  disabled={isLocked}
                  canDelete={
                    !isLocked &&
                    Boolean(currentCard.isCustom) &&
                    (isCreator || currentCard.createdBy === currentUid)
                  }
                  onDelete={() => void onDeleteCustomCard(currentCard.id)}
                  onSwipe={handleCardDecision}
                />
              </AnimatePresence>
            </div>

            {!isLocked && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void handleCardDecision(0)}
                  className="min-h-[48px] flex-1 max-w-[130px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4 text-slate-500" />
                  <span>דלג</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleCardDecision(2)}
                  className="min-h-[48px] flex-1 max-w-[155px] px-4 py-2.5 rounded-2xl border border-[#1E3A5F]/30 dark:border-[#4A7BB7]/40 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-[#1E3A5F] dark:text-[#7EB2F2] text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4" />
                  <span>עדיפות גבוהה</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleCardDecision(1)}
                  className="min-h-[48px] flex-1 max-w-[130px] px-4 py-2.5 rounded-2xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>בעד</span>
                </button>

                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleUndo()}
                    title="בטל החלקה אחרונה"
                    aria-label="בטל החלקה אחרונה"
                    className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#18202A] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-3xl bg-white dark:bg-[#18202A] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              עברת על כל הכרטיסיות בחפיסה
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              ניתן לצפות בדירוג הקבוצתי החי למטה או להוסיף רעיון נוסף.
            </p>
            {history.length > 0 && !isLocked && (
              <button
                type="button"
                onClick={() => void handleUndo()}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>חזור לכרטיסייה הקודמת</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Ranked Leaderboard */}
      <section className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            דירוג חי לפי נקודות והסכמה
          </h3>
          {positiveRanked.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllRanked((v) => !v)}
              className="text-xs font-medium text-[#1E3A5F] dark:text-[#6AA2E8] hover:underline underline-offset-4 cursor-pointer"
            >
              {showAllRanked ? 'הצג פחות' : `הצג הכל (${positiveRanked.length})`}
            </button>
          )}
        </div>

        {positiveRanked.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
            החליקו ימינה או למעלה על כרטיסיות כדי לבנות את הדירוג הקבוצתי.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {displayedRanked.map((entry, idx) => (
              <li
                key={entry.card.id}
                className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex items-baseline gap-2.5">
                  <span className="text-xs font-mono-tabular text-slate-400 w-5 shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {entry.card.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span>{entry.card.subtitle}</span>
                      {entry.voterNames.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{entry.voterNames.join(', ')}</span>
                        </>
                      )}
                      {entry.isGroupMatch && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            התאמה קבוצתית
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-left shrink-0 tabular-nums">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {entry.totalPoints} נק׳
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {entry.consensusPercent}%
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
