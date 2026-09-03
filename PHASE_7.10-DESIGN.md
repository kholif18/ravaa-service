# PHASE 7.10-DESIGN — UNIFIED PERMISSIONS DISCOVERY & ARCHITECTURE AUDIT

**STATUS: PASS**

**Date:** 2026-09-03
**Prerequisite:** 7.9D PASS (no DB schema change, no migration)

---

## 1. Current Architecture

```
                 RAVAA ECOSYSTEM (actual, Sep 2026)
                            │
               ┌────────────┴────────────┐
               │                         │
        Ravaa Service              Ravaa Drive + Account
     (Hono + Postgres)           (Next.js + SQLite / React)
               │                         │
        ┌──────┴──────┐            ┌─────┴─────┐
        │             │            │           │
    Identity      Authorization   Owner    Share
    (User,        (Permission,    File/    (polymorphic
     Session)      ResourcePerm,   Folder   shareableType/
                   App/Scope)     ownerId  shareableId)
```

- **Ravaa Service** = Central Identity + Session Authority (7.9C S2S introspection). Authorization *exists* but *not consumed* by Drive.
- **Ravaa Drive** = Application + Resource Authority (ownerId = Drive CUID, Share, local role admin). No central permission read.
- **Ravaa Account** = Admin UI for Service (Applications, Permissions, Sessions) — not an enforcement point.

---

## 2. Ravaa Service Authorization Audit

**Models (prisma/schema.prisma):**

| Model | Purpose | Identifier | Scope | Owner | Consumer |
|-------|---------|------------|-------|-------|----------|
| **Permission** | Catalogue entry `resource:action` | `resource+action` unique | Global catalogue | Service | `authorize()` lookup |
| **ResourcePermission** | Grant/deny for a principal on a resource | `resourceType,resourceId,principalType,principalId,permissionId` unique | Per-resource or global (no resource) | Service | `authorize()`, `checkGlobal/ResourcePermission` |
| **PrincipalType** | Enum `USER / APPLICATION / SYSTEM` | `principalId` UUID | — | — | `principalType` in `AuthorizationCheck` |
| **Application** | OAuth client | `clientId` unique, `clientSecretHash` SHA256 | — | Service | Drive S2S (`verifyClientCredentials`) |
| **ApplicationScope** | Capability string `<resource>:<action>` e.g. `drive:read`, `session:introspect` | `applicationId+scope` unique | Per-application | Service | `checkApplicationScope` |
| **UserApplicationAccess** | User ↔ Application grant with scopes[] | `userId+applicationId` unique | Per-user-per-app | Service | `checkUserApplicationAccess` |
| **AuditLog** | `action`, `applicationId`, `metadata` | — | — | Service | `logAuthorizationDenial` |

**Service (`src/lib/authorization.ts`):**

- `authorize({principalType, principalId, permission:"resource:action", resource?:{type,id}})` → `allowed:boolean, reason`
  1. split `resource:action` → lookup `Permission` → if not found `PERMISSION_NOT_FOUND`
  2. if `!resource` → `checkGlobalPermission` (allow only, revokedAt null, expiresAt null/future)
  3. else `checkResourcePermission` (deny first, then allow, same filters)
- `grantResourcePermission()` / `revokeResourcePermission()` (soft revoke `revokedAt`)
- `checkApplicationScope()`, `checkUserApplicationAccess()`, `isApplicationActive()`, `isUserAdmin()` (role===ADMIN)

**API (`src/modules/permissions/`):**

- `POST /` (admin) create Permission `resource,action`
- `GET /` list, `GET /:id`, `DELETE /:id`
- `POST /grant`, `POST /revoke` (admin) — `resourceType,resourceId,principalType,principalId,permissionId,expiresAt`
- `GET /resource/:type/:id`, `GET /principal/:type/:id` (admin)

**Middleware:** `requireAdmin()` checks `user.role==="ADMIN"` via `authMiddleware` JWT. No permission middleware in use outside admin routes. `authorization.ts` **not called** by Drive/any resource route — only catalogue.

**Current Permission rows (seed):** `drive:read, drive:write, notes:read, notes:write` plus `session:introspect` (7.9C-1). All admin-scoped.

---

## 3. Drive Authorization Audit

**A. Authentication:** `lib/auth.ts:getServerAuth()` → `jwtVerify` Drive JWT (4h, HS256) + `prisma.user.findUnique(id)` + `isActive` + `authSource` handling (7.9C). After 7.9C, `getServerAuth()` delegates to `lib/auth-with-ravaa.ts` with S2S introspection for `authSource:ravaa`. `middleware.ts` does lightweight `jwtVerify` only, no fetch.

**B. Global / Application Authorization:** `user.role !== "admin"` → 401/403 on `/api/admin/*` (stats, users, settings, storage-locations, plugins) and `/api/admin/*` + `GET /api/wopi` maintenance check. No other global permission. Ravaa Service `UserApplicationAccess` not checked by Drive.

**C. Resource Ownership:** `File.ownerId === user.id`, `Folder.ownerId === user.id` checked in ~30 routes: `files/[fileId]/route.ts` (isOwner), `bulk-delete` (ownerId filter), `bulk-move` (ownerId match), `trash` (ownerId), `versions`, `content`, `download`, `raw`. Owner always wins. `File.ownerId`/`Folder.ownerId` = Drive CUID (never Ravaa UUID) — frozen.

**D. Resource Sharing:** Single `Share` model (polymorphic 7.7): `shareableType: "file"|"folder", shareableId, sharedById, sharedWithId?, shareToken?, permission:"view"|"edit", expiresAt?`. Checks: `prisma.share.findFirst({shareableType:"file", shareableId:fileId, sharedWithId:user.id})` or `shareableType:"folder"` + `isFileInsideFolder()`. Share grants `read` via token `?token=` bypass in `middleware.ts` (but route re-validates). No per-action share granularity beyond view/edit.

**E. Resource Permission:** No `ResourcePermission` table in Drive. "Permission" is `Share.permission` string. No `authorize()` call to Service. File operations (read/write/delete/share/star) checked via `isOwner || share permission` inline, not via `lib/authorization.ts`.

---

## 4. Share Audit

- **Who can share?** Owner only (`file.ownerId === user.id` or `folder.ownerId === user.id`) in `bulk-share` and `share` routes.
- **Who receives?** `sharedWithId` (specific user) or `null` → public `shareToken` link.
- **Permission levels:** `view` | `edit` (string, not FK to Service `Permission`).
- **Evaluation:** `owner → allow all` else `share where shareableType/shareableId + sharedWithId==user.id + not expired + permission >= required`. Folder share cascades via `isFileInsideFolder()`.
- **Owner:** always full access, bypass share.
- **Admin:** `role==="admin"` bypasses only admin routes, **not** file ownership — admin cannot read others' files unless shared (owner check still enforced).
- **Shared user:** gets `view` (download/raw/content) or `edit` (upload/content PUT, office WOPI).

---

## 5. Permission Inventory (actual code)

**Identity (Ravaa Service, implicit):**
- `account.read` (GET /api/v1/me)
- `account.update` (PATCH /me)
- `session.read` (GET /sessions)
- `session.revoke` (DELETE /sessions)

**Application (Service):**
- `drive:read`, `drive:write`, `notes:read`, `notes:write` (ApplicationScope)
- `session:introspect` (internal, 7.9C-1)

**Resource (Service catalogue):**
- `drive:read`, `drive:write`, `notes:read`, `notes:write` (Permission rows — catalogue only, not enforced on Drive files)

**Resource (Drive actual, inline):**
- `file.read` (download/raw/content via owner/share)
- `file.write` (upload PUT, content POST, rename, bulk-move)
- `file.delete` (bulk-delete soft, trash delete hard)
- `file.share` (bulk-share, share route — owner only)
- `file.star` (PATCH isStarred — owner only)
- `folder.read/write/delete/create/share` (similar)

**Admin:**
- `users.manage` (admin users CRUD)
- `applications.manage` (`requireAdmin` on /applications)
- `permissions.manage` (`requireAdmin` on /permissions)

---

## 6. Authority Matrix

| Decision | Authority (actual) | Recommended (target) |
|----------|-------------------|---------------------|
| Identity | Ravaa Service | **Ravaa Service** |
| Session | Ravaa Service | **Ravaa Service** |
| Application access | Ravaa Service (`UserApplicationAccess`) — not enforced by Drive | **Ravaa Service** |
| Global permission | Ravaa Service (`ResourcePermission` without resource) — not enforced | **Ravaa Service** |
| Role | Drive (`User.role`) + Service (`User.role`) — divergent | **Drive** (app-local), Service `ADMIN` for admin UI only |
| Ownership | Drive | **Drive** (frozen) |
| Share | Drive | **Drive** (frozen) |
| Resource permission | Drive (Share.permission inline) | **Drive** (primary), Service as optional central audit |
| Admin permission | Drive (`role==="admin"`) + Service (`requireAdmin`) — separate | **Drive** for Drive resources, **Service** for Service catalogue |

---

## 7. Identity Mapping

```
Ravaa User UUID (Service User.id)
      │
      │ 7.4 mapping
      ▼
DriveUser.ravaaUserId (nullable unique, SQLite)
      │
      ▼
DriveUser.id (CUID)
      │
      ├── File.ownerId (CUID)
      └── Folder.ownerId (CUID)
```

- Never `File.ownerId = Ravaa UUID`
- Never replace Drive CUID
- Central ownership remains Drive (7.6)

---

## 8. Admin Semantics

- **Drive:** `user.role==="admin"` string in `lib/auth.ts` JWT, checked inline `if (!user || user.role!=="admin") 401` on `/api/admin/*`. Admin does **not** bypass file ownership.
- **Service:** `user.role===ADMIN` enum, `requireAdmin()` middleware on `/applications`, `/permissions`, `/admin/users`. Admin bypass concept exists in `authorization.ts` only as `ADMIN_BYPASS` reason constant, but not used in `authorize()` flow — admin still needs explicit `ResourcePermission` unless route uses `requireAdmin`.
- **Conflict:** No sync between Service `ADMIN` and Drive `admin`. A Service ADMIN is not automatically Drive admin, and vice versa. Separate DBs. Future unified admin should be via Service `User.role` as source of truth, Drive `role` as projection (read from `ravaaUserId` mapping), but currently manual.

---

## 9. Application Boundary

```
Ravaa User
    │
    ▼
UserApplicationAccess (userId, applicationId, scopes[], grantedAt, revokedAt)
    │
    ▼
Application (clientId, clientSecretHash, status)
    │
    ▼
ApplicationScope (applicationId, scope: "drive:read" etc)
```

- `ApplicationScope` is **authentication scope / capability**, not `Permission`. Example: `session:introspect` is a server capability, not a user grant. `drive:read` as scope means "app may request drive read" — but Drive does not check `UserApplicationAccess` before serving files.
- `UserApplicationAccess` is **user grant to app** (scopes[]). Not used by Drive — Drive checks `owner||share` only.
- `Application` boundary is currently **unused** for Drive resource access.

---

## 10. Problems / Gaps

1. **Service authorization not consumed:** `authorize()` exists but no Drive route calls it. Central permission is catalogue-only.
2. **Two admin roles diverge:** manual sync.
3. **Share is local string, not FK to Service Permission:** cannot centrally audit/revoke via Service.
4. **Application access not enforced:** any authenticated Drive user can access all Drive files (if owner/shared) regardless of `UserApplicationAccess`.
5. **No global permission enforcement:** `drive:read` as Permission row does nothing.
6. **Ownership frozen but not central:** acceptable per 7.6.
7. **Performance:** No permission cache; each Drive request does `prisma.user` + (if ravaa) S2S introspection 30s cache, but no `ResourcePermission` cache.

---

## 11. Target Architecture

```
              Ravaa Service (Central)
                   │
        ┌──────────┼──────────┐
        │          │          │
    Identity   Session   Authorization
   (User)    (S2S)    ┌─────┴─────┐
                      │           │
                 Application   Global
                  Access     Permission
                 (UAA)    (ResourcePerm no resource)
                      │
                      └─────┬──────┐
                            ▼      │
                       Ravaa Drive │
                            │      │
                     ┌──────┴──┐   │
                     ▼         ▼   ▼
                  Owner      Share  Resource
                  File/      (poly) Permission?
                  Folder             (future)
                            │      │
                            └──────┴─── File/Folder
```

- **Phase B (read):** Drive reads `UserApplicationAccess` and `ResourcePermission` from Service via S2S (like 7.9C introspection) for observability, not enforcement.
- **Phase C (dual):** Drive checks `owner||share` **and** Service `authorize()` (fail-closed for write/delete/share).
- **Phase D (central):** Service `ResourcePermission` becomes source for non-owner grants (share could be migrated to Service, but ownership stays Drive).

---

## 12. Migration Strategy (backward compatible, reversible, zero logout)

**Phase A — Existing (now):** Drive `owner||share` only. Service catalogue unused.

**Phase B — Central read (7.10):** Add `lib/ravaa-permissions.ts` S2S `GET /api/v1/permissions/principal/USER/<ravaaUserId>` with Basic + `permissions:read` scope, cache 60s. No enforcement, only logging. Zero risk.

**Phase C — Dual-read (7.10B):** Drive route does `if (!isOwner && !share) { check Service authorize() }` — if Service says `deny` → 403, if `allow` → allow. Fail-closed for write. Add feature flag `CENTRAL_PERMISSIONS_DUAL`.

**Phase D — Central authority (7.11):** Share creation also creates `ResourcePermission` in Service (`drive_file:read` etc). Reads prefer Service.

**Phase E — Deprecate local Share string** (future): Share table becomes view over Service `ResourcePermission`. Not in 7.10.

Rollback: disable dual flag, drop S2S call, back to local.

---

## 13. Failure Model

- **Ravaa Service unavailable:**
  - **Authentication (7.9C):** fail-open (local JWT valid → allow) — already decided.
  - **Authorization:** **fail-closed** for `write/delete/share/admin` (deny if cannot verify permission). For `read` (file download via share), could fail-open to local share check, but **write must fail-closed** to prevent privilege escalation during outage.
- **Cache hit:** use cached `allow/deny` (TTL 60s). `UNAVAILABLE` not cached (like 7.9B).

---

## 14. Performance

`API request → getServerAuthWithRavaa (30s introspection cache) → isOwner (1 query) → isShare (1 query) → (future) authorize() S2S (60s permission cache)`. Without cache, +1 S2S per request (50-150ms). With cache, 0 extra after first.

---

## 15. Cache Strategy

- **User permission cache:** `Map<principalId:permission, {allowed, expires}>` TTL 60s, in-memory per-process, invalidate on `grant`/`revoke`/`role change`/`user disable` via explicit `delete` + TTL expiry.
- **Application access cache:** `Map<userId:applicationId:scope, boolean>` TTL 60s.
- **Resource permission cache:** `Map<resourceType:resourceId:principalId:permissionId, boolean>` TTL 60s. Invalidate on `grantResourcePermission` / `revokeResourcePermission`.
- No Redis; ephemeral per-process acceptable for current scale (single instance home server). Documented limitation like 7.9B.

---

## 16. Security Analysis

- **Q1 authenticated → Drive access?** No, need `isOwner||share` (Drive local). Future also `UserApplicationAccess` check.
- **Q2 Application Access required?** Currently no, but should be yes for `drive:read` scope (future).
- **Q3 role source?** Drive `User.role` (local) for Drive resources; Service `ADMIN` for Service admin. Should converge: Drive role projected from Service via `ravaaUserId` sync.
- **Q4 admin?** Both have admin, divergent. Recommend Service as source, Drive as cache.
- **Q5 ownership?** Drive.
- **Q6 Share?** Drive.
- **Q7 resource permission?** Drive (today), Service (future central).
- **Q8 central can replace local?** Only for grants, not ownership. Share could be replaced, but file/folder owner stays Drive.
- **Q9 Ravaa unavailable?** Auth fail-open (7.9C), Authz fail-closed (write) — see §13.
- **Q10 revocation effective?** Via S2S cache TTL 60s + explicit invalidate on revoke.

---

## 17. Open Questions

1. Should Drive `role=admin` be derived from Service `ADMIN` via `ravaaUserId` sync or remain independent?
2. Should `ApplicationScope` `drive:read` be renamed to `permission drive:read` or kept as scope?
3. Should Service `ResourcePermission` `resourceType` be `drive_file` vs `file` — need convention.
4. Do we need `OWNER_BYPASS` in `authorize()` to respect Drive owner without Service entry?

---

## 18. Recommended Implementation Phases

- **7.10:** Read-only S2S permission fetch + logging (no enforcement) — low risk, validates S2S + cache.
- **7.10B:** Dual-read enforcement behind flag, fail-closed for write.
- **7.11:** Central grant/revoke via Service, Share dual-write.

---

## Tests / Build / DB

- **Tests:** Service 113/113 PASS, Drive typecheck PASS, Drive build PASS (verified Sep 3)
- **Typecheck:** Service PASS, Drive PASS
- **Build:** Service PASS, Drive PASS, Account PASS
- **Database:** NO SCHEMA CHANGE, NO MIGRATION, NO DATA CHANGE (discovery only)

---

## Files Changed / Created

- **Changed:** none (discovery only)
- **Created:** `ravaa-service/PHASE_7.10-DESIGN.md` (this file)

---

## Final

**PASS — Discovery complete, architecture documented, no behavior change. Awaiting approval to implement 7.10 read-only S2S.**

