# github-sdlc — Write pipeline

Write pipeline for the github-sdlc skill. Loaded only for write classes (`create`, `edit`,
`state`, `comment`, `link`, `assign`, `project`, `bulk`); `view` and `search` never need it.
`<PLUGIN_ROOT>`, `<SLUG>`, `GITHUB_CONTEXT_FILE` and `GITHUB_CACHE_FILE` are the values SKILL.md
Steps 1–2 produced. Every `<…>` value in a Bash call is a single-quoted literal.

## Call order

<!-- implements spec phase 5: R12–R17, R27, R34–R37, G3–G8, G10, C14, R7 -->

One Bash call per numbered shell step. The script's output decides every gate; never re-compute
`autoApprovable`, `autoBlockers`, `payloadHash` or `commands[]` (R28, R34, R36).

### 1. Resolve the template (R11, R12, G4)

Only for `create`, and for an `edit` that changes the body. Offer a closed list of the
`issueTemplates[]` entries of `GITHUB_CACHE_FILE` (by `name`, with `about`), plus `blank` only when
`templateConfig.blank_issues_enabled !== false`. Pick without asking only when the request clearly
matches one template; otherwise ask with AskUserQuestion (when `flags.auto === true`, a
`pendingQuestion` stop). The payload `template` is the chosen entry's `file` (for example
`bug.md`), or `blank`; an `edit` may use `existing` to keep the current structure (R12).

Build the body from the template's headings only: fill or remove each section, invent none
(R12). Removing a section needs the user's consent (R13). The template's front-matter `labels`,
`assignees`, `type` and title prefix are payload defaults and show in the approval view (R12).
Follow R15: an imperative title without a filler opening (`This issue`, `We need to`); an
`Acceptance Criteria` section holds `- [ ] …` items only; other sections keep the template's form.

### 2. Write the payload file (P16, C14)

Create a temp path with one plain Bash call:

```bash
mktemp
```

Read the empty file once with the Read tool, then write the payload JSON (see **Payload examples**)
to that path (`<PAYLOAD_PATH>`) with the Write tool. Title, body and comment text live only in this
file, never in a shell argument (C14). Every op names `repo: "<SLUG>"` (or the repository the
request names) and uses only the P16 keys of its class.

### 3. Check the payload (P11, R37, G7)

```bash
node "<PLUGIN_ROOT>/scripts/skill/github.js" --check-payload --input '<PAYLOAD_PATH>' --output-file
```

Run it as one plain Bash call and take `EXIT_CODE` from the tool result. Read the printed path
(per op under `ops[]` for a bulk). Exit 2: show stderr and run the SKILL.md R26 gate as a script
crash (operation `check-payload`). Exit 1 (E1): resolve each finding, rewrite the payload file with
the Write tool, and run this step again:

| Finding | Action |
|---|---|
| `unknownKeys`, `missingKeys`, `invalidNumbers`, `errors` | fix the payload to the P16 key set |
| `unknownOp` | out of scope (C3): stop |
| `stale[]` with `unknownLabels`, `unknownMilestone`, `unassignable`, `unknownType`, `unknownProjectValue` | step 4 |
| `placeholders[]` | step 5 |
| `templateMissing` | step 1 (G4) |
| `unknownHeadings[]` | rename to a template heading or remove (R12) |
| `missingRequired[]` | ask for the section content (R12) |
| `titleTooLong`, `fillerOpening`, `nonChecklistAcceptance[]` | fix in the critique, step 6 (R15) |
| `isPullRequest` | stop: "use /pr-sdlc" (R24, C4) |
| `noOpState` | tell the user the issue is already in that state; no write (R18) |
| `selfLink` | tell the user; drop that link end (R19) |
| `repoNotAllowed`, `notAllowedRefs[]` | stop: the target or a link end is outside `github.repos` (R2) |
| `unsupported[]` | show the matching `warnings[]` entry (upgrade `gh`, or the host lacks the feature) and stop; no error report (R29) |
| `bulkTooLarge` | split the batch (R23) |

On exit 0, keep `payloadHash`, `autoApprovable`, `autoBlockers[]`, `mentions[]`, `refs[]`,
`commands[]` and `live` for the next steps.

### 4. Refresh on miss (R6, R17)

When `stale[]` is non-empty, refresh those sections once with one plain Bash call, then run
step 3 again:

```bash
node "<PLUGIN_ROOT>/scripts/skill/github.js" --refresh --sections '<STALE_CSV>' --output-file --repo '<SLUG>'
```

`<STALE_CSV>` is `stale[]` joined with commas. A value still unknown after that refresh is never
guessed (G9): ask with AskUserQuestion — pick an existing value from `GITHUB_CACHE_FILE`, drop it,
or (labels only) create it through `createLabels`, which the approval view then shows and
`--apply` runs before the operation (R17). When `flags.auto === true`, a `pendingQuestion` stop.

### 5. Resolve placeholders (R13, G5, C8)

Classify each `placeholders[]` entry: `high` when its text comes from the user or the cache, `low`
when you inferred it. Ask the user about every `low` entry (one AskUserQuestion each; when
`flags.auto === true`, a `pendingQuestion` stop). No `low` placeholder is applied without an
answer (G5). Rewrite the payload file and run step 3 again.

### 6. Critique (R14, R15, R16, R18, G6)

Show this block before any approval view or auto-approved `--apply` (G6, G10):

```text
Initial: <the payload as first drafted, one line per field>
Critique: <each problem found, or "none">
Final: <the payload after the fixes>
```

Check template fit (R12), field correctness against `GITHUB_CACHE_FILE` (repo, labels, milestone,
assignees, type, parent, project fields), state validity (R18), mention and reference safety from
`mentions[]` and `refs[]` (R16), title–body consistency, and the R15 content shape. Apply no
critique change silently. When `Final` differs from `Initial`, rewrite the payload file and run
step 3 again, so `payloadHash` belongs to the final bytes.

### 7. Approval (R27, R34, R35, G3)

- `flags.auto === true` and `autoApprovable` is `true` → skip to step 9.
- `flags.auto === true` otherwise → stop with a `pendingQuestion` (prompt: the approval view
  text, options `approve`, `change <what>`, `cancel`) and name `autoBlockers[]` in the prompt (R35).
- Else print the approval view, then ask with AskUserQuestion: `approve` / `change <what>` /
  `cancel`.

Approval view (every field of the final payload, not a summary):

```text
Write to <SLUG> as @<auth.actingAccount of Step 1>
<the full payload: title, body, every field>
Mentions: <each mentions[] entry as @login, "(team)" for team: true; or "none">
Commands:
  gh <commands[0] joined with spaces>
  …
payloadHash: <payloadHash>
```

When the payload assigns `@copilot`, add: "Assigning @copilot starts the Copilot coding agent,
which opens a pull request." (R27). The gate applies the same way when another skill invokes
github-sdlc (R27).

### 8. Answer (G3)

- `change <what>` → back to step 1 (template change) or step 2 (any other change).
- `cancel` → step 10; no `--apply`.
- `approve` → step 9. No `--apply` runs without `approve` in the same turn, except an
  `autoApprovable: true` payload when `flags.auto === true` (G3).

### 9. Verify links, then apply (G8, R36, P12, P13)

When the payload holds a title, body, comment or `related` entry, create a temp path with one
plain `mktemp` call, Read the empty file once, and Write every title, body, comment and `related`
entry of the payload to it (`<BODY_PATH>`). Then run one plain Bash call:

```bash
node "<PLUGIN_ROOT>/scripts/skill/github.js" --validate-links --file '<BODY_PATH>' --output-file --repo '<SLUG>'
```

On exit 1: show the violation list verbatim, do not run `--apply`, do not edit links without the
user, and run the SKILL.md R26 gate with class `link-verification` (operation `validate-links`,
step `Step 5: WRITE`). Exit 2: R26 gate as a script crash. `SDLC_LINKS_OFFLINE=1` keeps the
structural checks and skips network checks (G8).

On exit 0, apply with the approved hash in one plain Bash call; add `--auto` when
`flags.auto === true` (R36):

```bash
node "<PLUGIN_ROOT>/scripts/skill/github.js" --apply --input '<PAYLOAD_PATH>' --expect-hash '<PAYLOAD_HASH>' --output-file
```

`<PAYLOAD_HASH>` is the `payloadHash` the approval view showed, or under auto-approval the hash of
the `--check-payload` run that gave `autoApprovable: true`. Read the printed path:

- Exit 0 → report each `applied[]` entry (`#<number>` and `url`). When `createLabels` ran, run the
  SKILL.md Step 6 refresh of `labels`.
- `hashMismatch: true` → the payload file changed after the check: back to step 3 and a new
  approval.
- `notAutoApprovable: true` → `pendingQuestion` with the approval options and `autoBlockers[]`.
- A `failed[]` or `unknown[]` entry → the SKILL.md **Failure handling** row of its
  `failure.class` (E4–E10). A bulk lists `applied`, `failed`, `unknown` and `notRun` (R23, E10).
  A `failed[]` entry with `partial` means earlier commands of the op ran (the new issue's `number`/`url`): never `--apply` that op again as a whole. A `retried` field means the script already sent the write again (C7). The `index` of every entry is 1-based (the position of the op in `ops`). A `failed[]` entry
  whose `failure` is `null` carries a `findings` object instead: the live re-check right before
  the write found a problem (G7); show those findings and go back to step 3.

### 10. Remove temp files (R7)

Remove each temp file of this run with its own plain Bash call, whatever the exit codes:

```bash
rm -f '<PAYLOAD_PATH>'
```

```bash
rm -f '<BODY_PATH>'
```

## Payload examples

<!-- implements P16, R17–R21, R23 -->

One example per R9 write class, P16 keys only. `number` is a positive integer; a link end is a
number in the target repository, or an `owner/repo#n` reference or issue URL in another one.
The script decides auto-approval (R34); the notes are a guide only.

`create` (keys: `op`, `repo`, `template`, `title`, `body`, `labels`, `milestone`, `assignees`,
`type`, `parent`, `projects`, `createLabels`):

```json
{ "op": "create", "repo": "acme/widgets", "template": "bug.md", "title": "Fix crash when saving an offline draft",
  "body": "## Summary\n\n- The editor crashes when a draft is saved offline.\n\n## Steps to Reproduce\n\n1. Go offline.\n2. Save a draft.\n\n## Expected Behaviour\n\n- The draft is queued.\n\n## Acceptance Criteria\n\n- [ ] Saving offline queues the draft.",
  "labels": ["bug"], "milestone": "v1.4", "assignees": ["alice"], "type": "Bug", "parent": 3,
  "projects": [{ "owner": "acme", "number": 2 }] }
```

`edit` (keys: `op`, `repo`, `number`, `template`, `title`, `body`, `addLabels`, `removeLabels`,
`milestone`, `type`, `createLabels`). A label-only edit with cached labels can be auto-approved:

```json
{ "op": "edit", "repo": "acme/widgets", "number": 12, "addLabels": ["needs-triage"], "removeLabels": ["bug"],
  "createLabels": [{ "name": "needs-triage", "color": "d93f0b", "description": "Waiting for triage" }] }
```

```json
{ "op": "edit", "repo": "acme/widgets", "number": 12, "template": "existing", "body": "## Notes\n\n- Reproduced on 1.4.2." }
```

`state` (keys: `op`, `repo`, `number`, `action`, `reason`, `duplicateOf`, `comment`). The comment
is posted as its own command before the close (R18):

```json
{ "op": "state", "repo": "acme/widgets", "number": 12, "action": "close", "reason": "not planned", "comment": "Out of scope for 1.x." }
```

```json
{ "op": "state", "repo": "acme/widgets", "number": 12, "action": "close", "reason": "duplicate", "duplicateOf": 4 }
```

```json
{ "op": "state", "repo": "acme/widgets", "number": 12, "action": "reopen" }
```

`comment` (keys: `op`, `repo`, `number`, `body`); the body is sent as written (R21):

```json
{ "op": "comment", "repo": "acme/widgets", "number": 12, "body": "Fixed in main; ships in 1.4.3." }
```

`link` (keys: `op`, `repo`, `number`, `addParent`, `removeParent`, `addSubIssues`,
`removeSubIssues`, `addBlockedBy`, `removeBlockedBy`, `addBlocking`, `removeBlocking`, `related`).
`related` becomes a `Related: <ref>` comment (R19):

```json
{ "op": "link", "repo": "acme/widgets", "number": 12, "addParent": 3, "addBlockedBy": [9],
  "related": ["acme/other#7"] }
```

`assign` (keys: `op`, `repo`, `number`, `addAssignees`, `removeAssignees`); `@me` and `@copilot`
are accepted (R17):

```json
{ "op": "assign", "repo": "acme/widgets", "number": 12, "addAssignees": ["@copilot"], "removeAssignees": ["alice"] }
```

`project` (keys: `op`, `repo`, `number`, `project`, `addItem`, `field`, `value`, `clear`); the
board must be in `github.projects` (R20):

```json
{ "op": "project", "repo": "acme/widgets", "number": 12, "project": { "owner": "acme", "number": 2 },
  "field": "Status", "value": "In Progress" }
```

```json
{ "op": "project", "repo": "acme/widgets", "number": 12, "project": { "owner": "acme", "number": 2 }, "addItem": true }
```

`bulk` (`ops` is the only key; at most `BULK_MAX` ops, applied in order, never auto-approved, R23):

```json
{ "ops": [
  { "op": "comment", "repo": "acme/widgets", "number": 12, "body": "Closing as fixed." },
  { "op": "state", "repo": "acme/widgets", "number": 12, "action": "close", "reason": "completed" }
] }
```
