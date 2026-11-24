import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { extractInitials, pickAvatarTone } from '../data/decks';
import { db, isFirebaseConfigured } from '../firebase/config';
import { OperationType, handleFirestoreError } from '../firebase/errors';
import {
  BLUEPRINT_LIMITS,
  FriendGroupDoc,
  FriendRequestDoc,
  GroupMemberDoc,
  GroupWithMembers,
  PublicProfileDoc,
  RoomCategory,
  SavedFriendDoc,
  UserProfileDoc,
} from '../types/meetup';

const SOCIAL_CHANNEL_NAME = 'nifgashim_social_sync_v1';
const DEMO_USERS_KEY = 'nifgashim_demo_users_v1';
const DEMO_PUBLIC_KEY = 'nifgashim_demo_public_profiles_v1';
const DEMO_REQUESTS_KEY = 'nifgashim_demo_friend_requests_v1';
const DEMO_FRIENDS_KEY_PREFIX = 'nifgashim_demo_friends_v1_';
const DEMO_GROUPS_KEY = 'nifgashim_demo_groups_v1';

function clampText(raw: string, maxLen: number, fallback = ''): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length >= 1 && cleaned.length <= BLUEPRINT_LIMITS.ID_MAX) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeFriendCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^.*ADDFRIEND=/i, '')
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, BLUEPRINT_LIMITS.FRIEND_CODE_MAX);
}

export function generateFriendCode(seedUid: string): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let hash = 2166136261;
  for (let i = 0; i < seedUid.length; i += 1) {
    hash ^= seedUid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let out = 'NF';
  for (let i = 0; i < 5; i += 1) {
    hash = Math.imul(hash ^ (i + 7), 16777619) >>> 0;
    out += alphabet[hash % alphabet.length];
  }
  return out;
}

export function generateGroupId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = 'grp_';
  for (let i = 0; i < 7; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function broadcastSocialChange(scope: string): void {
  try {
    const ch = new BroadcastChannel(SOCIAL_CHANNEL_NAME);
    ch.postMessage({ type: 'social_updated', scope });
    ch.close();
  } catch {
    // ignore when BroadcastChannel is unsupported
  }
}

function readJsonStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStore<T>(key: string, value: T, scope: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
  broadcastSocialChange(scope);
}

// ============================================================================
// USER PROFILES & SETTINGS
// ============================================================================

function buildDefaultProfile(uid: string, fallbackName: string): UserProfileDoc {
  const safeName = clampText(fallbackName, BLUEPRINT_LIMITS.NAME_MAX, 'משתמש חדש');
  return {
    uid,
    displayName: safeName,
    bio: '',
    city: '',
    friendCode: generateFriendCode(uid),
    initials: extractInitials(safeName),
    avatarTone: pickAvatarTone(uid),
    defaultCategory: 'food',
    defaultDurationMinutes: 60,
    notifyMeetingStarting: true,
    notifyDecisionFinalized: true,
    notifyChecklistAdded: true,
    showCityOnPublicCard: true,
  };
}

export async function ensureUserProfile(
  uid: string,
  fallbackName: string,
  useDemoMode: boolean
): Promise<UserProfileDoc> {
  const safeUid = sanitizeId(uid, 'user');
  const defaults = buildDefaultProfile(safeUid, fallbackName);

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const users = readJsonStore<Record<string, UserProfileDoc>>(DEMO_USERS_KEY, {});
    if (users[safeUid]) {
      return users[safeUid];
    }
    const created: UserProfileDoc = {
      ...defaults,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    users[safeUid] = created;
    writeJsonStore(DEMO_USERS_KEY, users, 'profile');

    const publics = readJsonStore<Record<string, PublicProfileDoc>>(DEMO_PUBLIC_KEY, {});
    publics[created.friendCode] = {
      friendCode: created.friendCode,
      uid: safeUid,
      displayName: created.displayName,
      initials: created.initials,
      avatarTone: created.avatarTone,
      bio: created.bio,
      city: created.showCityOnPublicCard ? created.city : '',
      updatedAt: Date.now(),
    };
    writeJsonStore(DEMO_PUBLIC_KEY, publics, 'publicProfiles');
    return created;
  }

  const firestore = db;
  const userPath = `users/${safeUid}`;
  const userRef = doc(firestore, 'users', safeUid);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existing = snap.data() as UserProfileDoc;
      // Ensure matching publicProfile exists
      const pubRef = doc(firestore, 'publicProfiles', existing.friendCode);
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists()) {
        await setDoc(pubRef, {
          friendCode: existing.friendCode,
          uid: safeUid,
          displayName: existing.displayName,
          initials: existing.initials,
          avatarTone: existing.avatarTone,
          bio: existing.bio,
          city: existing.showCityOnPublicCard ? existing.city : '',
          updatedAt: serverTimestamp(),
        });
      }
      return existing;
    }

    await setDoc(userRef, {
      ...defaults,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firestore, 'publicProfiles', defaults.friendCode), {
      friendCode: defaults.friendCode,
      uid: safeUid,
      displayName: defaults.displayName,
      initials: defaults.initials,
      avatarTone: defaults.avatarTone,
      bio: defaults.bio,
      city: defaults.showCityOnPublicCard ? defaults.city : '',
      updatedAt: serverTimestamp(),
    });
    return defaults;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export function subscribeUserProfile(
  uid: string,
  useDemoMode: boolean,
  onData: (profile: UserProfileDoc | null) => void,
  onError: (err: Error) => void
): () => void {
  const safeUid = sanitizeId(uid, 'user');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const emit = () => {
      const users = readJsonStore<Record<string, UserProfileDoc>>(DEMO_USERS_KEY, {});
      onData(users[safeUid] ?? null);
    };
    emit();

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(SOCIAL_CHANNEL_NAME);
      ch.onmessage = emit;
    } catch {
      // ignore
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_USERS_KEY) emit();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }

  const firestore = db;
  const path = `users/${safeUid}`;
  return onSnapshot(
    doc(firestore, 'users', safeUid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserProfileDoc) : null);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function updateUserProfile(
  current: UserProfileDoc,
  patch: Partial<{
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
  }>,
  useDemoMode: boolean
): Promise<UserProfileDoc> {
  const displayName = clampText(
    patch.displayName ?? current.displayName,
    BLUEPRINT_LIMITS.NAME_MAX,
    current.displayName || 'משתמש'
  );
  const bio = (patch.bio ?? current.bio).trim().slice(0, BLUEPRINT_LIMITS.BIO_MAX);
  const city = (patch.city ?? current.city).trim().slice(0, BLUEPRINT_LIMITS.CITY_MAX);
  const avatarTone = clampText(
    patch.avatarTone ?? current.avatarTone,
    BLUEPRINT_LIMITS.AVATAR_TONE_MAX,
    current.avatarTone
  );
  const initials = extractInitials(displayName);
  const defaultCategory = patch.defaultCategory ?? current.defaultCategory;
  const defaultDurationMinutes = Math.min(
    1440,
    Math.max(1, Math.round(patch.defaultDurationMinutes ?? current.defaultDurationMinutes))
  );
  const notifyMeetingStarting =
    patch.notifyMeetingStarting ?? current.notifyMeetingStarting;
  const notifyDecisionFinalized =
    patch.notifyDecisionFinalized ?? current.notifyDecisionFinalized;
  const notifyChecklistAdded =
    patch.notifyChecklistAdded ?? current.notifyChecklistAdded;
  const showCityOnPublicCard =
    patch.showCityOnPublicCard ?? current.showCityOnPublicCard;

  const nextProfile: UserProfileDoc = {
    ...current,
    displayName,
    bio,
    city,
    initials,
    avatarTone,
    defaultCategory,
    defaultDurationMinutes,
    notifyMeetingStarting,
    notifyDecisionFinalized,
    notifyChecklistAdded,
    showCityOnPublicCard,
  };

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const users = readJsonStore<Record<string, UserProfileDoc>>(DEMO_USERS_KEY, {});
    users[current.uid] = { ...nextProfile, updatedAt: Date.now() };
    writeJsonStore(DEMO_USERS_KEY, users, 'profile');

    const publics = readJsonStore<Record<string, PublicProfileDoc>>(DEMO_PUBLIC_KEY, {});
    publics[current.friendCode] = {
      friendCode: current.friendCode,
      uid: current.uid,
      displayName,
      initials,
      avatarTone,
      bio,
      city: showCityOnPublicCard ? city : '',
      updatedAt: Date.now(),
    };
    writeJsonStore(DEMO_PUBLIC_KEY, publics, 'publicProfiles');
    return nextProfile;
  }

  const firestore = db;
  const path = `users/${current.uid}`;
  try {
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, 'users', current.uid), {
      displayName,
      bio,
      city,
      initials,
      avatarTone,
      defaultCategory,
      defaultDurationMinutes,
      notifyMeetingStarting,
      notifyDecisionFinalized,
      notifyChecklistAdded,
      showCityOnPublicCard,
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(firestore, 'publicProfiles', current.friendCode),
      {
        friendCode: current.friendCode,
        uid: current.uid,
        displayName,
        initials,
        avatarTone,
        bio,
        city: showCityOnPublicCard ? city : '',
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
    await batch.commit();
    return nextProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// PUBLIC PROFILE LOOKUP, FRIENDS & FRIEND REQUESTS
// ============================================================================

export async function lookupPublicProfileByCode(
  rawCode: string,
  useDemoMode: boolean
): Promise<PublicProfileDoc | null> {
  const code = normalizeFriendCode(rawCode);
  if (code.length < BLUEPRINT_LIMITS.FRIEND_CODE_MIN) return null;

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const publics = readJsonStore<Record<string, PublicProfileDoc>>(DEMO_PUBLIC_KEY, {});
    return publics[code] ?? null;
  }

  const firestore = db;
  const path = `publicProfiles/${code}`;
  try {
    const snap = await getDoc(doc(firestore, 'publicProfiles', code));
    return snap.exists() ? (snap.data() as PublicProfileDoc) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeMyFriends(
  uid: string,
  useDemoMode: boolean,
  onData: (friends: SavedFriendDoc[]) => void,
  onError: (err: Error) => void
): () => void {
  const safeUid = sanitizeId(uid, 'user');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const key = `${DEMO_FRIENDS_KEY_PREFIX}${safeUid}`;
    const emit = () => {
      const list = readJsonStore<SavedFriendDoc[]>(key, []);
      onData(
        [...list].sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          return a.displayName.localeCompare(b.displayName, 'he');
        })
      );
    };
    emit();

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(SOCIAL_CHANNEL_NAME);
      ch.onmessage = emit;
    } catch {
      // ignore
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) emit();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }

  const firestore = db;
  const path = `users/${safeUid}/friends`;
  return onSnapshot(
    query(collection(firestore, 'users', safeUid, 'friends'), where('ownerUid', '==', safeUid)),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as SavedFriendDoc)
        .sort((a, b) => {
          if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
          return a.displayName.localeCompare(b.displayName, 'he');
        });
      onData(list);
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeMyFriendRequests(
  uid: string,
  useDemoMode: boolean,
  onData: (requests: { incoming: FriendRequestDoc[]; outgoing: FriendRequestDoc[] }) => void,
  onError: (err: Error) => void
): () => void {
  const safeUid = sanitizeId(uid, 'user');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const emit = () => {
      const all = readJsonStore<FriendRequestDoc[]>(DEMO_REQUESTS_KEY, []);
      onData({
        incoming: all.filter((r) => r.toUid === safeUid && r.status === 'pending'),
        outgoing: all.filter((r) => r.fromUid === safeUid),
      });
    };
    emit();

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(SOCIAL_CHANNEL_NAME);
      ch.onmessage = emit;
    } catch {
      // ignore
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_REQUESTS_KEY) emit();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }

  const firestore = db;
  let incoming: FriendRequestDoc[] = [];
  let outgoing: FriendRequestDoc[] = [];
  const emitCombined = () => onData({ incoming, outgoing });

  const unsubIn = onSnapshot(
    query(collection(firestore, 'friendRequests'), where('toUid', '==', safeUid)),
    (snap) => {
      incoming = snap.docs
        .map((d) => d.data() as FriendRequestDoc)
        .filter((r) => r.status === 'pending');
      emitCombined();
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, 'friendRequests');
    }
  );

  const unsubOut = onSnapshot(
    query(collection(firestore, 'friendRequests'), where('fromUid', '==', safeUid)),
    (snap) => {
      outgoing = snap.docs.map((d) => d.data() as FriendRequestDoc);
      emitCombined();
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, 'friendRequests');
    }
  );

  return () => {
    unsubIn();
    unsubOut();
  };
}

export async function addSavedFriend(
  ownerUid: string,
  input: {
    friendUid?: string;
    displayName: string;
    avatarTone?: string;
    friendCode?: string;
    nickname?: string;
    favorite?: boolean;
  },
  useDemoMode: boolean
): Promise<void> {
  const safeOwnerUid = sanitizeId(ownerUid, 'user');
  const safeFriendUid = sanitizeId(
    input.friendUid || `contact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    'friend'
  );
  const displayName = clampText(input.displayName, BLUEPRINT_LIMITS.NAME_MAX, 'חבר');
  const initials = extractInitials(displayName);
  const avatarTone = clampText(
    input.avatarTone || pickAvatarTone(safeFriendUid),
    BLUEPRINT_LIMITS.AVATAR_TONE_MAX,
    pickAvatarTone(safeFriendUid)
  );
  const friendCode = normalizeFriendCode(input.friendCode || '');
  const nickname = (input.nickname || '').trim().slice(0, BLUEPRINT_LIMITS.NICKNAME_MAX);
  const favorite = Boolean(input.favorite);

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const key = `${DEMO_FRIENDS_KEY_PREFIX}${safeOwnerUid}`;
    const list = readJsonStore<SavedFriendDoc[]>(key, []);
    const existing = list.find((f) => f.friendUid === safeFriendUid);
    const entry: SavedFriendDoc = {
      ownerUid: safeOwnerUid,
      friendUid: safeFriendUid,
      displayName,
      initials,
      avatarTone,
      friendCode,
      nickname: existing ? existing.nickname || nickname : nickname,
      favorite: existing ? existing.favorite : favorite,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const next = [entry, ...list.filter((f) => f.friendUid !== safeFriendUid)];
    writeJsonStore(key, next, 'friends');
    return;
  }

  const firestore = db;
  const path = `users/${safeOwnerUid}/friends/${safeFriendUid}`;
  const ref = doc(firestore, 'users', safeOwnerUid, 'friends', safeFriendUid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        displayName,
        initials,
        avatarTone,
        friendCode,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerUid: safeOwnerUid,
        friendUid: safeFriendUid,
        displayName,
        initials,
        avatarTone,
        friendCode,
        nickname,
        favorite,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateSavedFriend(
  ownerUid: string,
  friendUid: string,
  patch: { nickname?: string; favorite?: boolean },
  useDemoMode: boolean
): Promise<void> {
  const safeOwnerUid = sanitizeId(ownerUid, 'user');
  const safeFriendUid = sanitizeId(friendUid, 'friend');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const key = `${DEMO_FRIENDS_KEY_PREFIX}${safeOwnerUid}`;
    const list = readJsonStore<SavedFriendDoc[]>(key, []);
    const next = list.map((f) =>
      f.friendUid === safeFriendUid
        ? {
            ...f,
            nickname:
              patch.nickname !== undefined
                ? patch.nickname.trim().slice(0, BLUEPRINT_LIMITS.NICKNAME_MAX)
                : f.nickname,
            favorite: patch.favorite !== undefined ? patch.favorite : f.favorite,
            updatedAt: Date.now(),
          }
        : f
    );
    writeJsonStore(key, next, 'friends');
    return;
  }

  const firestore = db;
  const path = `users/${safeOwnerUid}/friends/${safeFriendUid}`;
  try {
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.nickname !== undefined) {
      updates.nickname = patch.nickname.trim().slice(0, BLUEPRINT_LIMITS.NICKNAME_MAX);
    }
    if (patch.favorite !== undefined) {
      updates.favorite = patch.favorite;
    }
    await updateDoc(doc(firestore, 'users', safeOwnerUid, 'friends', safeFriendUid), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeSavedFriend(
  ownerUid: string,
  friendUid: string,
  useDemoMode: boolean
): Promise<void> {
  const safeOwnerUid = sanitizeId(ownerUid, 'user');
  const safeFriendUid = sanitizeId(friendUid, 'friend');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const key = `${DEMO_FRIENDS_KEY_PREFIX}${safeOwnerUid}`;
    const list = readJsonStore<SavedFriendDoc[]>(key, []);
    writeJsonStore(
      key,
      list.filter((f) => f.friendUid !== safeFriendUid),
      'friends'
    );
    return;
  }

  const firestore = db;
  const path = `users/${safeOwnerUid}/friends/${safeFriendUid}`;
  try {
    await deleteDoc(doc(firestore, 'users', safeOwnerUid, 'friends', safeFriendUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendFriendRequest(
  myProfile: UserProfileDoc,
  target: PublicProfileDoc,
  useDemoMode: boolean
): Promise<void> {
  if (myProfile.uid === target.uid) {
    throw new Error('לא ניתן לשלוח בקשת חברות לעצמך.');
  }
  const reqId = `${myProfile.uid}_${target.uid}`;

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const list = readJsonStore<FriendRequestDoc[]>(DEMO_REQUESTS_KEY, []);
    const reqDoc: FriendRequestDoc = {
      id: reqId,
      fromUid: myProfile.uid,
      fromName: myProfile.displayName,
      fromInitials: myProfile.initials,
      fromAvatarTone: myProfile.avatarTone,
      fromFriendCode: myProfile.friendCode,
      toUid: target.uid,
      toName: target.displayName,
      toFriendCode: target.friendCode,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [reqDoc, ...list.filter((r) => r.id !== reqId)];
    writeJsonStore(DEMO_REQUESTS_KEY, next, 'requests');
    return;
  }

  const firestore = db;
  const path = `friendRequests/${reqId}`;
  const ref = doc(firestore, 'friendRequests', reqId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const existing = snap.data() as FriendRequestDoc;
      if (existing.status === 'declined') {
        await updateDoc(ref, {
          status: 'pending',
          fromName: myProfile.displayName,
          fromInitials: myProfile.initials,
          fromAvatarTone: myProfile.avatarTone,
          updatedAt: serverTimestamp(),
        });
      }
      return;
    }

    await setDoc(ref, {
      id: reqId,
      fromUid: myProfile.uid,
      fromName: myProfile.displayName,
      fromInitials: myProfile.initials,
      fromAvatarTone: myProfile.avatarTone,
      fromFriendCode: myProfile.friendCode,
      toUid: target.uid,
      toName: target.displayName,
      toFriendCode: target.friendCode,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function respondToFriendRequest(
  req: FriendRequestDoc,
  decision: 'accepted' | 'declined',
  myProfile: UserProfileDoc,
  useDemoMode: boolean
): Promise<void> {
  if (useDemoMode || !db || !isFirebaseConfigured) {
    const list = readJsonStore<FriendRequestDoc[]>(DEMO_REQUESTS_KEY, []);
    const next = list.map((r) =>
      r.id === req.id ? { ...r, status: decision, updatedAt: Date.now() } : r
    );
    writeJsonStore(DEMO_REQUESTS_KEY, next, 'requests');
    if (decision === 'accepted') {
      await addSavedFriend(
        myProfile.uid,
        {
          friendUid: req.fromUid,
          displayName: req.fromName,
          avatarTone: req.fromAvatarTone,
          friendCode: req.fromFriendCode,
        },
        true
      );
      await addSavedFriend(
        req.fromUid,
        {
          friendUid: myProfile.uid,
          displayName: myProfile.displayName,
          avatarTone: myProfile.avatarTone,
          friendCode: myProfile.friendCode,
        },
        true
      );
    }
    return;
  }

  const firestore = db;
  const path = `friendRequests/${req.id}`;
  try {
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, 'friendRequests', req.id), {
      status: decision,
      updatedAt: serverTimestamp(),
    });
    if (decision === 'accepted') {
      batch.set(doc(firestore, 'users', myProfile.uid, 'friends', req.fromUid), {
        ownerUid: myProfile.uid,
        friendUid: req.fromUid,
        displayName: clampText(req.fromName, BLUEPRINT_LIMITS.NAME_MAX, 'חבר'),
        initials: clampText(req.fromInitials, BLUEPRINT_LIMITS.INITIALS_MAX, 'ח'),
        avatarTone: clampText(
          req.fromAvatarTone,
          BLUEPRINT_LIMITS.AVATAR_TONE_MAX,
          pickAvatarTone(req.fromUid)
        ),
        friendCode: normalizeFriendCode(req.fromFriendCode),
        nickname: '',
        favorite: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFriendRequest(
  requestId: string,
  useDemoMode: boolean
): Promise<void> {
  const safeId = sanitizeId(requestId, 'req');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const list = readJsonStore<FriendRequestDoc[]>(DEMO_REQUESTS_KEY, []);
    writeJsonStore(
      DEMO_REQUESTS_KEY,
      list.filter((r) => r.id !== safeId),
      'requests'
    );
    return;
  }

  const firestore = db;
  const path = `friendRequests/${safeId}`;
  try {
    await deleteDoc(doc(firestore, 'friendRequests', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// FRIEND GROUPS
// ============================================================================

export function subscribeMyGroups(
  uid: string,
  useDemoMode: boolean,
  onData: (groups: GroupWithMembers[]) => void,
  onError: (err: Error) => void
): () => void {
  const safeUid = sanitizeId(uid, 'user');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const emit = () => {
      const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
      onData(store.filter((g) => g.group.memberUids.includes(safeUid)));
    };
    emit();

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(SOCIAL_CHANNEL_NAME);
      ch.onmessage = emit;
    } catch {
      // ignore
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_GROUPS_KEY) emit();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }

  const firestore = db;
  const path = 'groups';
  let active = true;
  let memberUnsubs: Array<() => void> = [];
  const membersMap = new Map<string, GroupMemberDoc[]>();
  let latestGroups: FriendGroupDoc[] = [];

  const emitAll = () => {
    if (!active) return;
    onData(
      latestGroups.map((group) => ({
        group,
        members: membersMap.get(group.id) ?? [],
      }))
    );
  };

  const unsubGroups = onSnapshot(
    query(collection(firestore, 'groups'), where('memberUids', 'array-contains', safeUid)),
    (snap) => {
      latestGroups = snap.docs.map((d) => d.data() as FriendGroupDoc);
      memberUnsubs.forEach((u) => u());
      memberUnsubs = [];

      if (latestGroups.length === 0) {
        emitAll();
        return;
      }

      latestGroups.forEach((grp) => {
        const unsubMem = onSnapshot(
          query(collection(firestore, 'groups', grp.id, 'members'), where('groupId', '==', grp.id)),
          (mSnap) => {
            membersMap.set(
              grp.id,
              mSnap.docs.map((md) => md.data() as GroupMemberDoc)
            );
            emitAll();
          },
          (error) => {
            onError(error);
            handleFirestoreError(error, OperationType.LIST, `groups/${grp.id}/members`);
          }
        );
        memberUnsubs.push(unsubMem);
      });
      emitAll();
    },
    (error) => {
      onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );

  return () => {
    active = false;
    unsubGroups();
    memberUnsubs.forEach((u) => u());
  };
}

export async function createFriendGroup(
  params: {
    creator: UserProfileDoc;
    name: string;
    description: string;
    defaultCategory: RoomCategory;
    initialFriends: SavedFriendDoc[];
  },
  useDemoMode: boolean
): Promise<string> {
  const groupId = generateGroupId();
  const safeName = clampText(params.name, BLUEPRINT_LIMITS.GROUP_NAME_MAX, 'קבוצת חברים');
  const safeDesc = params.description.trim().slice(0, BLUEPRINT_LIMITS.GROUP_DESC_MAX);

  const uniqueFriends: SavedFriendDoc[] = [];
  const seen = new Set<string>([params.creator.uid]);
  for (const fr of params.initialFriends) {
    if (!seen.has(fr.friendUid) && seen.size < BLUEPRINT_LIMITS.GROUP_MEMBERS_MAX) {
      seen.add(fr.friendUid);
      uniqueFriends.push(fr);
    }
  }
  const memberUids = Array.from(seen);

  const groupDoc: FriendGroupDoc = {
    id: groupId,
    creatorId: params.creator.uid,
    creatorName: params.creator.displayName,
    name: safeName,
    description: safeDesc,
    defaultCategory: params.defaultCategory,
    memberUids,
  };

  const memberDocs: GroupMemberDoc[] = [
    {
      uid: params.creator.uid,
      groupId,
      displayName: params.creator.displayName,
      initials: params.creator.initials,
      avatarTone: params.creator.avatarTone,
      role: 'admin',
    },
    ...uniqueFriends.map((fr) => ({
      uid: fr.friendUid,
      groupId,
      displayName: fr.displayName,
      initials: fr.initials,
      avatarTone: fr.avatarTone,
      role: 'member' as const,
    })),
  ];

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
    store.unshift({
      group: { ...groupDoc, createdAt: Date.now(), updatedAt: Date.now() },
      members: memberDocs.map((m) => ({ ...m, joinedAt: Date.now() })),
    });
    writeJsonStore(DEMO_GROUPS_KEY, store, 'groups');
    return groupId;
  }

  const firestore = db;
  const path = `groups/${groupId}`;
  try {
    // Commit parent group first so subcollection security rules see getGroup(groupId)
    await setDoc(doc(firestore, 'groups', groupId), {
      ...groupDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const batch = writeBatch(firestore);
    for (const member of memberDocs) {
      batch.set(doc(firestore, 'groups', groupId, 'members', member.uid), {
        ...member,
        joinedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return groupId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFriendGroup(
  groupId: string,
  patch: {
    name?: string;
    description?: string;
    defaultCategory?: RoomCategory;
  },
  useDemoMode: boolean
): Promise<void> {
  const safeId = sanitizeId(groupId, 'grp');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
    const next = store.map((entry) => {
      if (entry.group.id !== safeId) return entry;
      return {
        ...entry,
        group: {
          ...entry.group,
          name:
            patch.name !== undefined
              ? clampText(patch.name, BLUEPRINT_LIMITS.GROUP_NAME_MAX, entry.group.name)
              : entry.group.name,
          description:
            patch.description !== undefined
              ? patch.description.trim().slice(0, BLUEPRINT_LIMITS.GROUP_DESC_MAX)
              : entry.group.description,
          defaultCategory: patch.defaultCategory ?? entry.group.defaultCategory,
          updatedAt: Date.now(),
        },
      };
    });
    writeJsonStore(DEMO_GROUPS_KEY, next, 'groups');
    return;
  }

  const firestore = db;
  const path = `groups/${safeId}`;
  try {
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.name !== undefined) {
      updates.name = clampText(patch.name, BLUEPRINT_LIMITS.GROUP_NAME_MAX, 'קבוצה');
    }
    if (patch.description !== undefined) {
      updates.description = patch.description.trim().slice(0, BLUEPRINT_LIMITS.GROUP_DESC_MAX);
    }
    if (patch.defaultCategory !== undefined) {
      updates.defaultCategory = patch.defaultCategory;
    }
    await updateDoc(doc(firestore, 'groups', safeId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addMemberToGroup(
  group: FriendGroupDoc,
  friend: {
    uid: string;
    displayName: string;
    initials: string;
    avatarTone: string;
  },
  useDemoMode: boolean
): Promise<void> {
  if (group.memberUids.includes(friend.uid)) return;
  if (group.memberUids.length >= BLUEPRINT_LIMITS.GROUP_MEMBERS_MAX) {
    throw new Error('הקבוצה הגיעה למגבלת 30 החברים.');
  }

  const nextMemberUids = [...group.memberUids, friend.uid];
  const memberDoc: GroupMemberDoc = {
    uid: friend.uid,
    groupId: group.id,
    displayName: clampText(friend.displayName, BLUEPRINT_LIMITS.NAME_MAX, 'חבר'),
    initials: clampText(friend.initials, BLUEPRINT_LIMITS.INITIALS_MAX, 'ח'),
    avatarTone: clampText(
      friend.avatarTone,
      BLUEPRINT_LIMITS.AVATAR_TONE_MAX,
      pickAvatarTone(friend.uid)
    ),
    role: 'member',
  };

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
    const next = store.map((entry) => {
      if (entry.group.id !== group.id) return entry;
      return {
        group: { ...entry.group, memberUids: nextMemberUids, updatedAt: Date.now() },
        members: [
          ...entry.members.filter((m) => m.uid !== friend.uid),
          { ...memberDoc, joinedAt: Date.now() },
        ],
      };
    });
    writeJsonStore(DEMO_GROUPS_KEY, next, 'groups');
    return;
  }

  const firestore = db;
  const path = `groups/${group.id}`;
  try {
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, 'groups', group.id), {
      memberUids: nextMemberUids,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(firestore, 'groups', group.id, 'members', friend.uid), {
      ...memberDoc,
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeMemberFromGroup(
  group: FriendGroupDoc,
  memberUid: string,
  useDemoMode: boolean
): Promise<void> {
  if (memberUid === group.creatorId) return;
  const nextMemberUids = group.memberUids.filter((id) => id !== memberUid);

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
    const next = store.map((entry) => {
      if (entry.group.id !== group.id) return entry;
      return {
        group: { ...entry.group, memberUids: nextMemberUids, updatedAt: Date.now() },
        members: entry.members.filter((m) => m.uid !== memberUid),
      };
    });
    writeJsonStore(DEMO_GROUPS_KEY, next, 'groups');
    return;
  }

  const firestore = db;
  const path = `groups/${group.id}`;
  try {
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, 'groups', group.id), {
      memberUids: nextMemberUids,
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(firestore, 'groups', group.id, 'members', memberUid));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function joinGroupByInvite(
  rawGroupId: string,
  profile: UserProfileDoc,
  useDemoMode: boolean
): Promise<FriendGroupDoc | null> {
  const safeId = sanitizeId(
    rawGroupId.trim().replace(/^.*group=/i, ''),
    'grp'
  );

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
    const target = store.find((e) => e.group.id === safeId);
    if (!target) return null;
    if (target.group.memberUids.includes(profile.uid)) return target.group;
    if (target.group.memberUids.length >= BLUEPRINT_LIMITS.GROUP_MEMBERS_MAX) {
      throw new Error('הקבוצה הגיעה למגבלת 30 החברים.');
    }
    const nextUids = [...target.group.memberUids, profile.uid];
    const next = store.map((e) =>
      e.group.id === safeId
        ? {
            group: { ...e.group, memberUids: nextUids, updatedAt: Date.now() },
            members: [
              ...e.members,
              {
                uid: profile.uid,
                groupId: safeId,
                displayName: profile.displayName,
                initials: profile.initials,
                avatarTone: profile.avatarTone,
                role: 'member' as const,
                joinedAt: Date.now(),
              },
            ],
          }
        : e
    );
    writeJsonStore(DEMO_GROUPS_KEY, next, 'groups');
    return { ...target.group, memberUids: nextUids };
  }

  const firestore = db;
  const path = `groups/${safeId}`;
  try {
    const snap = await getDoc(doc(firestore, 'groups', safeId));
    if (!snap.exists()) return null;
    const grp = snap.data() as FriendGroupDoc;
    if (grp.memberUids.includes(profile.uid)) return grp;
    if (grp.memberUids.length >= BLUEPRINT_LIMITS.GROUP_MEMBERS_MAX) {
      throw new Error('הקבוצה הגיעה למגבלת 30 החברים.');
    }

    const nextUids = [...grp.memberUids, profile.uid];
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, 'groups', safeId), {
      memberUids: nextUids,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(firestore, 'groups', safeId, 'members', profile.uid), {
      uid: profile.uid,
      groupId: safeId,
      displayName: profile.displayName,
      initials: profile.initials,
      avatarTone: profile.avatarTone,
      role: 'member',
      joinedAt: serverTimestamp(),
    });
    await batch.commit();
    return { ...grp, memberUids: nextUids };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFriendGroup(
  groupId: string,
  useDemoMode: boolean
): Promise<void> {
  const safeId = sanitizeId(groupId, 'grp');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const store = readJsonStore<GroupWithMembers[]>(DEMO_GROUPS_KEY, []);
    writeJsonStore(
      DEMO_GROUPS_KEY,
      store.filter((e) => e.group.id !== safeId),
      'groups'
    );
    return;
  }

  const firestore = db;
  const path = `groups/${safeId}`;
  try {
    const mSnap = await getDocs(
      query(collection(firestore, 'groups', safeId, 'members'), where('groupId', '==', safeId))
    );
    const batch = writeBatch(firestore);
    mSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(firestore, 'groups', safeId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
