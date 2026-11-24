# Security Specification: Group Meetup Decision Engine, Profiles, Friends & Groups

## 1. Data Invariants
1. A room (`rooms/{roomId}`) must always have an immutable `creatorId` matching the authenticated creator's UID (`request.auth.uid`) and an immutable `createdAt` server timestamp.
2. Only the room creator (`existing().creatorId == request.auth.uid`) may delete a room, lock/confirm selections early, or extend the voting window.
3. Once a room reaches terminal status `'locked'`, no further updates to room metadata, time options, votes, custom cards, swipes, or checklist claims are permitted.
4. Participants (`participants/{uid}`), time votes (`timeVotes/{uid}`), and swipe records (`swipes/{uid}`) are strictly user-scoped by document ID (`docId == request.auth.uid`), preventing any user from overwriting another user's votes or profile.
5. Checklist items (`checklist/{itemId}`) implement atomic claim locking: a user may only claim an unclaimed item (`existing().claimedByUid == null`), and only the claiming user or the room creator may release a claim.
6. Private user profiles & settings (`/users/{userId}`) and saved friends (`/users/{userId}/friends/{friendId}`) are strictly owner-scoped (`userId == request.auth.uid`); no other user can read or list them.
7. Public shareable cards (`/publicProfiles/{friendCode}`) contain zero PII (no email/phone) and allow `get` only by exact `friendCode`, preventing collection scraping (`list` restricted to own `uid`).
8. Friend requests (`/friendRequests/{requestId}`) are readable and mutable only by the sender (`fromUid`) or recipient (`toUid`), with `fromUid` immutable and `status` transitions strictly enforced.
9. Friend groups (`/groups/{groupId}`) enforce bounded `memberUids` (`1 <= size <= 30`), immutable `creatorId`, `list` restricted to `request.auth.uid in resource.data.memberUids`, and subcollection `/groups/{groupId}/members/{memberId}` gated by group membership via `get()`.
10. Every collection enforces strict key allowlists (`hasAll` + `hasOnly`), string length bounds, ID regex validation (`^[a-zA-Z0-9_-]+$`), server timestamps (`request.time`), and array/map size caps.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Creator Spoofing on Room Create**: Attempt to create `rooms/room123` with `creatorId: "victim_uid"` while signed in as `"attacker_uid"`. -> Expected: `PERMISSION_DENIED`.
2. **Creator Hijack on Room Update**: Attempt to update `rooms/room123` changing `creatorId` from `"owner_uid"` to `"attacker_uid"`. -> Expected: `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection**: Attempt to create `rooms/room123` or `users/u1` with an extra undocumented field `isVerified: true`. -> Expected: `PERMISSION_DENIED`.
4. **Locked Room Mutation**: Attempt to submit a swipe or claim a checklist item in a room whose `status` is `'locked'`. -> Expected: `PERMISSION_DENIED`.
5. **Private Profile & Settings Snooping**: Attempt `get` or `list` on `/users/victim_uid` or `/users/victim_uid/friends` as `"attacker_uid"`. -> Expected: `PERMISSION_DENIED`.
6. **Public Profile Scraping**: Attempt `list` on `/publicProfiles` without filtering `uid == request.auth.uid`. -> Expected: `PERMISSION_DENIED`.
7. **Checklist Claim Stealing**: Attempt to update `checklist/item1` where `existing().claimedByUid == "alice"` to `claimedByUid: "bob"` while signed in as `"bob"`. -> Expected: `PERMISSION_DENIED`.
8. **Friend Request Impersonation**: Attempt to create `/friendRequests/victim_target` with `fromUid: "victim"` while signed in as `"attacker"`, or attempt to accept an outgoing request as the sender. -> Expected: `PERMISSION_DENIED`.
9. **Resource Poisoning via Oversized ID**: Attempt to create a document with a 500-character ID or invalid path characters (`../evil`). -> Expected: `PERMISSION_DENIED`.
10. **Payload Size Exhaustion**: Attempt to create a `group` with > 30 `memberUids`, a `timeVotes` doc with 100 `slotIds`, or a bio > 160 chars. -> Expected: `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Attempt to create a room, profile, or group with a backdated client timestamp instead of `request.time`. -> Expected: `PERMISSION_DENIED`.
12. **Unauthorized Group Access & Role Escalation**: Attempt `list` on `/groups` or `update` on `/groups/g1` modifying `creatorId`/`name` as a non-creator, or self-creating a `GroupMember` with `role: "admin"`. -> Expected: `PERMISSION_DENIED`.
