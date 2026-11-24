/**
 * Security Rules Verification Specification Runner
 * Documents and validates the 12 adversarial payloads against firestore.rules.
 */

export interface DirtyDozenCase {
  id: string;
  name: string;
  operation: 'create' | 'update' | 'delete' | 'list' | 'get';
  path: string;
  expected: 'PERMISSION_DENIED';
  description: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    name: 'Creator Spoofing on Room Create',
    operation: 'create',
    path: '/rooms/room123',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects room creation when incoming.creatorId !== request.auth.uid',
  },
  {
    id: 'DD-02',
    name: 'Creator Hijack on Room Update',
    operation: 'update',
    path: '/rooms/room123',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects update modifying immutable creatorId field',
  },
  {
    id: 'DD-03',
    name: 'Shadow Ghost Field Injection',
    operation: 'create',
    path: '/users/attacker_uid',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects extra undocumented fields via keys().hasOnly()',
  },
  {
    id: 'DD-04',
    name: 'Locked Room Mutation',
    operation: 'create',
    path: '/rooms/room123/swipes/user1',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects writes to subcollections when parent room status is locked',
  },
  {
    id: 'DD-05',
    name: 'Private Profile & Settings Snooping',
    operation: 'get',
    path: '/users/victim_uid',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects read/list of private /users/{uid} and /friends by non-owner',
  },
  {
    id: 'DD-06',
    name: 'Public Profile Scraping',
    operation: 'list',
    path: '/publicProfiles',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects listing /publicProfiles unless filtered to own uid',
  },
  {
    id: 'DD-07',
    name: 'Checklist Claim Stealing',
    operation: 'update',
    path: '/rooms/room123/checklist/item1',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects claiming an item when existing.claimedByUid != null',
  },
  {
    id: 'DD-08',
    name: 'Friend Request Impersonation & Self-Accept',
    operation: 'create',
    path: '/friendRequests/victim_target',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects friendRequests where fromUid != request.auth.uid or sender attempts to accept',
  },
  {
    id: 'DD-09',
    name: 'Resource Poisoning via Oversized ID',
    operation: 'create',
    path: '/rooms/' + 'a'.repeat(200),
    expected: 'PERMISSION_DENIED',
    description: 'Rejects document IDs exceeding 128 chars or failing regex',
  },
  {
    id: 'DD-10',
    name: 'Payload Size Exhaustion',
    operation: 'create',
    path: '/groups/group123',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects memberUids > 30, slotIds > 30, or oversized strings',
  },
  {
    id: 'DD-11',
    name: 'Timestamp Forgery',
    operation: 'create',
    path: '/users/user1',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects createdAt/updatedAt not equal to request.time',
  },
  {
    id: 'DD-12',
    name: 'Unauthorized Group Access & Role Escalation',
    operation: 'create',
    path: '/groups/group123/members/attacker_uid',
    expected: 'PERMISSION_DENIED',
    description: 'Rejects self-assigning admin role or listing groups user does not belong to',
  },
];
