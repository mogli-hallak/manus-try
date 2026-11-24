import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarClock, Flame, ListChecks, UserCheck, UserPlus, X } from 'lucide-react';
import { CATEGORY_LABELS, DECKS_BY_CATEGORY } from '../data/decks';
import {
  DecisionCard,
  ParticipantDoc,
  RoomTab,
  SwipeScore,
} from '../types/meetup';
import {
  RoomBundle,
  addRoomChecklistItem,
  addRoomCustomCard,
  addRoomTimeOption,
  deleteRoomChecklistItem,
  deleteRoomCustomCard,
  deleteRoomTimeOption,
  lockMeetupRoom,
  recordUserSwipe,
  toggleRoomChecklistClaim,
  toggleUserTimeVote,
} from '../services/roomService';
import {
  getLocalNotificationPref,
  notifyRoomPushEvent,
  scheduleMeetingPushReminder,
  showServiceWorkerNotification,
} from '../services/pushService';
import { computeCardRankings, computeTimeSummaries } from '../utils/ranking';
import { ChecklistTab } from './ChecklistTab';
import { ConfirmModal } from './ConfirmModal';
import { PushNotificationsControl } from './PushNotificationsControl';
import { RoomHeader } from './RoomHeader';
import { SummaryScreen } from './SummaryScreen';
import { SwipeTab } from './SwipeTab';
import { WhenTab } from './WhenTab';

interface RoomWorkspaceProps {
  bundle: RoomBundle;
  currentUid: string;
  currentUserName: string;
  useDemoMode: boolean;
  hasCalendarToken: boolean;
  savedFriendUids?: Set<string>;
  onAddFriendFromParticipant?: (participant: ParticipantDoc) => Promise<void>;
  onRequestGoogleAuth: () => Promise<string | null>;
  getCalendarToken: () => string | null;
  onDeleteRoom: () => Promise<void>;
  onCreateNewRoom: () => void;
}

interface ForegroundAlert {
  id: string;
  title: string;
  body: string;
}

export const RoomWorkspace: React.FC<RoomWorkspaceProps> = ({
  bundle,
  currentUid,
  currentUserName,
  useDemoMode,
  hasCalendarToken,
  savedFriendUids,
  onAddFriendFromParticipant,
  onRequestGoogleAuth,
  getCalendarToken,
  onDeleteRoom,
  onCreateNewRoom,
}) => {
  const room = bundle.room!;
  const isCreator = room.creatorId === currentUid;

  const [activeTab, setActiveTab] = useState<RoomTab>(
    room.mode === 'quick' ? 'swipe' : 'when'
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addingFriendUid, setAddingFriendUid] = useState<string | null>(null);
  const [foregroundAlert, setForegroundAlert] = useState<ForegroundAlert | null>(null);
  const autoLockedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!foregroundAlert) return;
    const t = window.setTimeout(() => setForegroundAlert(null), 5500);
    return () => window.clearTimeout(t);
  }, [foregroundAlert]);

  const isExpired = nowMs >= room.endsAt;
  const isLocked = room.status === 'locked' || isExpired;

  // Build combined swipe deck (custom cards first so everyone sees new ideas immediately + 25+ built-in items)
  const deck: DecisionCard[] = useMemo(() => {
    const custom: DecisionCard[] = bundle.customCards.map((c) => ({
      id: c.id,
      category: c.category,
      title: c.title,
      subtitle: c.subtitle,
      metaTag: c.metaTag,
      description: c.description,
      isCustom: true,
      createdBy: c.createdBy,
      createdByName: c.createdByName,
    }));
    const base = DECKS_BY_CATEGORY[room.category] ?? [];
    return [...custom, ...base];
  }, [bundle.customCards, room.category]);

  const { summaries: timeSummaries, winningTime } = useMemo(
    () => computeTimeSummaries(bundle.timeOptions, bundle.timeVotes, bundle.participants),
    [bundle.timeOptions, bundle.timeVotes, bundle.participants]
  );

  const { ranked, matchedCards, topWinner } = useMemo(
    () => computeCardRankings(deck, bundle.swipes, bundle.participants),
    [deck, bundle.swipes, bundle.participants]
  );

  const resolvedWinningTime = useMemo(() => {
    if (room.selectedTimeSlotId) {
      const explicit = timeSummaries.find((s) => s.option.id === room.selectedTimeSlotId);
      if (explicit) return explicit;
    }
    return winningTime;
  }, [room.selectedTimeSlotId, timeSummaries, winningTime]);

  const resolvedWinningCard = useMemo(() => {
    if (room.selectedCardId) {
      const explicit = ranked.find((r) => r.card.id === room.selectedCardId);
      if (explicit) return explicit;
    }
    return topWinner;
  }, [room.selectedCardId, ranked, topWinner]);

  const prevStatusRef = useRef(room.status);
  const prevChecklistIdsRef = useRef<Set<string> | null>(null);
  const meetingReminderNotifiedRef = useRef(false);
  const votingEndingNotifiedRef = useRef(false);

  const resolveWinningTimeMs = (): number | null => {
    if (!resolvedWinningTime?.option.dateIso || !resolvedWinningTime?.option.startTime) {
      return null;
    }
    const parsed = new Date(
      `${resolvedWinningTime.option.dateIso}T${resolvedWinningTime.option.startTime}:00`
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  };

  // Schedule backend Web Push reminder once a future meeting time has real votes or is locked
  useEffect(() => {
    const hasVotesOrLocked =
      Boolean(resolvedWinningTime) &&
      ((resolvedWinningTime?.voteCount ?? 0) > 0 || isLocked);
    if (!hasVotesOrLocked) return;

    const meetingMs = resolveWinningTimeMs();
    if (!meetingMs || meetingMs <= Date.now()) return;
    void scheduleMeetingPushReminder({
      roomId: room.id,
      roomTitle: room.title,
      meetingTimeMs: meetingMs,
      meetingLabel: resolvedWinningTime?.option.label,
    });
  }, [
    room.id,
    room.title,
    isLocked,
    resolvedWinningTime?.option.id,
    resolvedWinningTime?.option.dateIso,
    resolvedWinningTime?.option.startTime,
    resolvedWinningTime?.option.label,
    resolvedWinningTime?.voteCount,
  ]);

  // Monitor upcoming meeting start and voting countdown for foreground toast / background SW fallback
  useEffect(() => {
    const localPref = getLocalNotificationPref(room.id);
    const wantsMeetingAlert = Boolean(localPref?.enabled && localPref.preferences.meetingStarting);

    const hasConfirmedTime =
      Boolean(resolvedWinningTime) &&
      ((resolvedWinningTime?.voteCount ?? 0) > 0 || isLocked);
    const meetingMs = hasConfirmedTime ? resolveWinningTimeMs() : null;

    if (!meetingReminderNotifiedRef.current && meetingMs && meetingMs > nowMs) {
      const diffMs = meetingMs - nowMs;
      if (diffMs <= 15 * 60 * 1000) {
        meetingReminderNotifiedRef.current = true;
        const minsLeft = Math.max(1, Math.round(diffMs / 60_000));
        if (document.visibilityState === 'hidden' && wantsMeetingAlert) {
          void showServiceWorkerNotification({
            title: `המפגש עומד להתחיל · ${room.title}`,
            body: `מתחילים בעוד כ-${minsLeft} דקות`,
            tag: `room-${room.id}-starting`,
            url: `/?room=${encodeURIComponent(room.id)}`,
            roomId: room.id,
            type: 'meeting_starting_soon',
          });
        } else if (document.visibilityState === 'visible') {
          setForegroundAlert({
            id: `starting-${room.id}`,
            title: 'המפגש עומד להתחיל',
            body: `${resolvedWinningTime?.option.label ?? room.title} — בעוד כ-${minsLeft} דקות`,
          });
        }
      }
    }

    if (!votingEndingNotifiedRef.current && room.status === 'open') {
      const voteDiffMs = room.endsAt - nowMs;
      if (voteDiffMs > 0 && voteDiffMs <= 2 * 60 * 1000) {
        votingEndingNotifiedRef.current = true;
        const minsLeft = Math.max(1, Math.round(voteDiffMs / 60_000));
        if (document.visibilityState === 'hidden' && wantsMeetingAlert) {
          void showServiceWorkerNotification({
            title: `ההצבעה ננעלת בקרוב · ${room.title}`,
            body: `נותרו כ-${minsLeft} דקות לסיום ההצבעה`,
            tag: `room-${room.id}-voting-ending`,
            url: `/?room=${encodeURIComponent(room.id)}`,
            roomId: room.id,
            type: 'meeting_starting_soon',
          });
        } else if (document.visibilityState === 'visible') {
          setForegroundAlert({
            id: `ending-${room.id}`,
            title: 'ההצבעה ננעלת בקרוב',
            body: `נותרו כ-${minsLeft} דקות להשלמת הבחירות בחדר`,
          });
        }
      }
    }
  }, [nowMs, room.id, room.title, room.status, room.endsAt, isLocked, resolvedWinningTime]);

  // Observe remote checklist item additions & remote status lock
  useEffect(() => {
    const currentIds = new Set(bundle.checklist.map((i) => i.id));
    if (prevChecklistIdsRef.current === null) {
      prevChecklistIdsRef.current = currentIds;
      return;
    }

    const newlyAdded = bundle.checklist.filter(
      (item) => !prevChecklistIdsRef.current!.has(item.id) && item.createdBy !== currentUid
    );
    prevChecklistIdsRef.current = currentIds;

    if (newlyAdded.length > 0) {
      const latest = newlyAdded[newlyAdded.length - 1];
      if (document.visibilityState === 'hidden') {
        const localPref = getLocalNotificationPref(room.id);
        if (localPref?.enabled && localPref.preferences.checklistAdded) {
          void showServiceWorkerNotification({
            title: `פריט חדש ברשימת הציוד · ${room.title}`,
            body: latest.label,
            tag: `room-${room.id}-checklist-${latest.id}`,
            url: `/?room=${encodeURIComponent(room.id)}`,
            roomId: room.id,
            type: 'checklist_item_added',
          });
        }
      } else {
        setForegroundAlert({
          id: `checklist-${latest.id}`,
          title: 'פריט חדש נוסף לרשימת הציוד',
          body: latest.label,
        });
      }
    }
  }, [bundle.checklist, currentUid, room.id, room.title]);

  useEffect(() => {
    if (prevStatusRef.current === 'open' && room.status === 'locked') {
      const body = resolvedWinningCard?.card.title || 'הסיכום הסופי מוכן לצפייה';
      if (document.visibilityState === 'hidden') {
        const localPref = getLocalNotificationPref(room.id);
        if (localPref?.enabled && localPref.preferences.decisionFinalized) {
          void showServiceWorkerNotification({
            title: `ההחלטה ננעלה · ${room.title}`,
            body,
            tag: `room-${room.id}-finalized`,
            url: `/?room=${encodeURIComponent(room.id)}`,
            roomId: room.id,
            type: 'decision_finalized',
          });
        }
      } else {
        setForegroundAlert({
          id: `locked-${room.id}`,
          title: 'המפגש ננעל והסיכום מוכן',
          body,
        });
      }
    }
    prevStatusRef.current = room.status;
  }, [room.status, room.id, room.title, resolvedWinningCard]);

  // Automatic status transition when timer reaches 00:00
  useEffect(() => {
    if (room.status === 'open' && isExpired && !autoLockedRef.current) {
      autoLockedRef.current = true;
      void lockMeetupRoom(
        room.id,
        {
          selectedTimeSlotId: winningTime?.option.id ?? null,
          selectedCardId: topWinner?.card.id ?? null,
          isCreator,
        },
        useDemoMode
      )
        .then(() =>
          notifyRoomPushEvent({
            type: 'decision_finalized',
            roomId: room.id,
            roomTitle: room.title,
            winningOption: topWinner?.card.title,
            winningTimeLabel: winningTime?.option.label,
          })
        )
        .catch(() => {
          // Ignore if another participant already locked it simultaneously
        });
    }
  }, [room.status, room.id, room.title, isExpired, isCreator, useDemoMode, winningTime, topWinner]);

  const myTimeVote = bundle.timeVotes.find((v) => v.uid === currentUid);
  const mySlotIds = myTimeVote?.slotIds ?? [];

  const mySwipeDoc = bundle.swipes.find((s) => s.uid === currentUid);
  const myChoices = mySwipeDoc?.choices ?? {};

  const handleLockDecision = async () => {
    await lockMeetupRoom(
      room.id,
      {
        selectedTimeSlotId: resolvedWinningTime?.option.id ?? null,
        selectedCardId: resolvedWinningCard?.card.id ?? null,
        isCreator,
      },
      useDemoMode
    );
    void notifyRoomPushEvent({
      type: 'decision_finalized',
      roomId: room.id,
      roomTitle: room.title,
      winningOption: resolvedWinningCard?.card.title,
      winningTimeLabel: resolvedWinningTime?.option.label,
      excludeUid: currentUid,
    });
    const meetingMs = resolveWinningTimeMs();
    if (meetingMs && meetingMs > Date.now()) {
      void scheduleMeetingPushReminder({
        roomId: room.id,
        roomTitle: room.title,
        meetingTimeMs: meetingMs,
        meetingLabel: resolvedWinningTime?.option.label,
      });
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteRoom();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSwipe = async (cardId: string, score: SwipeScore) => {
    const nextChoices: Record<string, SwipeScore> = {
      ...myChoices,
      [cardId]: score,
    };
    await recordUserSwipe(room.id, currentUid, nextChoices, useDemoMode);
  };

  const handleUndoSwipe = async (cardId: string) => {
    const nextChoices = { ...myChoices };
    delete nextChoices[cardId];
    await recordUserSwipe(room.id, currentUid, nextChoices, useDemoMode);
  };

  const tabs: Array<{
    id: RoomTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> =
    room.mode === 'quick'
      ? [{ id: 'swipe', label: 'החלטה מהירה', icon: Flame }]
      : [
          { id: 'when', label: 'מתי?', icon: CalendarClock },
          { id: 'swipe', label: 'מה עושים?', icon: Flame },
          { id: 'checklist', label: 'מי מביא מה?', icon: ListChecks },
        ];

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      <RoomHeader
        room={room}
        participants={bundle.participants}
        nowMs={nowMs}
        isCreator={isCreator}
        onLockDecision={handleLockDecision}
        onRequestDeleteRoom={() => setShowDeleteConfirm(true)}
      />

      {foregroundAlert && (
        <div
          role="status"
          aria-live="polite"
          className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-b border-slate-800 dark:border-slate-200"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <Bell className="w-4 h-4 shrink-0 opacity-85" />
              <div className="min-w-0 truncate">
                <span className="font-semibold">{foregroundAlert.title}: </span>
                <span className="opacity-90">{foregroundAlert.body}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForegroundAlert(null)}
              aria-label="סגור התראה"
              className="p-1 rounded-lg hover:bg-white/10 dark:hover:bg-slate-900/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isLocked ? (
        <SummaryScreen
          room={room}
          currentUid={currentUid}
          currentUserName={currentUserName}
          winningTime={resolvedWinningTime}
          winningCard={resolvedWinningCard}
          checklist={bundle.checklist}
          hasCalendarToken={hasCalendarToken}
          onRequestGoogleAuth={onRequestGoogleAuth}
          getCalendarToken={getCalendarToken}
          onCreateNewRoom={onCreateNewRoom}
        />
      ) : (
        <>
          {/* Desktop Sub-Nav Tabs */}
          {tabs.length > 1 && (
            <div className="hidden md:block bg-white/60 dark:bg-[#141A23]/60 border-b border-slate-200/70 dark:border-slate-800/80">
              <div className="max-w-6xl mx-auto px-6 flex items-center gap-2 py-2">
                {tabs.map(({ id, label, icon: Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`min-h-[40px] px-4 py-1.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2 cursor-pointer ${
                        active
                          ? 'bg-[#1E3A5F] text-white dark:bg-[#35639D]'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main Workspace Grid */}
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 pb-24 md:pb-10">
            <div className="lg:hidden mb-4 space-y-3">
              <PushNotificationsControl
                roomId={room.id}
                roomTitle={room.title}
                uid={currentUid}
                userName={currentUserName}
                compact
              />
              {onAddFriendFromParticipant &&
                bundle.participants.some((p) => p.uid !== currentUid) && (
                  <div className="rounded-xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 px-3.5 py-2.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      משתתפים:
                    </span>
                    {bundle.participants
                      .filter((p) => p.uid !== currentUid)
                      .map((p) => {
                        const isSaved = savedFriendUids?.has(p.uid);
                        return (
                          <button
                            key={p.uid}
                            type="button"
                            disabled={isSaved || addingFriendUid === p.uid}
                            onClick={async () => {
                              setAddingFriendUid(p.uid);
                              try {
                                await onAddFriendFromParticipant(p);
                              } finally {
                                setAddingFriendUid(null);
                              }
                            }}
                            className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1 transition-colors ${
                              isSaved
                                ? 'border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer'
                            }`}
                          >
                            {isSaved ? (
                              <UserCheck className="w-3.5 h-3.5" />
                            ) : (
                              <UserPlus className="w-3.5 h-3.5" />
                            )}
                            <span>{p.name}</span>
                          </button>
                        );
                      })}
                  </div>
                )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
              <section className="lg:col-span-8">
                {activeTab === 'when' && room.mode !== 'quick' && (
                  <WhenTab
                    summaries={timeSummaries}
                    mySlotIds={mySlotIds}
                    currentUid={currentUid}
                    isCreator={isCreator}
                    isLocked={isLocked}
                    onToggleVote={(slotId) =>
                      toggleUserTimeVote(
                        room.id,
                        currentUid,
                        slotId,
                        mySlotIds,
                        useDemoMode
                      )
                    }
                    onAddTimeOption={(label, dateIso, startTime) =>
                      addRoomTimeOption(
                        room.id,
                        currentUid,
                        label,
                        dateIso,
                        startTime,
                        useDemoMode
                      )
                    }
                    onDeleteTimeOption={(slotId) =>
                      deleteRoomTimeOption(room.id, slotId, useDemoMode)
                    }
                  />
                )}

                {activeTab === 'swipe' && (
                  <SwipeTab
                    category={room.category}
                    deck={deck}
                    myChoices={myChoices}
                    ranked={ranked}
                    matchedCards={matchedCards}
                    currentUid={currentUid}
                    isCreator={isCreator}
                    isLocked={isLocked}
                    onSwipe={handleSwipe}
                    onUndoLast={handleUndoSwipe}
                    onAddCustomCard={async (cardInput) => {
                      await addRoomCustomCard(
                        room.id,
                        room.category,
                        currentUid,
                        currentUserName,
                        cardInput,
                        useDemoMode
                      );
                    }}
                    onDeleteCustomCard={(cardId) =>
                      deleteRoomCustomCard(room.id, cardId, useDemoMode)
                    }
                  />
                )}

                {activeTab === 'checklist' && room.mode !== 'quick' && (
                  <ChecklistTab
                    items={bundle.checklist}
                    currentUid={currentUid}
                    isCreator={isCreator}
                    isLocked={isLocked}
                    onToggleClaim={async (itemId) => {
                      await toggleRoomChecklistClaim(
                        room.id,
                        itemId,
                        currentUid,
                        currentUserName,
                        isCreator,
                        useDemoMode
                      );
                    }}
                    onAddItem={async (label) => {
                      await addRoomChecklistItem(room.id, currentUid, label, useDemoMode);
                      void notifyRoomPushEvent({
                        type: 'checklist_item_added',
                        roomId: room.id,
                        roomTitle: room.title,
                        actorName: currentUserName,
                        itemLabel: label,
                        excludeUid: currentUid,
                      });
                    }}
                    onDeleteItem={(itemId) =>
                      deleteRoomChecklistItem(room.id, itemId, useDemoMode)
                    }
                  />
                )}
              </section>

              {/* Desktop Live Overview Sidebar */}
              <aside className="hidden lg:block lg:col-span-4 space-y-4 sticky top-20">
                <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      מצב החדר בזמן אמת
                    </h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {CATEGORY_LABELS[room.category]?.short}
                    </span>
                  </div>

                  {room.mode !== 'quick' && (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        הזמן המוביל כרגע
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {winningTime && winningTime.voteCount > 0
                          ? `${winningTime.option.label} (${winningTime.voteCount} קולות)`
                          : 'ממתין להצבעות זמן'}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      האפשרות המובילה בהחלקות
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {topWinner && topWinner.totalPoints > 0
                        ? `${topWinner.card.title} (${topWinner.consensusPercent}%)`
                        : 'טרם דורגו כרטיסיות'}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      חברים בחדר ({bundle.participants.length})
                    </div>
                    <ul className="space-y-2">
                      {bundle.participants.map((p) => {
                        const isSelf = p.uid === currentUid;
                        const isSavedFriend = savedFriendUids?.has(p.uid) ?? false;
                        return (
                          <li key={p.uid} className="flex items-center gap-2.5 text-sm">
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${p.avatarTone}`}
                            >
                              {p.initials}
                            </span>
                            <span className="text-slate-800 dark:text-slate-200 truncate flex-1">
                              {p.name}
                            </span>
                            {p.uid === room.creatorId && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                                מארגן
                              </span>
                            )}
                            {!isSelf && onAddFriendFromParticipant && (
                              isSavedFriend ? (
                                <span
                                  className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 shrink-0"
                                  title="שמור ברשימת החברים"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>בחברים</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={addingFriendUid === p.uid}
                                  onClick={async () => {
                                    setAddingFriendUid(p.uid);
                                    try {
                                      await onAddFriendFromParticipant(p);
                                    } finally {
                                      setAddingFriendUid(null);
                                    }
                                  }}
                                  className="text-xs font-medium text-[#1E3A5F] dark:text-[#6AA2E8] hover:underline underline-offset-4 inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>הוסף</span>
                                </button>
                              )
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <PushNotificationsControl
                  roomId={room.id}
                  roomTitle={room.title}
                  uid={currentUid}
                  userName={currentUserName}
                />
              </aside>
            </div>
          </main>

          {/* Mobile Bottom Tab Bar (Thumb Zone) */}
          {tabs.length > 1 && (
            <nav
              aria-label="ניווט בחדר"
              className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
            >
              <div className="grid grid-cols-3 h-14 items-center">
                {tabs.map(({ id, label, icon: Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                        active
                          ? 'text-[#1E3A5F] dark:text-[#6AA2E8] font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[11px]">{label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>
          )}
        </>
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        title="מחיקת חדר המפגש"
        description={`האם למחוק לצמיתות את "${room.title}"? כל ההצבעות ורשימת הציוד יימחקו עבור כל המשתתפים.`}
        confirmLabel="מחק חדר"
        destructive
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
