# Phase 2 API contract: projects, milestones, proposals, invites

This file is the source of truth shared by the SQL (`supabase/migrations`) and the app (`features/projects`, `features/proposals`, `features/milestones`). The zod mirrors live in `shared/schemas/projects.ts`. All money values are integer paise (`bigint`). All dates are `date` (`YYYY-MM-DD`) in Asia/Kolkata.

## Enums

- `project_status`: `draft`, `open`, `awarded`, `in_progress`, `completed`, `cancelled`
  - `awarded` means a freelancer has been chosen, and the agreement (Phase 3) and funding (Phase 4) are pending.
  - The first milestone becoming `funded` moves the project to `in_progress` (Phase 4).
- `project_visibility`: `public`, `invite_only`
- `milestone_status`: `draft`, `funded`, `in_progress`, `submitted`, `revision_requested`, `approved`, `released`, `disputed`, `refunded`, `partially_released`, `abandoned`, `reassigned`
- `proposal_status`: `pending`, `accepted`, `rejected`, `withdrawn`
- `invite_status`: `pending`, `accepted`, `declined`, `revoked`, `expired`
- `project_member_role`: `client`, `freelancer`

## Milestone state machine (enforced in SQL)

```
draft → funded → in_progress → submitted → approved → released
                                  ↘ revision_requested → in_progress
                 (funded|in_progress|submitted) → disputed → (released | refunded | partially_released)
                 (funded|in_progress) → abandoned → (refunded | reassigned)
```

| from                           | to                                     | actor                | via (phase)                                                                        |
| ------------------------------ | -------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| draft                          | funded                                 | system               | payment webhook (4)                                                                |
| funded                         | in_progress                            | freelancer           | `rpc_start_milestone` (2)                                                          |
| in_progress                    | submitted                              | freelancer           | `rpc_submit_milestone` (2)                                                         |
| revision_requested             | in_progress                            | freelancer           | `rpc_start_milestone` (2)                                                          |
| submitted                      | revision_requested                     | client               | `rpc_request_revision` (2); fails once `revision_count >= projects.revision_limit` |
| submitted                      | approved                               | client or system     | `rpc_approve_milestone` (2), auto-approve cron (4)                                 |
| approved                       | released                               | system               | ledger release (4)                                                                 |
| funded, in_progress, submitted | disputed                               | client or freelancer | `rpc_raise_dispute` (7)                                                            |
| disputed                       | released, refunded, partially_released | system or admin      | dispute resolution (7)                                                             |
| funded, in_progress            | abandoned                              | client               | `rpc_mark_abandoned` (5)                                                           |
| abandoned                      | refunded, reassigned                   | system               | (5, 8)                                                                             |

- `milestone_transitions(from_status, to_status, actor_kind)` holds the allowed edges.
- A `BEFORE UPDATE OF status` trigger rejects:
  - any edge that is not in the table;
  - any update made without the transaction-local setting `app.via_rpc = 'on'`.
- Only the internal function `public._transition_milestone(p_milestone_id, p_to, p_actor_kind, p_actor_id, p_note)` sets that flag. It is not executable by `authenticated`.
- Every change is written to `milestone_status_history` and `audit_log`.
- `_transition_milestone` also increments `revision_count` on `revision_requested`, stamps `started_at` / `submitted_at` / `approved_at` / `released_at`, and moves an `awarded` project to `in_progress` when its first milestone becomes `funded`.
- Agreement immutability: a `BEFORE INSERT/UPDATE/DELETE` trigger rejects (`invalid_status`) any change to a milestone's `title`, `deliverable`, `acceptance_criteria`, `amount_paise`, `due_date` or `position`, and adding or removing milestones, once the project is past `open` or the milestone is past `draft`. Milestones are always created as `draft`.

## Milestone cap

```
cap_pct(n) = least(100, greatest(app_config.max_milestone_pct, ceil(app_config.milestone_cap_slack_pct / n)))
```

With defaults 30 and 120, the cap is 60% for 2 milestones, 40% for 3, and 30% for 4 or more. Each milestone must satisfy `amount * 100 <= total * cap_pct`, using integer maths. A project needs at least `min_milestones` (2) milestones. Due dates must be after the current date and must not decrease as the milestone order goes up.

## Tables (columns the app reads)

- **`projects`**
  - Parties and description: `id`, `client_id`, `freelancer_id` (null until awarded), `title`, `description`, `category`, `city`, `is_remote`.
  - Settings: `visibility`, `status`, `checkin_cadence_days`, `revision_limit`, `deposit_required` (Phase 6 sets it).
  - `total_paise`: maintained by trigger as the sum of the milestone amounts.
  - Lifecycle: `is_takeover` (Phase 8), `source_project_id` (Phase 8), `published_at`, `awarded_at`, `cancelled_at`, `created_at`, `updated_at`.
- **`project_skills`**: `project_id`, `skill_id`.
- **`project_members`**: `project_id`, `user_id`, `member_role`, `active`, `joined_at`, `left_at`. The client is added on create; the freelancer is added on award. This table is the basis for RLS.
- **`milestones`**:
  - Content: `id`, `project_id`, `position` (1..n, unique per project), `title`, `deliverable`, `acceptance_criteria`, `amount_paise`, `due_date`, `status`.
  - Progress: `revision_count`, `started_at`, `submitted_at`, `approved_at`, `released_at`, `created_at`, `updated_at`.
- **`milestone_status_history`**: `id`, `milestone_id`, `from_status`, `to_status`, `actor_id`, `actor_kind` (`client`, `freelancer`, `system`, `admin`), `note`, `created_at`.
- **`submissions`**: `id`, `milestone_id`, `submitted_by`, `note`, `links text[]`, `attachment_paths text[]` (in the `project-files` bucket), `created_at`.
- **`proposals`**:
  - `id`, `project_id`, `freelancer_id`, `cover_note`, `proposed_total_paise`, `timeline_days`, `status`, `created_at`, `updated_at`.
  - `milestone_edits jsonb`: either null or `[{title, amount_paise, due_date}]`.
  - At most one `pending` proposal per freelancer per project.
- **`project_invites`**:
  - `id`, `project_id`, `invited_by`, `freelancer_id` (null for a phone or link invite), `status`, `expires_at` (14 days), `created_at`.
  - `phone_e164`: only the inviting client and the matching invitee can see it.
  - `token`: unguessable, 32 bytes base64url, for links of the form `kaamsetu://invite/<token>`.

## Visibility (RLS)

- **Projects:**
  - Members can see their projects.
  - Any authenticated user can see projects with `status = 'open' and visibility = 'public'`.
  - Invitees with a live invite can see that project while it is `open`. A live invite is `pending` and not expired, or `accepted`. Accepted invites count so that the invitee can still read the project to write a proposal.
  - Drafts are visible to the client only.
- **Milestones:** visible under the same rules as their project. Once a project is `awarded` or later, only its members (and admins) can see the milestones.
- **Proposals:** visible to their author and to the project's client.
- **Invites:** visible to the inviter and to the invitee, where the invitee is matched by `freelancer_id = auth.uid()` or by a verified phone equal to `phone_e164`. Link-token invites are resolved only through an RPC.
- **Submissions and milestone history:** project members only.
- **Admins** (`is_admin()`) can read every row of these tables.
- **Writes:** no direct `INSERT`, `UPDATE` or `DELETE` from clients on any of these tables. Everything goes through the RPCs below.

## RPCs (all `security definer`, `search_path = ''`, validate `auth.uid()`)

| RPC                      | Args                                                                                                                                                                                          | Returns                                                                                    | Rules                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rpc_save_project_draft` | `p_project_id uuid` (null to create), `p_project jsonb`, `p_milestones jsonb`                                                                                                                 | `uuid`                                                                                     | Caller has the client role and owns the draft. Replaces all milestones atomically. Validates field bounds. The cap rule is not enforced yet, so drafts may be incomplete.                                                                                                                                                                                                                                 |
| `rpc_publish_project`    | `p_project_id`                                                                                                                                                                                | `void`                                                                                     | Draft only. Enforces the minimum count, the cap and the dates. Moves to `open` and sets `published_at`.                                                                                                                                                                                                                                                                                                   |
| `rpc_cancel_project`     | `p_project_id`, `p_reason text`                                                                                                                                                               | `void`                                                                                     | Client only, when status is `draft`, `open` or `awarded` and no milestone is beyond `draft`. Rejects pending proposals and revokes invites.                                                                                                                                                                                                                                                               |
| `rpc_submit_proposal`    | `p_project_id`, `p_cover_note`, `p_proposed_total_paise`, `p_timeline_days`, `p_milestone_edits jsonb`                                                                                        | `uuid`                                                                                     | Caller has the freelancer role and is not the client. The project is `open`, and is either public or the caller holds a pending or accepted invite. Edits, if given, must pass the same cap and date rules.                                                                                                                                                                                               |
| `rpc_withdraw_proposal`  | `p_proposal_id`                                                                                                                                                                               | `void`                                                                                     | Author only, while `pending`.                                                                                                                                                                                                                                                                                                                                                                             |
| `rpc_reject_proposal`    | `p_proposal_id`, `p_reason text`                                                                                                                                                              | `void`                                                                                     | Project client only, while `pending`.                                                                                                                                                                                                                                                                                                                                                                     |
| `rpc_accept_proposal`    | `p_proposal_id`, `p_apply_milestone_edits boolean`                                                                                                                                            | `void`                                                                                     | Project client only. Project is `open`, proposal is `pending`. If the flag is set, the milestones are replaced by the edits (with descriptions copied from the matching position or left empty), and the result must pass the rules. Sets `freelancer_id`, status `awarded` and `awarded_at`. Adds the freelancer to `project_members`, rejects the other pending proposals, and revokes pending invites. |
| `rpc_create_invite`      | `p_project_id`, `p_freelancer_id uuid`, `p_phone text` (one of these, or neither for a link)                                                                                                  | `table(invite_id uuid, token text)`                                                        | Project client only. Status is `draft` or `open`. The token is returned only here.                                                                                                                                                                                                                                                                                                                        |
| `rpc_resolve_invite`     | `p_token text`                                                                                                                                                                                | `table(invite_id, project_id, project_title, client_name, status)`                         | Any authenticated user. Read-only.                                                                                                                                                                                                                                                                                                                                                                        |
| `rpc_respond_invite`     | `p_invite_id uuid` or `p_token text`, `p_accept boolean`                                                                                                                                      | `uuid` (project_id)                                                                        | The invitee. A link token binds `freelancer_id` to the caller on first accept.                                                                                                                                                                                                                                                                                                                            |
| `rpc_revoke_invite`      | `p_invite_id`                                                                                                                                                                                 | `void`                                                                                     | Inviter only.                                                                                                                                                                                                                                                                                                                                                                                             |
| `rpc_start_milestone`    | `p_milestone_id`                                                                                                                                                                              | `void`                                                                                     | Assigned freelancer. `funded` or `revision_requested` → `in_progress`.                                                                                                                                                                                                                                                                                                                                    |
| `rpc_submit_milestone`   | `p_milestone_id`, `p_note text`, `p_links text[]`, `p_attachment_paths text[]`                                                                                                                | `uuid` (submission)                                                                        | Assigned freelancer. `in_progress` → `submitted`. Paths must be under `<project_id>/` in `project-files`.                                                                                                                                                                                                                                                                                                 |
| `rpc_request_revision`   | `p_milestone_id`, `p_note text`                                                                                                                                                               | `void`                                                                                     | Project client. `submitted` → `revision_requested`, `revision_count + 1`. Raises once the limit is reached.                                                                                                                                                                                                                                                                                               |
| `rpc_approve_milestone`  | `p_milestone_id`                                                                                                                                                                              | `void`                                                                                     | Project client. `submitted` → `approved`. Release happens in Phase 4.                                                                                                                                                                                                                                                                                                                                     |
| `rpc_search_projects`    | `p_query text`, `p_skill_ids uuid[]`, `p_category text`, `p_city text`, `p_min_paise bigint`, `p_max_paise bigint`, `p_takeover_only boolean`, `p_limit int` (max 50), `p_cursor timestamptz` | `setof` rows: project fields, `client_name`, `client_city`, `milestone_count`, `skill_ids` | Returns open public projects plus projects the caller is invited to. Keyset pagination on `published_at desc`.                                                                                                                                                                                                                                                                                            |
| `rpc_search_freelancers` | `p_query`, `p_skill_ids`, `p_city`, `p_limit`, `p_cursor`                                                                                                                                     | `setof` rows: public profile fields, `skill_ids`                                           | Returns users with the freelancer role who are onboarded and not flagged.                                                                                                                                                                                                                                                                                                                                 |

### RPC notes

- **Optional args:** all `rpc_save_project_draft` args default to null, so the generated TS types mark them optional. Omit `p_project_id` to create.
- **Re-invites:** inviting the same freelancer or phone again revokes the earlier pending invite. A project can have at most 50 pending invites.
- **Resolving and answering invites:**
  - `rpc_resolve_invite` reports a pending invite whose `expires_at` has passed as `expired`. A pg_cron job also flips such invites to `expired` every 15 minutes.
  - `rpc_respond_invite` matches profile invites by `freelancer_id` and phone invites by the caller's verified phone. A link invite can only be answered with `p_token`. Accepting needs the freelancer role.
- **Submissions:** `rpc_submit_milestone` needs at least one of a note, a link or an attachment.
  - Links: at most 10, `https` only.
  - Attachments: at most 10, each an existing `project-files` object at `<project_id>/<milestone_id>/<file>`.
- **Revision note:** the `rpc_request_revision` note is optional (at most 2000 characters) and is stored in the milestone history.
- **Search pagination:**
  - `rpc_search_projects`: pass the last row's `published_at` as `p_cursor`. `published_at` is set with `clock_timestamp()`.
  - `rpc_search_freelancers`: rows are ordered by `onboarding_completed_at desc`, so pass the last row's `onboarding_completed_at` as `p_cursor`.
  - The text query is a case-insensitive substring match. `%` and `_` are matched literally.
- **Read-only RPCs:** `rpc_resolve_invite` and the two search RPCs do not write audit rows. Every RPC that changes state does.

## Storage

- Bucket `project-files` (private): object path `<project_id>/<milestone_id>/<file>`.
- Members of the project can read. The assigned freelancer and the client can insert. Nobody can update or delete.
- Every path segment matches `[A-Za-z0-9._-]` and contains no `..`.

## Errors

RPCs raise `errcode 'P0001'` with stable message keys the app maps to copy:

- `project_not_found`, `not_project_client`, `not_assigned_freelancer`
- `invalid_status`, `milestone_cap_exceeded`, `too_few_milestones`, `milestone_dates_invalid`
- `revision_limit_reached`, `already_proposed`, `cannot_propose_own_project`, `invite_invalid`, `role_required`

- `invalid_input`: a field is missing, out of bounds or malformed. `detail` names the field.
- `proposal_not_found`, `milestone_not_found`: the row does not exist, or the caller is not allowed to act on it (author or member). This avoids leaking that the row exists.

All of the keys above use `P0001`.

Permission failures use `42501`:

- `not_authenticated`: the caller has no `auth.uid()`.
- `milestone_status_locked`: the trigger blocked a status write that did not go through `_transition_milestone`.
- Direct table writes and RLS denials.
