import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Layers,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FriendsView } from './components/FriendsView';
import { GroupsView } from './components/GroupsView';
import { HomeScreen, RecentRoomSummary } from './components/HomeScreen';
import { JoinRoomScreen } from './components/JoinRoomScreen';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { RoomWorkspace } from './components/RoomWorkspace';
import { TopBar } from './components/TopBar';
import { createDefaultTimeOptions } from './data/decks';
import {
  getCalendarAccessToken,
  googleSignIn,
  initAuthObserver,
  isFirebaseConfigured,
  logoutUser,
  signInAnonymousGuest,
} from './firebase/config';
import {
  RoomBundle,
  createMeetupRoom,
  deleteMeetupRoom,
  fetchRoomOverview,
  joinRoomAsParticipant,
  listMyCreatedRooms,
  subscribeToRoom,
} from './services/roomService';
import {
  addMemberToGroup,
  addSavedFriend,
  createFriendGroup,
  deleteFriendGroup,
  deleteFriendRequest,
  ensureUserProfile,
  joinGroupByInvite,
  lookupPublicProfileByCode,
  normalizeFriendCode,
  removeMemberFromGroup,
  removeSavedFriend,
  respondToFriendRequest,
  sendFriendRequest,
  subscribeMyFriendRequests,
  subscribeMyFriends,
  subscribeMyGroups,
  subscribeUserProfile,
  updateFriendGroup,
  updateSavedFriend,
  updateUserProfile,
} from './services/socialService';
import {
  AppSection,
  AuthUserSummary,
  FriendGroupDoc,
  FriendRequestDoc,
  GroupWithMembers,
  ParticipantDoc,
  RoomCategory,
  RoomDoc,
  RoomMode,
  SavedFriendDoc,
  UserProfileDoc,
} from './types/meetup';

const THEME_STORAGE_KEY = 'nifgashim_theme';
const DISPLAY_NAME_KEY = 'nifgashim_display_name';
const DEMO_UID_KEY = 'nifgashim_demo_uid';
const RECENT_ROOMS_KEY = 'nifgashim_recent_rooms';

function readRecentRooms(): RecentRoomSummary[] {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentRoomSummary[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function getOrCreateDemoUid(): string {
  try {
    const existing = localStorage.getItem(DEMO_UID_KEY);
    if (existing) return existing;
    const created = `demo_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEMO_UID_KEY, created);
    return created;
  } catch {
    return `demo_${Date.now().toString(36)}`;
  }
}

function getRoomIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('room');
  return id ? id.trim() : null;
}

function getFriendCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('addFriend');
  if (!code) return null;
  const normalized = normalizeFriendCode(code);
  return normalized.length >= 4 ? normalized : null;
}

function getGroupIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const gid = params.get('group');
  return gid && gid.trim().length >= 4 ? gid.trim() : null;
}

function getInitialSectionFromUrl(): AppSection {
  if (getRoomIdFromUrl()) return 'meetups';
  if (getFriendCodeFromUrl()) return 'friends';
  if (getGroupIdFromUrl()) return 'groups';
  return 'meetups';
}

function AppContent() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [useDemoMode, setUseDemoMode] = useState<boolean>(!isFirebaseConfigured);
  const [authReady, setAuthReady] = useState<boolean>(!isFirebaseConfigured);
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [hasCalendarToken, setHasCalendarToken] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authNotice, setAuthNotice] = useState<string | null>(
    !isFirebaseConfigured
      ? 'מפתחות Firebase טרם הוגדרו — האפליקציה פועלת במצב הדגמה מקומי.'
      : null
  );

  const [savedName, setSavedName] = useState<string>(() => {
    try {
      return localStorage.getItem(DISPLAY_NAME_KEY) || '';
    } catch {
      return '';
    }
  });

  const [activeRoomId, setActiveRoomId] = useState<string | null>(() =>
    getRoomIdFromUrl()
  );
  const [activeSection, setActiveSection] = useState<AppSection>(() =>
    getInitialSectionFromUrl()
  );
  const [pendingAddFriendCode, setPendingAddFriendCode] = useState<string | null>(() =>
    getFriendCodeFromUrl()
  );
  const [pendingJoinGroupId, setPendingJoinGroupId] = useState<string | null>(() =>
    getGroupIdFromUrl()
  );
  const [justCreatedRoomId, setJustCreatedRoomId] = useState<string | null>(null);
  const [copiedBannerLink, setCopiedBannerLink] = useState<boolean>(false);

  const [userProfile, setUserProfile] = useState<UserProfileDoc | null>(null);
  const [friends, setFriends] = useState<SavedFriendDoc[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestDoc[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestDoc[]>([]);
  const [groups, setGroups] = useState<GroupWithMembers[]>([]);
  const [groupPreset, setGroupPreset] = useState<FriendGroupDoc | null>(null);
  const reconciledRequestIdsRef = useRef<Set<string>>(new Set());

  const [myRooms, setMyRooms] = useState<RoomDoc[]>([]);
  const [recentRooms, setRecentRooms] = useState<RecentRoomSummary[]>(() =>
    readRecentRooms()
  );
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [roomBundle, setRoomBundle] = useState<RoomBundle>({
    room: null,
    participants: [],
    timeOptions: [],
    timeVotes: [],
    customCards: [],
    swipes: [],
    checklist: [],
  });
  const [roomLoading, setRoomLoading] = useState<boolean>(false);
  const [previewRoom, setPreviewRoom] = useState<RoomDoc | null>(null);

  const demoUid = getOrCreateDemoUid();
  const effectiveUid = useDemoMode ? demoUid : authUser?.uid ?? '';

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  // Listen to browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      setActiveRoomId(getRoomIdFromUrl());
      const fc = getFriendCodeFromUrl();
      const gid = getGroupIdFromUrl();
      if (fc) {
        setPendingAddFriendCode(fc);
        setActiveSection('friends');
      } else if (gid) {
        setPendingJoinGroupId(gid);
        setActiveSection('groups');
      }
      setJustCreatedRoomId(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Firebase Auth Observer
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return;
    }
    const unsub = initAuthObserver((fbUser, hasToken) => {
      if (fbUser) {
        setAuthUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          email: fbUser.email,
          isAnonymous: fbUser.isAnonymous,
          isGoogleUser: fbUser.providerData.some((p) => p.providerId === 'google.com'),
        });
      } else {
        setAuthUser(null);
      }
      setHasCalendarToken(hasToken);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Load creator's rooms list when authenticated
  const refreshMyRooms = useCallback(async () => {
    if (!effectiveUid) {
      setMyRooms([]);
      return;
    }
    try {
      const list = await listMyCreatedRooms(effectiveUid, useDemoMode);
      setMyRooms(list);
    } catch {
      setMyRooms([]);
    }
  }, [effectiveUid, useDemoMode]);

  useEffect(() => {
    if (authReady || useDemoMode) {
      void refreshMyRooms();
    }
  }, [authReady, useDemoMode, refreshMyRooms]);

  // Subscribe to active room when auth is ready & user is signed in (or demo mode)
  useEffect(() => {
    if (!activeRoomId) {
      setRoomBundle({
        room: null,
        participants: [],
        timeOptions: [],
        timeVotes: [],
        customCards: [],
        swipes: [],
        checklist: [],
      });
      setPreviewRoom(null);
      setRoomLoading(false);
      return;
    }

    if (!useDemoMode && (!authReady || !authUser)) {
      setRoomLoading(false);
      return;
    }

    setRoomLoading(true);
    let firstEmit = true;

    const unsub = subscribeToRoom(
      activeRoomId,
      useDemoMode,
      (bundle) => {
        setRoomBundle(bundle);
        setPreviewRoom(bundle.room);
        if (bundle.room) {
          const rm = bundle.room;
          setRecentRooms((prev) => {
            const next: RecentRoomSummary[] = [
              {
                id: rm.id,
                title: rm.title,
                category: rm.category,
                visitedAt: Date.now(),
              },
              ...prev.filter((r) => r.id !== rm.id),
            ].slice(0, 6);
            try {
              localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(next));
            } catch {
              // ignore storage errors
            }
            return next;
          });
        }
        if (firstEmit) {
          firstEmit = false;
          setRoomLoading(false);
        }
      },
      (err) => {
        setRoomLoading(false);
        console.error('Room subscription error:', err);
      }
    );

    return unsub;
  }, [activeRoomId, authReady, authUser, useDemoMode]);

  const navigateToRoom = (roomId: string | null) => {
    const url = new URL(window.location.href);
    if (roomId) {
      url.searchParams.set('room', roomId);
    } else {
      url.searchParams.delete('room');
    }
    url.searchParams.delete('addFriend');
    url.searchParams.delete('group');
    window.history.pushState({}, '', url.toString());
    setActiveRoomId(roomId);
  };

  const persistName = useCallback((name: string) => {
    const cleaned = name.trim();
    if (!cleaned) return;
    setSavedName(cleaned);
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, cleaned);
    } catch {
      // ignore
    }
  }, []);

  const ensureAuthenticatedUid = useCallback(async (): Promise<{
    uid: string;
    isGoogleUser: boolean;
    demoFallback: boolean;
  }> => {
    if (useDemoMode || !isFirebaseConfigured) {
      return { uid: demoUid, isGoogleUser: false, demoFallback: true };
    }
    if (authUser) {
      return {
        uid: authUser.uid,
        isGoogleUser: authUser.isGoogleUser,
        demoFallback: false,
      };
    }

    try {
      const guest = await signInAnonymousGuest();
      return { uid: guest.uid, isGoogleUser: false, demoFallback: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('operation-not-allowed') ||
        msg.includes('admin-restricted-operation')
      ) {
        setAuthNotice(
          'כניסה אנונימית טרם הופעלה במסוף Firebase (Authentication > Sign-in method > Anonymous). בינתיים ניתן להתחבר עם Google או לעבוד במצב הדגמה מקומי.'
        );
        setUseDemoMode(true);
        return { uid: demoUid, isGoogleUser: false, demoFallback: true };
      }
      throw err;
    }
  }, [useDemoMode, authUser, demoUid]);

  // Ensure anonymous or demo session automatically when entering social sections or deep links
  useEffect(() => {
    if (useDemoMode || !isFirebaseConfigured || !authReady || authUser) return;
    if (
      activeSection !== 'meetups' ||
      Boolean(pendingAddFriendCode) ||
      Boolean(pendingJoinGroupId)
    ) {
      void ensureAuthenticatedUid().catch(() => {
        // handled inside ensureAuthenticatedUid fallback
      });
    }
  }, [
    useDemoMode,
    authReady,
    authUser,
    activeSection,
    pendingAddFriendCode,
    pendingJoinGroupId,
    ensureAuthenticatedUid,
  ]);

  // Subscribe to profile, friends, friendRequests, and groups once signed in (or demo mode)
  useEffect(() => {
    if (!effectiveUid || (!useDemoMode && (!authReady || !authUser))) {
      setUserProfile(null);
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setGroups([]);
      return;
    }

    let cancelled = false;
    const fallbackDisplayName = savedName || authUser?.displayName || 'משתמש';

    void ensureUserProfile(effectiveUid, fallbackDisplayName, useDemoMode)
      .then((ensured) => {
        if (!cancelled) {
          setUserProfile(ensured);
        }
      })
      .catch((err) => {
        console.error('Failed to ensure user profile:', err);
      });

    const unsubProfile = subscribeUserProfile(
      effectiveUid,
      useDemoMode,
      (prof) => {
        if (prof) {
          setUserProfile(prof);
          if (prof.displayName) {
            persistName(prof.displayName);
          }
        }
      },
      (err) => console.error('Profile subscription error:', err)
    );

    const unsubFriends = subscribeMyFriends(
      effectiveUid,
      useDemoMode,
      setFriends,
      (err) => console.error('Friends subscription error:', err)
    );

    const unsubRequests = subscribeMyFriendRequests(
      effectiveUid,
      useDemoMode,
      ({ incoming, outgoing }) => {
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);
      },
      (err) => console.error('Friend requests subscription error:', err)
    );

    const unsubGroups = subscribeMyGroups(
      effectiveUid,
      useDemoMode,
      setGroups,
      (err) => console.error('Groups subscription error:', err)
    );

    return () => {
      cancelled = true;
      unsubProfile();
      unsubFriends();
      unsubRequests();
      unsubGroups();
    };
  }, [effectiveUid, useDemoMode, authReady, authUser, savedName, persistName]);

  // Automatically save accepted outgoing friend requests on the sender's side
  useEffect(() => {
    if (!effectiveUid || outgoingRequests.length === 0) return;
    const friendUids = new Set(friends.map((f) => f.friendUid));

    outgoingRequests.forEach((req) => {
      if (
        req.status === 'accepted' &&
        !friendUids.has(req.toUid) &&
        !reconciledRequestIdsRef.current.has(req.id)
      ) {
        reconciledRequestIdsRef.current.add(req.id);
        void lookupPublicProfileByCode(req.toFriendCode, useDemoMode)
          .catch(() => null)
          .then((pub) =>
            addSavedFriend(
              effectiveUid,
              {
                friendUid: req.toUid,
                displayName: pub?.displayName || req.toName,
                avatarTone: pub?.avatarTone,
                friendCode: req.toFriendCode,
              },
              useDemoMode
            )
          )
          .catch((err) => console.error('Friend reconciliation error:', err));
      }
    });
  }, [effectiveUid, outgoingRequests, friends, useDemoMode]);

  const handleGoogleSignIn = async (): Promise<string | null> => {
    if (!isFirebaseConfigured) {
      setAuthNotice('מפתחות Firebase לא מוגדרים עדיין, עובד במצב הדגמה מקומי.');
      return null;
    }
    setAuthBusy(true);
    try {
      const { user, accessToken } = await googleSignIn();
      setUseDemoMode(false);
      setAuthNotice(null);
      setHasCalendarToken(Boolean(accessToken));
      if (user.displayName && !savedName) {
        persistName(user.displayName);
      }
      return accessToken;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('popup-closed-by-user')) {
        setAuthNotice('לא ניתן היה להשלים התחברות עם Google. נסו שנית.');
      }
      return null;
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await logoutUser();
    setHasCalendarToken(false);
    setMyRooms([]);
  };

  const handleCreateRoom = async (params: {
    title: string;
    category: RoomCategory;
    mode: RoomMode;
    durationMinutes: number;
    creatorName: string;
    initialTimeOptions: ReturnType<typeof createDefaultTimeOptions>;
  }) => {
    setIsCreating(true);
    try {
      persistName(params.creatorName);
      const { uid, isGoogleUser, demoFallback } = await ensureAuthenticatedUid();
      const roomId = await createMeetupRoom(
        {
          ...params,
          creatorId: uid,
          isGoogleUser,
        },
        demoFallback
      );
      setJustCreatedRoomId(roomId);
      navigateToRoom(roomId);
      void refreshMyRooms();
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (name: string) => {
    if (!activeRoomId) return;
    persistName(name);
    const { uid, isGoogleUser, demoFallback } = await ensureAuthenticatedUid();

    // Ensure room exists in whichever store we're operating in
    const overview = await fetchRoomOverview(activeRoomId, demoFallback);
    if (!overview) {
      setPreviewRoom(null);
      return;
    }

    await joinRoomAsParticipant(activeRoomId, uid, name, isGoogleUser, demoFallback);
  };

  const handleDeleteRoom = async () => {
    if (!activeRoomId) return;
    const deletedId = activeRoomId;
    await deleteMeetupRoom(deletedId, useDemoMode);
    setRecentRooms((prev) => {
      const next = prev.filter((r) => r.id !== deletedId);
      try {
        localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setJustCreatedRoomId(null);
    navigateToRoom(null);
    void refreshMyRooms();
  };

  const handleCopyCreatedLink = async () => {
    if (!justCreatedRoomId) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${justCreatedRoomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedBannerLink(true);
      setTimeout(() => setCopiedBannerLink(false), 2500);
    } catch {
      // ignore
    }
  };

  const getActiveProfile = useCallback(async (): Promise<{
    profile: UserProfileDoc;
    demoFallback: boolean;
  }> => {
    const { uid, demoFallback } = await ensureAuthenticatedUid();
    if (userProfile && userProfile.uid === uid && demoFallback === useDemoMode) {
      return { profile: userProfile, demoFallback };
    }
    const ensured = await ensureUserProfile(
      uid,
      savedName || authUser?.displayName || 'משתמש',
      demoFallback
    );
    setUserProfile(ensured);
    return { profile: ensured, demoFallback };
  }, [ensureAuthenticatedUid, userProfile, useDemoMode, savedName, authUser?.displayName]);

  const handleSelectSection = (section: AppSection) => {
    setActiveSection(section);
    if (activeRoomId) {
      setJustCreatedRoomId(null);
      navigateToRoom(null);
    }
  };

  const handleAddFriendFromParticipant = async (participant: ParticipantDoc) => {
    const { profile, demoFallback } = await getActiveProfile();
    await addSavedFriend(
      profile.uid,
      {
        friendUid: participant.uid,
        displayName: participant.name,
        avatarTone: participant.avatarTone,
      },
      demoFallback
    );
  };

  const savedFriendUidSet = useMemo(
    () => new Set(friends.map((f) => f.friendUid)),
    [friends]
  );

  const currentParticipant = roomBundle.participants.find(
    (p) => p.uid === effectiveUid
  );
  const currentUserName =
    currentParticipant?.name ||
    userProfile?.displayName ||
    savedName ||
    authUser?.displayName ||
    'אורח';

  const shouldShowRoomWorkspace =
    Boolean(activeRoomId) &&
    Boolean(roomBundle.room) &&
    Boolean(currentParticipant);

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#F7F8FA] dark:bg-[#0F141B] text-slate-900 dark:text-slate-100 transition-colors"
    >
      <TopBar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        user={authUser}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onSignOut={() => void handleSignOut()}
        onNavigateHome={() => {
          setJustCreatedRoomId(null);
          setActiveSection('meetups');
          navigateToRoom(null);
        }}
        onSelectSection={handleSelectSection}
        activeSection={activeSection}
        pendingRequestsCount={incomingRequests.length}
        inRoom={Boolean(activeRoomId)}
        authBusy={authBusy}
      />

      {/* Invite Banner shown cleanly right after creating a room */}
      {shouldShowRoomWorkspace && justCreatedRoomId === activeRoomId && (
        <div className="bg-[#1E3A5F] dark:bg-[#1E2E42] text-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium">החדר מוכן! הזמן את החברים להצביע:</span>
              <span
                dir="ltr"
                className="font-mono-tabular opacity-85 truncate max-w-[200px] sm:max-w-xs"
              >
                ?room={activeRoomId}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyCreatedLink}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-white text-[#1E3A5F] font-semibold text-xs inline-flex items-center gap-1.5 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {copiedBannerLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>הועתק</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>העתק קישור להזמנת חברים</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setJustCreatedRoomId(null)}
                aria-label="סגור הודעת הזמנה"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!activeRoomId ? (
        <>
          {activeSection === 'meetups' && (
            <HomeScreen
              user={authUser}
              defaultName={userProfile?.displayName || savedName || authUser?.displayName || ''}
              defaultCategory={userProfile?.defaultCategory ?? 'food'}
              defaultDurationMinutes={userProfile?.defaultDurationMinutes ?? 60}
              groups={groups}
              groupPreset={groupPreset}
              onSelectGroupPreset={setGroupPreset}
              onOpenGroups={() => handleSelectSection('groups')}
              myRooms={myRooms}
              recentRooms={recentRooms}
              isCreating={isCreating}
              onCreateRoom={async (params) => {
                setGroupPreset(null);
                await handleCreateRoom(params);
              }}
              onOpenRoom={(roomId) => {
                setJustCreatedRoomId(null);
                navigateToRoom(roomId);
              }}
              useDemoMode={useDemoMode}
              onToggleDemoMode={() => {
                if (!isFirebaseConfigured) return;
                setUseDemoMode((prev) => !prev);
              }}
              authNotice={authNotice}
            />
          )}

          {activeSection === 'friends' && (
            <FriendsView
              profile={userProfile}
              friends={friends}
              incomingRequests={incomingRequests}
              outgoingRequests={outgoingRequests}
              initialFriendCode={pendingAddFriendCode}
              onLookupByCode={async (code) => {
                const { demoFallback } = await ensureAuthenticatedUid();
                return lookupPublicProfileByCode(code, demoFallback);
              }}
              onSendFriendRequest={async (target) => {
                const { profile, demoFallback } = await getActiveProfile();
                await sendFriendRequest(profile, target, demoFallback);
              }}
              onRespondToRequest={async (req, decision) => {
                const { profile, demoFallback } = await getActiveProfile();
                await respondToFriendRequest(req, decision, profile, demoFallback);
              }}
              onDeleteRequest={async (requestId) => {
                const { demoFallback } = await ensureAuthenticatedUid();
                await deleteFriendRequest(requestId, demoFallback);
              }}
              onAddSavedFriend={async (input) => {
                const { profile, demoFallback } = await getActiveProfile();
                await addSavedFriend(profile.uid, input, demoFallback);
              }}
              onUpdateFriend={async (friendUid, patch) => {
                const { profile, demoFallback } = await getActiveProfile();
                await updateSavedFriend(profile.uid, friendUid, patch, demoFallback);
              }}
              onRemoveFriend={async (friendUid) => {
                const { profile, demoFallback } = await getActiveProfile();
                await removeSavedFriend(profile.uid, friendUid, demoFallback);
              }}
              onGoToGroups={() => handleSelectSection('groups')}
            />
          )}

          {activeSection === 'groups' && (
            <GroupsView
              profile={userProfile}
              groups={groups}
              friends={friends}
              initialGroupId={pendingJoinGroupId}
              onCreateGroup={async (params) => {
                const { profile, demoFallback } = await getActiveProfile();
                return createFriendGroup(
                  {
                    creator: profile,
                    ...params,
                  },
                  demoFallback
                );
              }}
              onUpdateGroup={async (groupId, patch) => {
                const { demoFallback } = await ensureAuthenticatedUid();
                await updateFriendGroup(groupId, patch, demoFallback);
              }}
              onAddMemberToGroup={async (group, friend) => {
                const { demoFallback } = await ensureAuthenticatedUid();
                await addMemberToGroup(
                  group,
                  {
                    uid: friend.friendUid,
                    displayName: friend.displayName,
                    initials: friend.initials,
                    avatarTone: friend.avatarTone,
                  },
                  demoFallback
                );
              }}
              onRemoveMemberFromGroup={async (group, memberUid) => {
                const { demoFallback } = await ensureAuthenticatedUid();
                await removeMemberFromGroup(group, memberUid, demoFallback);
              }}
              onJoinGroupByCode={async (groupId) => {
                const { profile, demoFallback } = await getActiveProfile();
                const joined = await joinGroupByInvite(groupId, profile, demoFallback);
                setPendingJoinGroupId(null);
                return joined;
              }}
              onDeleteGroup={async (groupId) => {
                const { demoFallback } = await ensureAuthenticatedUid();
                await deleteFriendGroup(groupId, demoFallback);
              }}
              onStartMeetupForGroup={(group) => {
                setGroupPreset(group);
                setActiveSection('meetups');
              }}
            />
          )}

          {activeSection === 'profile' && (
            <ProfileSettingsView
              profile={userProfile}
              authUser={authUser}
              darkMode={darkMode}
              onToggleDarkMode={(nextDark) => setDarkMode(nextDark)}
              useDemoMode={useDemoMode}
              onToggleDemoMode={() => {
                if (!isFirebaseConfigured) return;
                setUseDemoMode((prev) => !prev);
              }}
              canToggleCloud={isFirebaseConfigured}
              recentRoomsCount={recentRooms.length}
              onClearRecentRooms={() => {
                setRecentRooms([]);
                try {
                  localStorage.removeItem(RECENT_ROOMS_KEY);
                } catch {
                  // ignore
                }
              }}
              onSaveProfile={async (patch) => {
                const { profile, demoFallback } = await getActiveProfile();
                const updated = await updateUserProfile(profile, patch, demoFallback);
                setUserProfile(updated);
                persistName(updated.displayName);
              }}
            />
          )}

          {/* Mobile Bottom Navigation */}
          <nav
            aria-label="ניווט ראשי"
            className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#141A23]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
          >
            <div className="grid grid-cols-4 h-14 items-center">
              {(
                [
                  { id: 'meetups', label: 'מפגשים', icon: CalendarClock },
                  {
                    id: 'friends',
                    label:
                      incomingRequests.length > 0
                        ? `חברים (${incomingRequests.length})`
                        : 'חברים',
                    icon: Users,
                  },
                  { id: 'groups', label: 'קבוצות', icon: Layers },
                  { id: 'profile', label: 'פרופיל', icon: UserCog },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectSection(id)}
                    className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                      active
                        ? 'text-[#1E3A5F] dark:text-[#6AA2E8] font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] truncate max-w-[78px]">{label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      ) : shouldShowRoomWorkspace ? (
        <RoomWorkspace
          bundle={roomBundle}
          currentUid={effectiveUid}
          currentUserName={currentUserName}
          useDemoMode={useDemoMode}
          hasCalendarToken={hasCalendarToken}
          savedFriendUids={savedFriendUidSet}
          onAddFriendFromParticipant={handleAddFriendFromParticipant}
          onRequestGoogleAuth={handleGoogleSignIn}
          getCalendarToken={getCalendarAccessToken}
          onDeleteRoom={handleDeleteRoom}
          onCreateNewRoom={() => {
            setJustCreatedRoomId(null);
            navigateToRoom(null);
          }}
        />
      ) : (
        <JoinRoomScreen
          room={roomBundle.room ?? previewRoom}
          roomId={activeRoomId}
          isLoading={roomLoading}
          user={authUser}
          defaultName={userProfile?.displayName || savedName}
          onJoin={handleJoinRoom}
          onGoogleSignIn={async () => {
            await handleGoogleSignIn();
          }}
          onBackHome={() => navigateToRoom(null)}
          authNotice={authNotice}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
