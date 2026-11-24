export type RoomCategory = 'food' | 'movie' | 'activity';
export type RoomMode = 'full' | 'quick';
export type RoomStatus = 'open' | 'locked';
export type SwipeScore = 0 | 1 | 2;
export type RoomTab = 'when' | 'swipe' | 'checklist';
export type AppSection = 'meetups' | 'friends' | 'groups' | 'profile';

export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  FRIEND_CODE_PATTERN: /^[A-Z0-9_-]+$/,
  ID_MAX: 128,
  ROOM_ID_MIN: 4,
  ROOM_ID_MAX: 64,
  NAME_MAX: 40,
  INITIALS_MAX: 4,
  TITLE_MAX: 80,
  TIME_LABEL_MAX: 60,
  DATE_ISO_MAX: 20,
  START_TIME_MAX: 10,
  CARD_SUBTITLE_MAX: 60,
  CARD_DESC_MAX: 200,
  CARD_META_MAX: 30,
  CHECKLIST_LABEL_MAX: 80,
  TIME_SLOTS_MAX: 30,
  SWIPE_CHOICES_MAX: 150,
  BIO_MAX: 160,
  CITY_MAX: 50,
  FRIEND_CODE_MIN: 4,
  FRIEND_CODE_MAX: 16,
  AVATAR_TONE_MAX: 40,
  NICKNAME_MAX: 40,
  GROUP_NAME_MAX: 60,
  GROUP_DESC_MAX: 160,
  GROUP_MEMBERS_MAX: 30,
} as const;

export interface RoomDoc {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  category: RoomCategory;
  mode: RoomMode;
  status: RoomStatus;
  durationMinutes: number;
  endsAt: number;
  selectedTimeSlotId?: string | null;
  selectedCardId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ParticipantDoc {
  uid: string;
  roomId: string;
  name: string;
  initials: string;
  avatarTone: string;
  isGoogleUser: boolean;
  joinedAt?: unknown;
  lastSeenAt?: unknown;
}

export interface TimeOptionDoc {
  id: string;
  roomId: string;
  label: string;
  dateIso: string;
  startTime: string;
  createdBy: string;
  createdAt?: unknown;
}

export interface TimeVoteDoc {
  uid: string;
  roomId: string;
  slotIds: string[];
  updatedAt?: unknown;
}

export interface DecisionCard {
  id: string;
  category: RoomCategory;
  title: string;
  subtitle: string;
  metaTag: string;
  description: string;
  isCustom?: boolean;
  createdBy?: string;
  createdByName?: string;
}

export interface CustomCardDoc {
  id: string;
  roomId: string;
  category: RoomCategory;
  title: string;
  subtitle: string;
  description: string;
  metaTag: string;
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
}

export interface SwipeRecordDoc {
  uid: string;
  roomId: string;
  choices: Record<string, SwipeScore>;
  updatedAt?: unknown;
}

export interface ChecklistItemDoc {
  id: string;
  roomId: string;
  label: string;
  claimedByUid?: string | null;
  claimedByName?: string | null;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RankedCardResult {
  card: DecisionCard;
  totalPoints: number;
  positiveVotes: number;
  superLikes: number;
  consensusPercent: number;
  voterNames: string[];
  isGroupMatch: boolean;
}

export interface TimeOptionSummary {
  option: TimeOptionDoc;
  voterIds: string[];
  voterNames: string[];
  voteCount: number;
  percentage: number;
}

export interface AuthUserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
  isAnonymous: boolean;
  isGoogleUser: boolean;
}

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  bio: string;
  city: string;
  friendCode: string;
  initials: string;
  avatarTone: string;
  defaultCategory: RoomCategory;
  defaultDurationMinutes: number;
  notifyMeetingStarting: boolean;
  notifyDecisionFinalized: boolean;
  notifyChecklistAdded: boolean;
  showCityOnPublicCard: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicProfileDoc {
  friendCode: string;
  uid: string;
  displayName: string;
  initials: string;
  avatarTone: string;
  bio: string;
  city: string;
  updatedAt?: unknown;
}

export interface FriendRequestDoc {
  id: string;
  fromUid: string;
  fromName: string;
  fromInitials: string;
  fromAvatarTone: string;
  fromFriendCode: string;
  toUid: string;
  toName: string;
  toFriendCode: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavedFriendDoc {
  ownerUid: string;
  friendUid: string;
  displayName: string;
  initials: string;
  avatarTone: string;
  friendCode: string;
  nickname: string;
  favorite: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FriendGroupDoc {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  description: string;
  defaultCategory: RoomCategory;
  memberUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupMemberDoc {
  uid: string;
  groupId: string;
  displayName: string;
  initials: string;
  avatarTone: string;
  role: 'admin' | 'member';
  joinedAt?: unknown;
}

export interface GroupWithMembers {
  group: FriendGroupDoc;
  members: GroupMemberDoc[];
}
