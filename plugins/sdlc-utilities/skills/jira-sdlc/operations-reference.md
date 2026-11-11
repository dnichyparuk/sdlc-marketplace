# Jira Operations Reference

Per-operation execution procedures for the `jira-sdlc` skill. This file is loaded
conditionally after Step 2 classifies the operation type.

> **Universal rules — apply to EVERY MCP call:**
> - **Comments:** convert markdown to ADF via `scripts/lib/markdown-to-adf.js`, then pass `contentFormat: "adf"` with the ADF JSON body
> - **Descriptions/create:** pass `contentFormat: "markdown"` (no conversion needed)
> - Always pass `responseContentFormat: "markdown"` on calls that return content
> - Always use `cloudId` from cache — never call `getAccessibleAtlassianResources` again
> - Never guess field IDs, transition IDs, or user accountIds
> - Never fabricate field values — use only `allowedValues` from `fieldSchemas`
>
> **Write-op canonical procedure:** every write operation below — Create, Edit, Transition, Comment, Worklog, Link, Assign, Bulk — follows the eight-step procedure in `./write-ops.md`. Read operations (Search, View, GetTransitions) are exempt.

---

## Create Operation

```
1. Gather inputs — determine issue type from user request
   - Map user language ("bug", "feature", "task") to exact type name from cache.issueTypes
   - If ambiguous, ask: "Should I create a Bug, Task, or Story?"
   - Read cache.fieldSchemas[issueTypeName]; for each required field not provided
     by the user, ask before proceeding

2. Resolve description template (R18 — required for Create)
   a. Check .sdlc/jira-templates/<issueTypeName>.md — if exists, read it (override)
   b. Else, use the shipped templates/<issueTypeName>.md (the prepare output's `templates` block names the resolved file)
   c. If found: fill all {placeholder} markers from user context (see step 3)
   d. If neither exists: AskUserQuestion with the closed list of available templates —
      free-form descriptions are prohibited

3. Detect placeholders — run `jira.js --check-payload` (write-ops.md Step 2.5); resolve every `low`-confidence marker via AskUserQuestion (R19)
   - NEVER leave raw {placeholder} or [bracketed prose] in the final description

4. Build the proposed payload using values from cache and user input
   - issueTypeName: exact string from cache.issueTypes (e.g., "Task" NOT "task")
   - priority: { name: "..." } from cache fieldSchemas.priority.allowedValues
   - labels: flat string array
   - components: array of { name: "..." } objects
   - custom fields: use fieldId key (e.g., customfield_10016) with correct type shape
   - For Sub-task: include parent: "PROJ-123" as top-level parameter

5-6. Critique and approval — canonical steps 5–6 in `write-ops.md`.

7. Dispatch — call mcp__atlassian__createJiraIssue with contentFormat: "markdown"
   - On 400 error: check fieldSchemas for the issue type; verify field shapes from
     REFERENCE.md Section 2

8. Post-op cache update — record any newly resolved user mappings or workflow data
```

## Edit Operation

```
1. Gather inputs — parse: which issue key, which field(s), what new value(s)

2. Resolve description template (R18) — ONLY when description is being touched
   - Look up the issue's issueTypeName via cache or getJiraIssue
   - Resolve override `.sdlc/jira-templates/<Type>.md` then shipped `templates/<Type>.md`
   - If editing description without a template match, AskUserQuestion with a closed list

3. Detect placeholders — run `jira.js --check-payload` (write-ops.md Step 2.5); resolve every `low`-confidence marker via AskUserQuestion (R19)

4. Build fields object (flat — NOT nested under fields.fields)
   - Priority → { name: "..." }
   - Labels → flat string array (REPLACES existing labels entirely)
   - Components → array of { name: "..." } objects
   - Custom select → { value: "..." }
   - Assignee → { accountId: "..." } from cache.userMappings

5-6. Critique and approval — canonical steps 5–6 in `write-ops.md`.

7. Dispatch — call mcp__atlassian__editJiraIssue with responseContentFormat: "markdown"
   - On 400: check field key spelling (customfield_XXXXX), field type, and value shape

8. Post-op cache update — record any newly resolved user mappings
```

## Search Operation

```
1. Build JQL from user intent using REFERENCE.md Section 3 patterns:
   - Always scope with "project = <KEY>" unless user explicitly wants cross-project
   - Apply escaping rules for values with spaces or special characters

2. Choose field list based on what info user needs:
   - Summary view: ["summary", "status", "assignee", "priority", "issuetype"]
   - Detailed view: ["summary", "status", "assignee", "priority", "created", "updated", "description"]

3. Call mcp__atlassian__searchJiraIssuesUsingJql:
   - maxResults: 25 for summary, 10 for detailed
   - responseContentFormat: "markdown"

4. Format results as a readable table
5. If total > maxResults: inform user, offer to paginate with startAt
```

## Transition Operation

```
1. Gather inputs — determine target status from user ("move to Done", "start",
   "mark in review"); get current status (context or getJiraIssue)

   (Steps 2–3 of the canonical procedure are skipped — transitions have no description
   field and no string fields where placeholder markers can hide.)

4. Build payload — look up workflow in cache:
   - transitions = cache.workflows[issueTypeName].transitions[currentStatus]
   - Find transition matching target status; if none, inform user of available
     transitions and ask which to use
   - Include requiredFields when non-empty
     (e.g., { resolution: { name: "Done" } })
   - Final shape: { cloudId, issueKey, transition: { id }, fields? }

5-6. Critique and approval — canonical steps 5–6 in `write-ops.md`; in the critique, verify the target status is reachable in the cached workflow graph.

7. Dispatch — call mcp__atlassian__transitionJiraIssue
   - On 400 with requiredFields: verify all required fields were included with correct shapes
   - On "transition not found": getTransitionsForJiraIssue for fresh list (auto-refresh path)

8. Post-op cache update — record fresh transitions if cache was stale
```

## Comment Operation

```
1. Gather inputs — compose comment in markdown (REFERENCE.md Section 4 safe syntax only)

   (Step 2 — template resolution — is skipped; comments have no template.)

3. Detect placeholders — run `jira.js --check-payload` (write-ops.md Step 2.5); resolve every `low`-confidence marker via AskUserQuestion (R19)

4. Build payload — convert markdown to ADF and assemble:
   cat <<'COMMENT_MD' | node "<PLUGIN_ROOT>/scripts/lib/markdown-to-adf.js"
   <markdown text>
   COMMENT_MD
   Final shape: { cloudId, issueIdOrKey, commentBody: <ADF JSON>, contentFormat: "adf",
                 responseContentFormat: "markdown" }
   Never use HTML tags, task lists (- [ ]), or footnotes in source markdown.

5-6. Critique and approval — canonical steps 5–6 in `write-ops.md`.

7. Dispatch — call mcp__atlassian__addCommentToJiraIssue

8. Post-op cache update — none typically required for comments
```

## Link Operation

```
1. Gather inputs — determine link direction from user intent:
   - "PROJ-A blocks PROJ-B" → outwardIssue = PROJ-A, inwardIssue = PROJ-B
   - "PROJ-A is blocked by PROJ-B" → outwardIssue = PROJ-B, inwardIssue = PROJ-A
   - "PROJ-A relates to PROJ-B" → either direction (symmetric)
   - Cross-reference cache.linkTypes for exact inward/outward label semantics

   (Steps 2–3 of the canonical procedure are skipped — link payloads carry no
   description and no free-text fields where placeholders can hide.)

4. Build payload — find link type in cache.linkTypes by name; assemble:
   { cloudId, linkType: { name: "Blocks" },
     inwardIssue: { key: "PROJ-123" }, outwardIssue: { key: "PROJ-456" } }

5-6. Critique and approval — canonical steps 5–6 in `write-ops.md`.

7. Dispatch — call mcp__atlassian__createIssueLink

8. Post-op cache update — none typically required for links
```

## Assign Operation

```
1. If user mentions a name/email already in cache.userMappings:
   - Use cached accountId directly

2. If user mentions someone not in cache:
   - Call mcp__atlassian__lookupJiraAccountId({ cloudId, query: "<name or email>" })
   - If multiple results: show all and ask user to confirm which one
   - Once confirmed: save to cache via:
     echo '{"<displayName>":"<accountId>"}' | node "<PLUGIN_ROOT>/scripts/skill/jira.js" --project '<PROJECT_KEY>' --save-field userMappings

3. Critique and approval — canonical steps 5–6 in `write-ops.md` (payload: `{ issueKey, assignee: { accountId } }`).

4. Call mcp__atlassian__editJiraIssue({
     cloudId, issueKey,
     fields: { assignee: { accountId: "<confirmed accountId>" } },
     responseContentFormat: "markdown"
   })
```

## Worklog Operation

```
1. Gather inputs — parse time from user ("2 hours 30 minutes" → "2h 30m",
   "half a day" → "4h"); collect optional work description

   (Steps 2–3 of the canonical procedure are skipped — worklog has no template
   and the optional comment is plain text without templated placeholders. The
   `jira.js --check-payload` still runs over the comment field in Step 2.5.)

4. Build payload:
   { cloudId, issueKey, timeSpent: "<Jira duration string>",
     comment: "<optional description>", adjustEstimate: "auto" }

5-6. Critique and approval — canonical steps 5–6 in `write-ops.md`.

7. Dispatch — call mcp__atlassian__addWorklogToJiraIssue

8. Post-op cache update — none typically required for worklogs
```

## View Operation

```
1. Determine what detail level the user needs:
   - Quick summary: fields: ["summary", "status", "assignee", "priority", "issuetype", "labels"]
   - Full details: all fields including description, custom fields
2. Call mcp__atlassian__getJiraIssue({
     cloudId, issueKey, fields: [...], responseContentFormat: "markdown"
   })
3. Render response clearly; show description as formatted markdown
```

## Bulk Operation

```
1. Parse all items from user request into discrete operation specs
2. Identify dependencies (e.g., Epic must exist before Stories that link to it)
3. Critique every item, then approve once: print every final payload in one block and ask with `AskUserQuestion` (`approve` / `change <item>: <what>` / `cancel`); dispatch nothing before `approve` (R17 applies to every create or edit call in the batch).
4. Execute independent operations in parallel; dependent operations sequentially
5. Report progress after each batch: "Created 3 of 5 issues..."
6. On partial failure: complete remaining independent operations, then report all failures
```
