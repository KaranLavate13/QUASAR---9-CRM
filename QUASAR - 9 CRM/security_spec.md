# Vetra CRM Security Specification (Phase 0 — Payload-First TDD)

## 1. Data Invariants
1. **PII Isolation**: User email, phone, and private AI system instructions live strictly in `/users_private/{userId}`, accessible only by `request.auth.uid == userId` with `email_verified == true`. No `list` access is permitted on `users_private`.
2. **Verified Identity**: Every create/update/delete operation mandates `request.auth != null && request.auth.token.email_verified == true`.
3. **Immutable Ownership & Timestamps**: `ownerId` / `senderId` / `uid` must equal `request.auth.uid` on creation and can never be modified on update. `createdAt` must equal `request.time` on creation and remain immutable on update. `updatedAt` must equal `request.time`.
4. **Immutable Audit Trail**: `/audit_logs/{logId}` is strictly append-only (`allow update, delete: if false;`).
5. **Terminal State Locking**: Once a `Deal` reaches `closed_won` or `closed_lost`, or a `Task` reaches `completed`, non-admin users cannot alter its core fields (admins can reopen if needed).
6. **Private Message Isolation**: `/messages/{messageId}` can only be read/listed by `senderId`, `recipientId`, or when `recipientId == 'org'`. Messages are immutable once sent.
7. **Strict Key & Size Enforcement**: Every create enforces `hasAll` + `hasOnly`, every update enforces `affectedKeys().hasOnly(...)` wrapped by `isValid[Entity](incoming())`, and every string/list checks `.size()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Be Rejected)
1. **Unverified Email Write**: Authenticated user with `email_verified: false` creating a `Task`.
2. **PII Cross-Read**: User B attempting `get /users_private/userA`.
3. **Owner Spoofing**: User A creating a `Deal` with `ownerId: "userB"`.
4. **Shadow Field Injection**: User A creating a `Contact` with extra key `isAdmin: true`.
5. **Backdated Timestamp**: User A creating an `AuditLog` with client-forged `createdAt` != `request.time`.
6. **Audit Log Tampering**: User A attempting `update` or `delete` on their own `/audit_logs/{logId}`.
7. **ID Poisoning**: Creating a document with a 200-character ID or invalid characters `../admin`.
8. **String Exhaustion**: Creating a `TeamMessage` with a 50KB `text` string (> 2000 chars).
9. **DM Eavesdropping**: User C listing or reading a message with `senderId: "userA"` and `recipientId: "userB"`.
10. **Terminal Task Mutation**: Updating a `Task` whose `existing().status == 'completed'` back to `'working'`.
11. **Value Poisoning on Update**: Updating `FeedPost.likesCount` with a string `"999"` or jumping by +1000 instead of +1.
12. **AI Memory Cross-Access**: User B attempting to list or modify User A's `/ai_memory/{memoryId}`.
