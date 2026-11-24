import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_CHECKLIST_BY_CATEGORY,
  extractInitials,
  pickAvatarTone,
} from '../data/decks';
import { db, isFirebaseConfigured } from '../firebase/config';
import { OperationType, handleFirestoreError } from '../firebase/errors';
import {
  BLUEPRINT_LIMITS,
  ChecklistItemDoc,
  CustomCardDoc,
  ParticipantDoc,
  RoomCategory,
  RoomDoc,
  RoomMode,
  SwipeRecordDoc,
  SwipeScore,
  TimeOptionDoc,
  TimeVoteDoc,
} from '../types/meetup';

export interface RoomBundle {
  room: RoomDoc | null;
  participants: ParticipantDoc[];
  timeOptions: TimeOptionDoc[];
  timeVotes: TimeVoteDoc[];
  customCards: CustomCardDoc[];
  swipes: SwipeRecordDoc[];
  checklist: ChecklistItemDoc[];
}

export interface CreateRoomInput {
  title: string;
  category: RoomCategory;
  mode: RoomMode;
  durationMinutes: number;
  creatorId: string;
  creatorName: string;
  isGoogleUser: boolean;
  initialTimeOptions: Array<{
    id: string;
    label: string;
    dateIso: string;
    startTime: string;
  }>;
}

const DEMO_CHANNEL_NAME = 'nifgashim_demo_sync_v1';
const DEMO_ROOMS_INDEX_KEY = 'nifgashim_demo_rooms_index';

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleaned.length >= 1 && cleaned.length <= BLUEPRINT_LIMITS.ID_MAX) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampText(raw: string, maxLen: number, fallback = ''): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

export function generateRoomId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function generateItemId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================================
// LOCAL DEMO FALLBACK ENGINE (localStorage + BroadcastChannel)
// ============================================================================

function demoRoomKey(roomId: string): string {
  return `nifgashim_demo_room_${roomId}`;
}

function readDemoBundle(roomId: string): RoomBundle | null {
  try {
    const raw = localStorage.getItem(demoRoomKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as RoomBundle;
  } catch {
    return null;
  }
}

function writeDemoBundle(roomId: string, bundle: RoomBundle): void {
  localStorage.setItem(demoRoomKey(roomId), JSON.stringify(bundle));
  if (bundle.room) {
    try {
      const idxRaw = localStorage.getItem(DEMO_ROOMS_INDEX_KEY);
      const list: RoomDoc[] = idxRaw ? (JSON.parse(idxRaw) as RoomDoc[]) : [];
      const next = [bundle.room, ...list.filter((r) => r.id !== roomId)].slice(0, 20);
      localStorage.setItem(DEMO_ROOMS_INDEX_KEY, JSON.stringify(next));
    } catch {
      // ignore index error
    }
  }
  try {
    const ch = new BroadcastChannel(DEMO_CHANNEL_NAME);
    ch.postMessage({ type: 'room_updated', roomId });
    ch.close();
  } catch {
    // BroadcastChannel unavailable in some environments
  }
}

function removeDemoBundle(roomId: string): void {
  localStorage.removeItem(demoRoomKey(roomId));
  try {
    const idxRaw = localStorage.getItem(DEMO_ROOMS_INDEX_KEY);
    const list: RoomDoc[] = idxRaw ? (JSON.parse(idxRaw) as RoomDoc[]) : [];
    localStorage.setItem(
      DEMO_ROOMS_INDEX_KEY,
      JSON.stringify(list.filter((r) => r.id !== roomId))
    );
  } catch {
    // ignore
  }
  try {
    const ch = new BroadcastChannel(DEMO_CHANNEL_NAME);
    ch.postMessage({ type: 'room_updated', roomId });
    ch.close();
  } catch {
    // ignore
  }
}

// ============================================================================
// ROOM OPERATIONS (Firestore + Demo Fallback)
// ============================================================================

export async function createMeetupRoom(
  input: CreateRoomInput,
  useDemoMode: boolean
): Promise<string> {
  const roomId = generateRoomId();
  const safeCreatorName = clampText(input.creatorName, BLUEPRINT_LIMITS.NAME_MAX, 'מארגן');
  const safeTitle = clampText(
    input.title,
    BLUEPRINT_LIMITS.TITLE_MAX,
    input.mode === 'quick' ? 'החלטה מהירה' : 'מפגש חברים'
  );
  const safeDuration = Math.min(1440, Math.max(1, Math.round(input.durationMinutes)));
  const endsAt = Date.now() + safeDuration * 60 * 1000;

  const participantDoc: ParticipantDoc = {
    uid: input.creatorId,
    roomId,
    name: safeCreatorName,
    initials: extractInitials(safeCreatorName).slice(0, BLUEPRINT_LIMITS.INITIALS_MAX),
    avatarTone: pickAvatarTone(input.creatorId + safeCreatorName),
    isGoogleUser: input.isGoogleUser,
  };

  const timeOptions: TimeOptionDoc[] =
    input.mode === 'full'
      ? input.initialTimeOptions.slice(0, 6).map((opt) => ({
          id: sanitizeId(opt.id, 'slot'),
          roomId,
          label: clampText(opt.label, BLUEPRINT_LIMITS.TIME_LABEL_MAX, 'אפשרות זמן'),
          dateIso: clampText(opt.dateIso, BLUEPRINT_LIMITS.DATE_ISO_MAX),
          startTime: clampText(opt.startTime, BLUEPRINT_LIMITS.START_TIME_MAX),
          createdBy: input.creatorId,
        }))
      : [];

  const checklist: ChecklistItemDoc[] =
    input.mode === 'full'
      ? DEFAULT_CHECKLIST_BY_CATEGORY[input.category].map((label, idx) => ({
          id: `item_${idx + 1}`,
          roomId,
          label: clampText(label, BLUEPRINT_LIMITS.CHECKLIST_LABEL_MAX),
          claimedByUid: null,
          claimedByName: null,
          createdBy: input.creatorId,
        }))
      : [];

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const now = Date.now();
    const roomDoc: RoomDoc = {
      id: roomId,
      creatorId: input.creatorId,
      creatorName: safeCreatorName,
      title: safeTitle,
      category: input.category,
      mode: input.mode,
      status: 'open',
      durationMinutes: safeDuration,
      endsAt,
      selectedTimeSlotId: null,
      selectedCardId: null,
      createdAt: now,
      updatedAt: now,
    };
    writeDemoBundle(roomId, {
      room: roomDoc,
      participants: [{ ...participantDoc, joinedAt: now, lastSeenAt: now }],
      timeOptions: timeOptions.map((o) => ({ ...o, createdAt: now })),
      timeVotes: [],
      customCards: [],
      swipes: [],
      checklist: checklist.map((c) => ({ ...c, createdAt: now, updatedAt: now })),
    });
    return roomId;
  }

  const roomPath = `rooms/${roomId}`;
  const firestore = db;
  try {
    const roomRef = doc(firestore, 'rooms', roomId);
    await setDoc(roomRef, {
      id: roomId,
      creatorId: input.creatorId,
      creatorName: safeCreatorName,
      title: safeTitle,
      category: input.category,
      mode: input.mode,
      status: 'open',
      durationMinutes: safeDuration,
      endsAt,
      selectedTimeSlotId: null,
      selectedCardId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'rooms', roomId, 'participants', input.creatorId), {
      ...participantDoc,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    });

    timeOptions.forEach((opt) => {
      batch.set(doc(firestore, 'rooms', roomId, 'timeOptions', opt.id), {
        ...opt,
        createdAt: serverTimestamp(),
      });
    });

    checklist.forEach((item) => {
      batch.set(doc(firestore, 'rooms', roomId, 'checklist', item.id), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return roomId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, roomPath);
  }
}

export async function fetchRoomOverview(
  roomId: string,
  useDemoMode: boolean
): Promise<RoomDoc | null> {
  const safeRoomId = sanitizeId(roomId, 'room');
  if (useDemoMode || !db || !isFirebaseConfigured) {
    return readDemoBundle(safeRoomId)?.room ?? null;
  }

  const path = `rooms/${safeRoomId}`;
  try {
    const snap = await getDoc(doc(db, 'rooms', safeRoomId));
    if (!snap.exists()) return null;
    return snap.data() as RoomDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function listMyCreatedRooms(
  uid: string,
  useDemoMode: boolean
): Promise<RoomDoc[]> {
  if (useDemoMode || !db || !isFirebaseConfigured) {
    try {
      const raw = localStorage.getItem(DEMO_ROOMS_INDEX_KEY);
      const list: RoomDoc[] = raw ? (JSON.parse(raw) as RoomDoc[]) : [];
      return list.filter((r) => r.creatorId === uid);
    } catch {
      return [];
    }
  }

  const path = 'rooms';
  try {
    const q = query(collection(db, 'rooms'), where('creatorId', '==', uid));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => d.data() as RoomDoc);
    return items.sort((a, b) => (b.endsAt || 0) - (a.endsAt || 0)).slice(0, 10);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function joinRoomAsParticipant(
  roomId: string,
  uid: string,
  name: string,
  isGoogleUser: boolean,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const safeName = clampText(name, BLUEPRINT_LIMITS.NAME_MAX, 'אורח');
  const participant: ParticipantDoc = {
    uid,
    roomId: safeRoomId,
    name: safeName,
    initials: extractInitials(safeName).slice(0, BLUEPRINT_LIMITS.INITIALS_MAX),
    avatarTone: pickAvatarTone(uid + safeName),
    isGoogleUser,
  };

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle || !bundle.room) return;
    const now = Date.now();
    const existingIdx = bundle.participants.findIndex((p) => p.uid === uid);
    if (existingIdx >= 0) {
      bundle.participants[existingIdx] = {
        ...bundle.participants[existingIdx],
        ...participant,
        lastSeenAt: now,
      };
    } else {
      bundle.participants.push({ ...participant, joinedAt: now, lastSeenAt: now });
    }
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/participants/${uid}`;
  try {
    const ref = doc(db, 'rooms', safeRoomId, 'participants', uid);
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        name: participant.name,
        initials: participant.initials,
        avatarTone: participant.avatarTone,
        isGoogleUser: participant.isGoogleUser,
        lastSeenAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...participant,
        joinedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToRoom(
  roomId: string,
  useDemoMode: boolean,
  onUpdate: (bundle: RoomBundle) => void,
  onError: (err: Error) => void
): () => void {
  const safeRoomId = sanitizeId(roomId, 'room');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const emitDemo = () => {
      const existing = readDemoBundle(safeRoomId);
      if (existing) {
        onUpdate(existing);
      } else {
        onUpdate({
          room: null,
          participants: [],
          timeOptions: [],
          timeVotes: [],
          customCards: [],
          swipes: [],
          checklist: [],
        });
      }
    };

    emitDemo();
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(DEMO_CHANNEL_NAME);
      ch.onmessage = (event) => {
        if (event.data?.roomId === safeRoomId) {
          emitDemo();
        }
      };
    } catch {
      // ignore
    }
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === demoRoomKey(safeRoomId)) {
        emitDemo();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }

  const state: RoomBundle = {
    room: null,
    participants: [],
    timeOptions: [],
    timeVotes: [],
    customCards: [],
    swipes: [],
    checklist: [],
  };

  const emit = () => {
    onUpdate({
      room: state.room,
      participants: [...state.participants],
      timeOptions: [...state.timeOptions],
      timeVotes: [...state.timeVotes],
      customCards: [...state.customCards],
      swipes: [...state.swipes],
      checklist: [...state.checklist],
    });
  };

  const unsubs: Array<() => void> = [];

  const handleSnapError = (path: string) => (err: unknown) => {
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch (wrapped) {
      onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const firestore = db;
  unsubs.push(
    onSnapshot(
      doc(firestore, 'rooms', safeRoomId),
      (snap) => {
        state.room = snap.exists() ? (snap.data() as RoomDoc) : null;
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}`)
    )
  );

  const subQuery = (sub: string) =>
    query(collection(firestore, 'rooms', safeRoomId, sub), where('roomId', '==', safeRoomId));

  unsubs.push(
    onSnapshot(
      subQuery('participants'),
      (snap) => {
        state.participants = snap.docs.map((d) => d.data() as ParticipantDoc);
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}/participants`)
    )
  );

  unsubs.push(
    onSnapshot(
      subQuery('timeOptions'),
      (snap) => {
        state.timeOptions = snap.docs.map((d) => d.data() as TimeOptionDoc);
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}/timeOptions`)
    )
  );

  unsubs.push(
    onSnapshot(
      subQuery('timeVotes'),
      (snap) => {
        state.timeVotes = snap.docs.map((d) => d.data() as TimeVoteDoc);
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}/timeVotes`)
    )
  );

  unsubs.push(
    onSnapshot(
      subQuery('cards'),
      (snap) => {
        state.customCards = snap.docs.map((d) => d.data() as CustomCardDoc);
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}/cards`)
    )
  );

  unsubs.push(
    onSnapshot(
      subQuery('swipes'),
      (snap) => {
        state.swipes = snap.docs.map((d) => d.data() as SwipeRecordDoc);
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}/swipes`)
    )
  );

  unsubs.push(
    onSnapshot(
      subQuery('checklist'),
      (snap) => {
        state.checklist = snap.docs.map((d) => d.data() as ChecklistItemDoc);
        emit();
      },
      handleSnapError(`rooms/${safeRoomId}/checklist`)
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function addRoomTimeOption(
  roomId: string,
  uid: string,
  label: string,
  dateIso: string,
  startTime: string,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const slotId = generateItemId('slot');
  const payload: TimeOptionDoc = {
    id: slotId,
    roomId: safeRoomId,
    label: clampText(label, BLUEPRINT_LIMITS.TIME_LABEL_MAX, 'מועד חדש'),
    dateIso: clampText(dateIso, BLUEPRINT_LIMITS.DATE_ISO_MAX),
    startTime: clampText(startTime, BLUEPRINT_LIMITS.START_TIME_MAX),
    createdBy: uid,
  };

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    bundle.timeOptions.push({ ...payload, createdAt: Date.now() });
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/timeOptions/${slotId}`;
  try {
    await setDoc(doc(db, 'rooms', safeRoomId, 'timeOptions', slotId), {
      ...payload,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleUserTimeVote(
  roomId: string,
  uid: string,
  slotId: string,
  currentSlotIds: string[],
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const exists = currentSlotIds.includes(slotId);
  const nextSlotIds = (
    exists
      ? currentSlotIds.filter((id) => id !== slotId)
      : [...currentSlotIds, slotId]
  ).slice(0, BLUEPRINT_LIMITS.TIME_SLOTS_MAX);

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    const idx = bundle.timeVotes.findIndex((v) => v.uid === uid);
    const nextVote: TimeVoteDoc = {
      uid,
      roomId: safeRoomId,
      slotIds: nextSlotIds,
      updatedAt: Date.now(),
    };
    if (idx >= 0) {
      bundle.timeVotes[idx] = nextVote;
    } else {
      bundle.timeVotes.push(nextVote);
    }
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/timeVotes/${uid}`;
  try {
    const ref = doc(db, 'rooms', safeRoomId, 'timeVotes', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        slotIds: nextSlotIds,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        roomId: safeRoomId,
        slotIds: nextSlotIds,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function addRoomCustomCard(
  roomId: string,
  category: RoomCategory,
  uid: string,
  creatorName: string,
  cardInput: {
    title: string;
    subtitle: string;
    metaTag: string;
    description: string;
  },
  useDemoMode: boolean
): Promise<CustomCardDoc> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const cardId = generateItemId('card');
  const card: CustomCardDoc = {
    id: cardId,
    roomId: safeRoomId,
    category,
    title: clampText(cardInput.title, BLUEPRINT_LIMITS.TITLE_MAX, 'רעיון מותאם אישית'),
    subtitle: clampText(cardInput.subtitle, BLUEPRINT_LIMITS.CARD_SUBTITLE_MAX, 'הצעה של חבר'),
    metaTag: clampText(cardInput.metaTag, BLUEPRINT_LIMITS.CARD_META_MAX, 'מותאם אישית'),
    description: clampText(
      cardInput.description,
      BLUEPRINT_LIMITS.CARD_DESC_MAX,
      `רעיון שהוצע על ידי ${clampText(creatorName, BLUEPRINT_LIMITS.NAME_MAX, 'חבר')}`
    ),
    createdBy: uid,
    createdByName: clampText(creatorName, BLUEPRINT_LIMITS.NAME_MAX, 'משתתף'),
  };

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (bundle) {
      bundle.customCards.push({ ...card, createdAt: Date.now() });
      writeDemoBundle(safeRoomId, bundle);
    }
    return card;
  }

  const path = `rooms/${safeRoomId}/cards/${cardId}`;
  try {
    await setDoc(doc(db, 'rooms', safeRoomId, 'cards', cardId), {
      ...card,
      createdAt: serverTimestamp(),
    });
    return card;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function recordUserSwipe(
  roomId: string,
  uid: string,
  choices: Record<string, SwipeScore>,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const entries = Object.entries(choices).slice(0, BLUEPRINT_LIMITS.SWIPE_CHOICES_MAX);
  const clampedChoices = Object.fromEntries(entries) as Record<string, SwipeScore>;

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    const idx = bundle.swipes.findIndex((s) => s.uid === uid);
    const record: SwipeRecordDoc = {
      uid,
      roomId: safeRoomId,
      choices: clampedChoices,
      updatedAt: Date.now(),
    };
    if (idx >= 0) {
      bundle.swipes[idx] = record;
    } else {
      bundle.swipes.push(record);
    }
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/swipes/${uid}`;
  try {
    const ref = doc(db, 'rooms', safeRoomId, 'swipes', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        choices: clampedChoices,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        roomId: safeRoomId,
        choices: clampedChoices,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function addRoomChecklistItem(
  roomId: string,
  uid: string,
  label: string,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const itemId = generateItemId('item');
  const item: ChecklistItemDoc = {
    id: itemId,
    roomId: safeRoomId,
    label: clampText(label, BLUEPRINT_LIMITS.CHECKLIST_LABEL_MAX, 'פריט חדש'),
    claimedByUid: null,
    claimedByName: null,
    createdBy: uid,
  };

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    const now = Date.now();
    bundle.checklist.push({ ...item, createdAt: now, updatedAt: now });
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/checklist/${itemId}`;
  try {
    await setDoc(doc(db, 'rooms', safeRoomId, 'checklist', itemId), {
      ...item,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleRoomChecklistClaim(
  roomId: string,
  itemId: string,
  uid: string,
  userName: string,
  isCreator: boolean,
  useDemoMode: boolean
): Promise<'claimed' | 'unclaimed' | 'locked_by_other'> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const safeItemId = sanitizeId(itemId, 'item');
  const safeName = clampText(userName, BLUEPRINT_LIMITS.NAME_MAX, 'משתתף');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return 'locked_by_other';
    const target = bundle.checklist.find((i) => i.id === safeItemId);
    if (!target) return 'locked_by_other';
    if (!target.claimedByUid) {
      target.claimedByUid = uid;
      target.claimedByName = safeName;
      target.updatedAt = Date.now();
      writeDemoBundle(safeRoomId, bundle);
      return 'claimed';
    }
    if (target.claimedByUid === uid || isCreator) {
      target.claimedByUid = null;
      target.claimedByName = null;
      target.updatedAt = Date.now();
      writeDemoBundle(safeRoomId, bundle);
      return 'unclaimed';
    }
    return 'locked_by_other';
  }

  const path = `rooms/${safeRoomId}/checklist/${safeItemId}`;
  try {
    const ref = doc(db, 'rooms', safeRoomId, 'checklist', safeItemId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return 'locked_by_other';
      const data = snap.data() as ChecklistItemDoc;
      if (!data.claimedByUid) {
        tx.update(ref, {
          claimedByUid: uid,
          claimedByName: safeName,
          updatedAt: serverTimestamp(),
        });
        return 'claimed';
      }
      if (data.claimedByUid === uid || isCreator) {
        tx.update(ref, {
          claimedByUid: null,
          claimedByName: null,
          updatedAt: serverTimestamp(),
        });
        return 'unclaimed';
      }
      return 'locked_by_other';
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function lockMeetupRoom(
  roomId: string,
  options: {
    selectedTimeSlotId?: string | null;
    selectedCardId?: string | null;
    isCreator: boolean;
  },
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');

  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle || !bundle.room) return;
    bundle.room.status = 'locked';
    if (options.isCreator) {
      bundle.room.selectedTimeSlotId = options.selectedTimeSlotId ?? null;
      bundle.room.selectedCardId = options.selectedCardId ?? null;
    }
    bundle.room.updatedAt = Date.now();
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}`;
  try {
    const ref = doc(db, 'rooms', safeRoomId);
    if (options.isCreator) {
      await updateDoc(ref, {
        status: 'locked',
        selectedTimeSlotId: options.selectedTimeSlotId ?? null,
        selectedCardId: options.selectedCardId ?? null,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        status: 'locked',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMeetupRoom(
  roomId: string,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  if (useDemoMode || !db || !isFirebaseConfigured) {
    removeDemoBundle(safeRoomId);
    return;
  }

  const path = `rooms/${safeRoomId}`;
  try {
    await deleteDoc(doc(db, 'rooms', safeRoomId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteRoomTimeOption(
  roomId: string,
  slotId: string,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const safeSlotId = sanitizeId(slotId, 'slot');
  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    bundle.timeOptions = bundle.timeOptions.filter((o) => o.id !== safeSlotId);
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/timeOptions/${safeSlotId}`;
  try {
    await deleteDoc(doc(db, 'rooms', safeRoomId, 'timeOptions', safeSlotId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteRoomCustomCard(
  roomId: string,
  cardId: string,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const safeCardId = sanitizeId(cardId, 'card');
  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    bundle.customCards = bundle.customCards.filter((c) => c.id !== safeCardId);
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/cards/${safeCardId}`;
  try {
    await deleteDoc(doc(db, 'rooms', safeRoomId, 'cards', safeCardId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteRoomChecklistItem(
  roomId: string,
  itemId: string,
  useDemoMode: boolean
): Promise<void> {
  const safeRoomId = sanitizeId(roomId, 'room');
  const safeItemId = sanitizeId(itemId, 'item');
  if (useDemoMode || !db || !isFirebaseConfigured) {
    const bundle = readDemoBundle(safeRoomId);
    if (!bundle) return;
    bundle.checklist = bundle.checklist.filter((i) => i.id !== safeItemId);
    writeDemoBundle(safeRoomId, bundle);
    return;
  }

  const path = `rooms/${safeRoomId}/checklist/${safeItemId}`;
  try {
    await deleteDoc(doc(db, 'rooms', safeRoomId, 'checklist', safeItemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

