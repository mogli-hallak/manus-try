import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  Copy,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { CATEGORY_LABELS } from '../data/decks';
import {
  BLUEPRINT_LIMITS,
  FriendGroupDoc,
  GroupWithMembers,
  RoomCategory,
  SavedFriendDoc,
  UserProfileDoc,
} from '../types/meetup';
import { ConfirmModal } from './ConfirmModal';

interface GroupsViewProps {
  profile: UserProfileDoc | null;
  groups: GroupWithMembers[];
  friends: SavedFriendDoc[];
  initialGroupId?: string | null;
  onCreateGroup: (params: {
    name: string;
    description: string;
    defaultCategory: RoomCategory;
    initialFriends: SavedFriendDoc[];
  }) => Promise<string>;
  onUpdateGroup: (
    groupId: string,
    patch: { name?: string; description?: string; defaultCategory?: RoomCategory }
  ) => Promise<void>;
  onAddMemberToGroup: (
    group: FriendGroupDoc,
    friend: SavedFriendDoc
  ) => Promise<void>;
  onRemoveMemberFromGroup: (
    group: FriendGroupDoc,
    memberUid: string
  ) => Promise<void>;
  onJoinGroupByCode: (groupId: string) => Promise<FriendGroupDoc | null>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onStartMeetupForGroup: (group: FriendGroupDoc) => void;
}

export const GroupsView: React.FC<GroupsViewProps> = ({
  profile,
  groups,
  friends,
  initialGroupId,
  onCreateGroup,
  onUpdateGroup,
  onAddMemberToGroup,
  onRemoveMemberFromGroup,
  onJoinGroupByCode,
  onDeleteGroup,
  onStartMeetupForGroup,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultCategory, setDefaultCategory] = useState<RoomCategory>(
    profile?.defaultCategory ?? 'food'
  );
  const [selectedFriendUids, setSelectedFriendUids] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState(initialGroupId ?? '');
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState<RoomCategory>('food');
  const [addingMemberGroupId, setAddingMemberGroupId] = useState<string | null>(null);

  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<FriendGroupDoc | null>(null);
  const [confirmLeaveGroup, setConfirmLeaveGroup] = useState<FriendGroupDoc | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const runJoinByCode = async (rawCode: string) => {
    const cleaned = rawCode.trim().replace(/^.*group=/i, '');
    if (cleaned.length < 4) {
      setJoinMessage('יש להזין קוד קבוצה תקין.');
      return;
    }
    setJoining(true);
    setJoinMessage(null);
    try {
      const joined = await onJoinGroupByCode(cleaned);
      if (!joined) {
        setJoinMessage('לא נמצאה קבוצה התואמת לקוד שהוזן.');
      } else {
        setJoinCode('');
        setJoinMessage(`הצטרפת בהצלחה לקבוצה "${joined.name}".`);
      }
    } catch (err) {
      setJoinMessage(err instanceof Error ? err.message : 'לא ניתן להצטרף לקבוצה כרגע.');
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (initialGroupId) {
      setJoinCode(initialGroupId);
      void runJoinByCode(initialGroupId);
    }
  }, [initialGroupId]);

  const toggleFriendSelection = (uid: string) => {
    setSelectedFriendUids((prev) =>
      prev.includes(uid)
        ? prev.filter((id) => id !== uid)
        : prev.length < BLUEPRINT_LIMITS.GROUP_MEMBERS_MAX - 1
          ? [...prev, uid]
          : prev
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const chosenFriends = friends.filter((f) =>
        selectedFriendUids.includes(f.friendUid)
      );
      await onCreateGroup({
        name: name.trim(),
        description: description.trim(),
        defaultCategory,
        initialFriends: chosenFriends,
      });
      setName('');
      setDescription('');
      setSelectedFriendUids([]);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyGroupInvite = async (groupId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?group=${encodeURIComponent(
      groupId
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedGroupId(groupId);
      window.setTimeout(() => setCopiedGroupId(null), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-12">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-slate-100">
          קבוצות מפגש
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          רכזו חברים קבועים בקבוצה אחת ופתחו מפגש חדש עם קטגוריה ושם מוגדרים מראש.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Column: My Groups List */}
        <section className="lg:col-span-7 space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-8 text-center space-y-2 shadow-xs">
              <Users className="w-8 h-8 text-slate-400 mx-auto" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                עדיין אין קבוצות פעילות
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                צרו קבוצה חדשה מצד שמאל (למשל &quot;החבר׳ה של שישי&quot;) או הצטרפו עם קוד קבוצה מחברים.
              </p>
            </div>
          ) : (
            groups.map(({ group, members }) => {
              const isCreator = group.creatorId === profile?.uid;
              const isEditing = editingGroupId === group.id;
              const isAddingMembers = addingMemberGroupId === group.id;
              const availableFriendsToAdd = friends.filter(
                (f) => !group.memberUids.includes(f.friendUid)
              );

              return (
                <article
                  key={group.id}
                  className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        maxLength={BLUEPRINT_LIMITS.GROUP_NAME_MAX}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm font-semibold text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        maxLength={BLUEPRINT_LIMITS.GROUP_DESC_MAX}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="תיאור הקבוצה"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-xs text-slate-800 dark:text-slate-200"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        {(['food', 'movie', 'activity'] as RoomCategory[]).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setEditCategory(cat)}
                            className={`min-h-[38px] px-2 rounded-lg border text-xs font-medium cursor-pointer ${
                              editCategory === cat
                                ? 'border-[#1E3A5F] dark:border-[#4A7BB7] bg-[#1E3A5F]/[0.06] text-[#1E3A5F] dark:text-[#6AA2E8]'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {CATEGORY_LABELS[cat].short}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            await onUpdateGroup(group.id, {
                              name: editName,
                              description: editDesc,
                              defaultCategory: editCategory,
                            });
                            setEditingGroupId(null);
                          }}
                          className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#1E3A5F] text-white text-xs font-semibold cursor-pointer"
                        >
                          שמור שינויים
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                          {group.name}
                        </h2>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                          <span>{CATEGORY_LABELS[group.defaultCategory]?.short}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{group.memberUids.length} חברים</span>
                          <span aria-hidden="true">·</span>
                          <span dir="ltr" className="font-mono">
                            {group.id}
                          </span>
                        </div>
                        {group.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-300 pt-0.5">
                            {group.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyGroupInvite(group.id)}
                          aria-label="העתק קישור הזמנה לקבוצה"
                          title="העתק קישור הזמנה לקבוצה"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {copiedGroupId === group.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {isCreator ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingGroupId(group.id);
                                setEditName(group.name);
                                setEditDesc(group.description);
                                setEditCategory(group.defaultCategory);
                              }}
                              aria-label="ערוך פרטי קבוצה"
                              title="ערוך פרטי קבוצה"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteGroup(group)}
                              aria-label="מחק קבוצה"
                              title="מחק קבוצה"
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmLeaveGroup(group)}
                            aria-label="עזוב קבוצה"
                            title="עזוב קבוצה"
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Members List */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        חברי הקבוצה
                      </span>
                      {isCreator && availableFriendsToAdd.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setAddingMemberGroupId(isAddingMembers ? null : group.id)
                          }
                          className="text-xs font-medium text-[#1E3A5F] dark:text-[#6AA2E8] inline-flex items-center gap-1 hover:underline underline-offset-4 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{isAddingMembers ? 'סגור' : 'צרף חבר מהרשימה'}</span>
                        </button>
                      )}
                    </div>

                    {isAddingMembers && availableFriendsToAdd.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 space-y-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          בחר חבר לצרוף לקבוצה:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {availableFriendsToAdd.map((fr) => (
                            <button
                              key={fr.friendUid}
                              type="button"
                              onClick={() => void onAddMemberToGroup(group, fr)}
                              className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#18202A] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{fr.displayName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {members.map((m) => (
                        <li
                          key={m.uid}
                          className="py-2 flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${m.avatarTone}`}
                            >
                              {m.initials}
                            </span>
                            <span className="text-slate-800 dark:text-slate-200 truncate">
                              {m.displayName}
                            </span>
                            {m.role === 'admin' && (
                              <span className="text-xs text-slate-400 dark:text-slate-500">
                                · מנהל
                              </span>
                            )}
                          </div>

                          {isCreator && m.uid !== group.creatorId && (
                            <button
                              type="button"
                              onClick={() => void onRemoveMemberFromGroup(group, m.uid)}
                              aria-label={`הסר את ${m.displayName}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Primary Action: Launch Meetup for Group */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => onStartMeetupForGroup(group)}
                      className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CalendarPlus className="w-4 h-4" />
                      <span>פתח מפגש חדש לקבוצה</span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* Aside Column: Create Group + Join by Group Code */}
        <aside className="lg:col-span-5 space-y-5">
          <form
            onSubmit={handleCreateSubmit}
            className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              יצירת קבוצה חדשה
            </h2>

            <div className="space-y-1.5">
              <label
                htmlFor="group-name-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                שם הקבוצה
              </label>
              <input
                id="group-name-input"
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.GROUP_NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: החבר׳ה של שישי"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="group-desc-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                תיאור קצר (אופציונלי)
              </label>
              <input
                id="group-desc-input"
                type="text"
                maxLength={BLUEPRINT_LIMITS.GROUP_DESC_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="לדוגמה: ערבי אוכל, משחקי קופסה וסרטים"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                קטגוריית מפגש מועדפת
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(['food', 'movie', 'activity'] as RoomCategory[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setDefaultCategory(cat)}
                    className={`min-h-[40px] px-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer truncate ${
                      defaultCategory === cat
                        ? 'border-[#1E3A5F] dark:border-[#4A7BB7] bg-[#1E3A5F]/[0.06] dark:bg-[#4A7BB7]/15 text-[#1E3A5F] dark:text-[#6AA2E8]'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {CATEGORY_LABELS[cat].short}
                  </button>
                ))}
              </div>
            </div>

            {friends.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                  צירוף חברים מהרשימה ({selectedFriendUids.length} נבחרו)
                </span>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 px-3">
                  {friends.map((fr) => {
                    const checked = selectedFriendUids.includes(fr.friendUid);
                    return (
                      <label
                        key={fr.friendUid}
                        className="py-2.5 flex items-center justify-between gap-2 cursor-pointer text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${fr.avatarTone}`}
                          >
                            {fr.initials}
                          </span>
                          <span className="text-slate-800 dark:text-slate-200 truncate">
                            {fr.displayName}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFriendSelection(fr.friendUid)}
                          className="w-4 h-4 accent-[#1E3A5F] rounded cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#172E4B] dark:bg-[#35639D] dark:hover:bg-[#2B5283] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'יוצר קבוצה...' : 'צור קבוצה'}</span>
            </button>
          </form>

          {/* Join Group by Code */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runJoinByCode(joinCode);
            }}
            className="rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-3"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              הצטרפות לקבוצה עם קוד או קישור
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="קוד קבוצה (לדוגמה: grp_k7m2x9)"
                dir="ltr"
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              <button
                type="submit"
                disabled={joining}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <span>הצטרף</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
            {joinMessage && (
              <p className="text-xs text-slate-600 dark:text-slate-300">{joinMessage}</p>
            )}
          </form>
        </aside>
      </div>

      <ConfirmModal
        open={Boolean(confirmDeleteGroup)}
        title="מחיקת קבוצה"
        description={`האם למחוק את הקבוצה "${confirmDeleteGroup?.name ?? ''}"? פעולה זו תסיר את הקבוצה עבור כל חבריה.`}
        confirmLabel="מחק קבוצה"
        destructive
        isLoading={confirmBusy}
        onConfirm={async () => {
          if (!confirmDeleteGroup) return;
          setConfirmBusy(true);
          try {
            await onDeleteGroup(confirmDeleteGroup.id);
          } finally {
            setConfirmBusy(false);
            setConfirmDeleteGroup(null);
          }
        }}
        onCancel={() => setConfirmDeleteGroup(null)}
      />

      <ConfirmModal
        open={Boolean(confirmLeaveGroup)}
        title="עזיבת קבוצה"
        description={`האם ברצונך לעזוב את הקבוצה "${confirmLeaveGroup?.name ?? ''}"?`}
        confirmLabel="עזוב קבוצה"
        destructive
        isLoading={confirmBusy}
        onConfirm={async () => {
          if (!confirmLeaveGroup || !profile) return;
          setConfirmBusy(true);
          try {
            await onRemoveMemberFromGroup(confirmLeaveGroup, profile.uid);
          } finally {
            setConfirmBusy(false);
            setConfirmLeaveGroup(null);
          }
        }}
        onCancel={() => setConfirmLeaveGroup(null)}
      />
    </main>
  );
};
