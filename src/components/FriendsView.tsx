import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  Pencil,
  Search,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  BLUEPRINT_LIMITS,
  FriendRequestDoc,
  PublicProfileDoc,
  SavedFriendDoc,
  UserProfileDoc,
} from '../types/meetup';
import { normalizeFriendCode } from '../services/socialService';

interface FriendsViewProps {
  profile: UserProfileDoc | null;
  friends: SavedFriendDoc[];
  incomingRequests: FriendRequestDoc[];
  outgoingRequests: FriendRequestDoc[];
  initialFriendCode?: string | null;
  onLookupByCode: (code: string) => Promise<PublicProfileDoc | null>;
  onSendFriendRequest: (target: PublicProfileDoc) => Promise<void>;
  onRespondToRequest: (
    req: FriendRequestDoc,
    decision: 'accepted' | 'declined'
  ) => Promise<void>;
  onDeleteRequest: (requestId: string) => Promise<void>;
  onAddSavedFriend: (input: {
    friendUid?: string;
    displayName: string;
    avatarTone?: string;
    friendCode?: string;
    nickname?: string;
  }) => Promise<void>;
  onUpdateFriend: (
    friendUid: string,
    patch: { nickname?: string; favorite?: boolean }
  ) => Promise<void>;
  onRemoveFriend: (friendUid: string) => Promise<void>;
  onGoToGroups: () => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  profile,
  friends,
  incomingRequests,
  outgoingRequests,
  initialFriendCode,
  onLookupByCode,
  onSendFriendRequest,
  onRespondToRequest,
  onDeleteRequest,
  onAddSavedFriend,
  onUpdateFriend,
  onRemoveFriend,
  onGoToGroups,
}) => {
  const [codeInput, setCodeInput] = useState(initialFriendCode ?? '');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupResult, setLookupResult] = useState<PublicProfileDoc | null>(null);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [quickName, setQuickName] = useState('');
  const [quickNickname, setQuickNickname] = useState('');
  const [addingQuick, setAddingQuick] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const runCodeLookup = async (rawCode: string) => {
    const normalized = normalizeFriendCode(rawCode);
    setLookupNotice(null);
    setLookupResult(null);
    if (normalized.length < BLUEPRINT_LIMITS.FRIEND_CODE_MIN) {
      setLookupNotice('יש להזין קוד חבר בן 4 תווים לפחות.');
      return;
    }
    if (profile?.friendCode === normalized) {
      setLookupNotice('זהו קוד החבר האישי שלך.');
      return;
    }
    setLookupBusy(true);
    try {
      const found = await onLookupByCode(normalized);
      if (!found) {
        setLookupNotice('לא נמצא פרופיל תואם לקוד זה. בדקו שהקוד הוקלד במלואו.');
      } else {
        setLookupResult(found);
      }
    } catch {
      setLookupNotice('לא ניתן היה לחפש כרגע, נסו שנית.');
    } finally {
      setLookupBusy(false);
    }
  };

  useEffect(() => {
    if (initialFriendCode) {
      setCodeInput(initialFriendCode);
      void runCodeLookup(initialFriendCode);
    }
  }, [initialFriendCode]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCodeLookup(codeInput);
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;
    setAddingQuick(true);
    try {
      await onAddSavedFriend({
        displayName: quickName.trim(),
        nickname: quickNickname.trim(),
      });
      setQuickName('');
      setQuickNickname('');
    } finally {
      setAddingQuick(false);
    }
  };

  const handleCopyMyCode = async () => {
    if (!profile?.friendCode) return;
    try {
      await navigator.clipboard.writeText(profile.friendCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyMyInviteLink = async () => {
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

  const savedFriendUids = new Set(friends.map((f) => f.friendUid));
  const pendingOutToUids = new Set(
    outgoingRequests.filter((r) => r.status === 'pending').map((r) => r.toUid)
  );

  const filteredFriends = friends.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      f.displayName.toLowerCase().includes(q) ||
      f.nickname.toLowerCase().includes(q) ||
      f.friendCode.toLowerCase().includes(q)
    );
  });

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
            חברים וחיבורים
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            הוסף חברים באמצעות קוד חבר או מהיכרות קודמת כדי לבנות קבוצות למפגשים בלחיצה.
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToGroups}
          className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span>עבור לקבוצות</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Column: Incoming Requests + Friends Directory */}
        <section className="lg:col-span-7 space-y-5">
          {/* Incoming Friend Requests */}
          {incomingRequests.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  בקשות חברות ממתינות
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {incomingRequests.length}
                </span>
              </div>

              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {incomingRequests.map((req) => (
                  <li
                    key={req.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${req.fromAvatarTone}`}
                      >
                        {req.fromInitials}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {req.fromName}
                        </div>
                        <div dir="ltr" className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {req.fromFriendCode}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onRespondToRequest(req, 'accepted')}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>אשר</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void onRespondToRequest(req, 'declined')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                      >
                        דחה
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Friends List */}
          <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  רשימת החברים שלי
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  ({friends.length})
                </span>
              </div>

              {friends.length > 0 && (
                <div className="relative w-full sm:w-56">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="חיפוש חבר או כינוי..."
                    className="w-full min-h-[40px] pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
                  />
                </div>
              )}
            </div>

            {friends.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  עדיין אין חברים שמורים ברשימה
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  חפשו חבר לפי קוד החבר שלו משמאל, הוסיפו חברים מתוך חדר מפגש קיים או צרו איש קשר מהיר.
                </p>
              </div>
            ) : filteredFriends.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                לא נמצאו חברים התואמים לחיפוש &quot;{searchQuery}&quot;.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredFriends.map((fr) => {
                  const isEditing = editingUid === fr.friendUid;
                  return (
                    <li
                      key={fr.friendUid}
                      className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${fr.avatarTone}`}
                        >
                          {fr.initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {fr.displayName}
                            </span>
                            {fr.friendCode && (
                              <span
                                dir="ltr"
                                className="text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0"
                              >
                                {fr.friendCode}
                              </span>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <input
                                type="text"
                                maxLength={BLUEPRINT_LIMITS.NICKNAME_MAX}
                                value={editingNickname}
                                onChange={(e) => setEditingNickname(e.target.value)}
                                placeholder="כינוי / תגית (לדוגמה: מהעבודה)"
                                className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  await onUpdateFriend(fr.friendUid, {
                                    nickname: editingNickname,
                                  });
                                  setEditingUid(null);
                                }}
                                className="min-h-[34px] px-2.5 rounded-lg bg-[#1E3A5F] text-white text-xs cursor-pointer"
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUid(null)}
                                className="min-h-[34px] px-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {fr.nickname || 'ללא תגית אישית'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateFriend(fr.friendUid, {
                              favorite: !fr.favorite,
                            })
                          }
                          aria-label={fr.favorite ? 'הסר ממועדפים' : 'סמן כמועדף'}
                          title={fr.favorite ? 'מועדף' : 'סמן כמועדף'}
                          className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                            fr.favorite
                              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Star
                            className={`w-4 h-4 ${fr.favorite ? 'fill-amber-500' : ''}`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingUid(fr.friendUid);
                            setEditingNickname(fr.nickname);
                          }}
                          aria-label="ערוך כינוי"
                          title="ערוך כינוי"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void onRemoveFriend(fr.friendUid)}
                          aria-label={`הסר את ${fr.displayName}`}
                          title="הסר מרשימת החברים"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Outgoing Friend Requests */}
          {outgoingRequests.filter((r) => r.status === 'pending').length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                בקשות שנשלחו
              </h3>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {outgoingRequests
                  .filter((r) => r.status === 'pending')
                  .map((req) => (
                    <li
                      key={req.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {req.toName}
                        </span>
                        <span className="text-xs text-slate-400 mr-2">ממתין לאישור</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeleteRequest(req.id)}
                        className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 underline underline-offset-4 cursor-pointer"
                      >
                        בטל בקשה
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>

        {/* Aside Column: Share My Code + Lookup Friend Code + Quick Manual Add */}
        <aside className="lg:col-span-5 space-y-5">
          {/* My Shareable Code */}
          <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                קוד החבר שלי לשיתוף
              </span>
              <span
                dir="ltr"
                className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100"
              >
                {profile?.friendCode || '------'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyMyCode}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>הקוד הועתק</span>
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
                onClick={handleCopyMyInviteLink}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-700" />
                    <span>קישור הועתק</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-3.5 h-3.5" />
                    <span>שתף קישור חברות</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Lookup Friend by Code */}
          <form
            onSubmit={handleLookupSubmit}
            className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              הוספת חבר לפי קוד
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              הדבק קוד חבר (לדוגמה NF4K9P) כדי לאתר את הפרופיל ולשלוח בקשה.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="קוד חבר (לדוגמה: NF4K9P)"
                dir="ltr"
                maxLength={BLUEPRINT_LIMITS.FRIEND_CODE_MAX}
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              <button
                type="submit"
                disabled={lookupBusy}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] text-white text-sm font-medium cursor-pointer disabled:opacity-60"
              >
                {lookupBusy ? 'מחפש...' : 'אתר'}
              </button>
            </div>

            {lookupNotice && (
              <p className="text-xs text-slate-600 dark:text-slate-300">{lookupNotice}</p>
            )}

            {lookupResult && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${lookupResult.avatarTone}`}
                  >
                    {lookupResult.initials}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {lookupResult.displayName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {[lookupResult.city, lookupResult.bio].filter(Boolean).join(' · ') ||
                        lookupResult.friendCode}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {savedFriendUids.has(lookupResult.uid) ? (
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>כבר שמור ברשימת החברים שלך</span>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={sendingRequest || pendingOutToUids.has(lookupResult.uid)}
                        onClick={async () => {
                          setSendingRequest(true);
                          try {
                            await onSendFriendRequest(lookupResult);
                            await onAddSavedFriend({
                              friendUid: lookupResult.uid,
                              displayName: lookupResult.displayName,
                              avatarTone: lookupResult.avatarTone,
                              friendCode: lookupResult.friendCode,
                            });
                            setLookupNotice('בקשת החברות נשלחה והחבר נשמר ברשימה.');
                          } finally {
                            setSendingRequest(false);
                          }
                        }}
                        className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>
                          {pendingOutToUids.has(lookupResult.uid)
                            ? 'בקשה נשלחה'
                            : 'שלח בקשה ושמור'}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </form>

          {/* Quick Contact Add */}
          <form
            onSubmit={handleQuickAddSubmit}
            className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              הוספת חבר לרשימה המהירה
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              שמרו שמות של חברים לצורך שיוך מהיר לקבוצות גם לפני שהם פותחים פרופיל.
            </p>
            <div className="space-y-2.5">
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.NAME_MAX}
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="שם החבר (לדוגמה: דניאל)"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.NICKNAME_MAX}
                value={quickNickname}
                onChange={(e) => setQuickNickname(e.target.value)}
                placeholder="תגית אופציונלית (לדוגמה: מהצבא)"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              <button
                type="submit"
                disabled={addingQuick || !quickName.trim()}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-900 dark:text-slate-100 inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{addingQuick ? 'מוסיף...' : 'הוסף לרשימת החברים'}</span>
              </button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
};
