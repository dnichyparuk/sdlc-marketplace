# Jira SDLC — Examples

Copy-paste MCP call examples for every operation. Values marked with `← cache.xxx`
come from the project cache at `~/.sdlc-cache/jira/<sanitizedSiteHost>/<PROJECT_KEY>.json` (legacy locations `.sdlc/jira-cache/` and `.claude/jira-cache/` migrate automatically on first use). Replace
`PROJ` with the actual project key and adjust IDs to match the cache.

Comment examples use `contentFormat: "adf"` with the body converted via `markdown-to-adf.js`.
All other write operations use `contentFormat: "markdown"`.
All read operations use `responseContentFormat: "markdown"`.

---

## 1. Cache Initialization

Full 6-phase sequence — run once, then use cache for all operations.

### Phase 1 — Identity (run both in parallel)

```
mcp__atlassian__getAccessibleAtlassianResources()
→ Keep raw as phase1.resources (--assemble maps it to cache.cloudId, cache.siteUrl)
   e.g. sites[0].id  = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        sites[0].url = "mycompany.atlassian.net"

mcp__atlassian__atlassianUserInfo()
→ Keep raw as phase1.userInfo (--assemble maps it to cache.currentUser)
   e.g. accountId    = "5b10a2844c20165700ede21g"
        displayName  = "Jane Smith"
        emailAddress = "jane@company.com"
```

### Phase 2 — Project metadata (run both in parallel, needs cloudId)

```
mcp__atlassian__getVisibleJiraProjects({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  searchString: "PROJ"
})
→ Keep raw as phase2.projects (--assemble maps it to cache.project)
   e.g. values[0].key  = "PROJ"
        values[0].name = "My Project"
        values[0].id   = "10000"

mcp__atlassian__getIssueLinkTypes({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
})
→ Keep raw as phase2.linkTypes (--assemble maps it to cache.linkTypes)
   e.g. issueLinkTypes = [
    { "name": "Blocks",  "inward": "is blocked by", "outward": "blocks"   },
    { "name": "Cloners", "inward": "is cloned by",  "outward": "clones"   },
    { "name": "Relates", "inward": "relates to",    "outward": "relates to" }
  ]
```

### Phase 3 — Issue type list (needs project.key)

```
mcp__atlassian__getJiraProjectIssueTypesMetadata({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  projectKey: "PROJ"
})
→ Keep raw as phase3 (--assemble maps it to cache.issueTypes)
   e.g. issueTypes = {
    "Task":     { "id": "10001", "subtask": false, "hierarchyLevel": 0  },
    "Bug":      { "id": "10002", "subtask": false, "hierarchyLevel": 0  },
    "Story":    { "id": "10003", "subtask": false, "hierarchyLevel": 0  },
    "Sub-task": { "id": "10004", "subtask": true,  "hierarchyLevel": -1 }
  }
```

### Phase 4 — Field schemas (one call per issue type, run in parallel)

```
mcp__atlassian__getJiraIssueTypeMetaWithFields({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  projectKey: "PROJ",
  issueTypeId: "10001"  ← cache.issueTypes["Task"].id
})
→ Keep raw as phase4["Task"] (--assemble maps it to cache.fieldSchemas["Task"])
   e.g. fields = {
    "summary":           { "required": true,  "type": "string" },
    "description":       { "required": false, "type": "string" },
    "priority":          { "required": false, "type": "priority",
                           "allowedValues": ["Highest","High","Medium","Low","Lowest"] },
    "labels":            { "required": false, "type": "array<string>" },
    "customfield_10016": { "required": false, "name": "Story Points", "type": "number" }
  }

// Repeat for Bug, Story, Sub-task — each call uses cache.issueTypes[name].id
```

### Phase 5 — Workflow discovery (per non-subtask issue type)

```
// Step 5a: Find all statuses in use for "Task"
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  jql: "project = PROJ AND issuetype = \"Task\" ORDER BY status ASC",
  fields: ["status"],
  maxResults: 100
})
→ Keep raw as phase5["Task"].statuses (status list), e.g. unique status names: ["To Do", "In Progress", "In Review", "Done"]

// Step 5b: For each status, find one representative issue key
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  jql: "project = PROJ AND issuetype = \"Task\" AND status = \"In Progress\"",
  fields: ["status"],
  maxResults: 1
})
→ Get: issues[0].key = "PROJ-42"

// Step 5c: Get available transitions from that status
mcp__atlassian__getTransitionsForJiraIssue({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  issueKey: "PROJ-42"
})
→ Keep raw as phase5["Task"].transitions["In Progress"] (--assemble maps it to cache.workflows["Task"].transitions["In Progress"])
   e.g. transitions = [
    { "id": "11", "name": "Stop Progress",     "to": "To Do",     "requiredFields": {} },
    { "id": "41", "name": "Submit for Review", "to": "In Review", "requiredFields": {} },
    { "id": "51", "name": "Done",              "to": "Done",
      "requiredFields": {
        "resolution": { "required": true, "allowedValues": ["Done", "Won't Do"] }
      }
    }
  ]

// Repeat steps 5b–5c for each status ("To Do", "In Review", "Done")
// Repeat all of phase 5 for each non-subtask issue type (Bug, Story)
```

### Phase 6 — Assemble and save

```bash
node "<PLUGIN_ROOT>/scripts/skill/jira.js" --output-file --project 'PROJ' --assemble --input '/tmp/tmp.Ab12Cd' --save
```

`/tmp/tmp.Ab12Cd` is the `mktemp` path that holds the Phase 1–5 results in the REFERENCE.md §0 raw shape; the output file reports `counts`, `warnings` and `errors`.

---

## 2. Create Issue

### 2a. Simple Task

Read from cache first: verify `cache.issueTypes["Task"]` exists and `cache.fieldSchemas["Task"]` lists required fields.

```
mcp__atlassian__createJiraIssue({
  cloudId:      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  projectKey:   "PROJ",                                    ← cache.project.key
  issueTypeName: "Task",                                   ← exact string from cache.issueTypes key
  summary: "Refresh OAuth2 tokens before expiry",
  description: "## Objective\n- Refresh access tokens silently before they expire\n- Prevents mid-session logouts for long editor sessions\n\n## Details\n- Affects `src/auth/token-store.ts` and the API client interceptor\n- Current: the user is logged out when the access token expires; desired: silent refresh 60 s before expiry\n- Refresh tokens stay in the existing secure storage\n\n## Acceptance Criteria\n- [ ] Access token is refreshed silently before expiry\n- [ ] A failed refresh redirects to login with a clear message\n- [ ] The existing login flow is unaffected\n- [ ] Refresh failures are logged\n\n## Development Plan\n_To be defined by the development team._\n\n## How to Test\n1. **Prerequisites:** Test account; token lifetime set to 2 minutes\n2. **Steps:**\n   1. Sign in\n   2. Wait 90 seconds without interacting\n3. **Expected result:** The session stays active and one refresh call appears in the network log\n4. **Verification:**\n   - No `401` responses in the network log",
  contentFormat: "markdown",
  responseContentFormat: "markdown"
})
→ Extract: key = "PROJ-147"
→ Report:  Created PROJ-147
```

### 2b. Bug with Custom Fields

Read from cache first: `cache.fieldSchemas["Bug"].priority.allowedValues`, `cache.userMappings` for assignee.

```
mcp__atlassian__createJiraIssue({
  cloudId:       "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  projectKey:    "PROJ",                                    ← cache.project.key
  issueTypeName: "Bug",                                     ← exact string from cache.issueTypes key
  summary: "Login fails with SSO users on Firefox",
  description: "## Objective\n- SSO users get a blank page after the SAML callback on Firefox\n- Users cannot sign in with SSO on Firefox\n\n## Details\n### Current Behavior\n- Blank white page after the SAML callback, no error in the UI\n\n### Expected Behavior\n- The user is redirected to the dashboard\n\n### Reproduction Steps\n1. Navigate to the login page\n2. Click \"Sign in with SSO\"\n3. Complete the SAML flow\n4. Observe the blank page\n\n### Environment\n- **Environment:** production\n- **Affected version / release:** 2.4.1\n- **Frequency:** always on Firefox 122 / macOS 14\n\n## Acceptance Criteria\n- [ ] SSO sign-in on Firefox redirects to the dashboard\n- [ ] The empty `RelayState` case is handled\n- [ ] SSO sign-in on other browsers is unaffected\n\n## Development Plan\n_To be defined by the development team._\n\n## How to Test\n1. **Prerequisites:** SSO test account; Firefox 122\n2. **Reproduction (confirm the bug exists before fix):**\n   1. Sign in with SSO on Firefox\n3. **Verification (confirm the fix works):**\n   1. Sign in with SSO on Firefox\n4. **Regression check:**\n   - SSO sign-in on Chrome and Safari\n\n## Release Notes\nFixed a blank page after SSO sign-in on Firefox.",
  contentFormat: "markdown",
  assignee_account_id: "5b10a2844c20165700ede21g",          ← cache.userMappings["Jane Smith"]
  additional_fields: {
    priority:          { name: "High" },                    // { name: "..." } object — NOT a raw string
    labels:            ["sso", "firefox", "auth"],          // flat array of strings
    components:        [{ name: "Auth" }],                  // array of { name } objects
    customfield_10016: 3                                    // Story Points — raw number
  },
  responseContentFormat: "markdown"
})
→ Extract: key = "PROJ-148"
```

Error handling: If 400 with "Field does not support value" → check `cache.fieldSchemas["Bug"].priority.allowedValues` and use an exact match. If priority field is absent from fieldSchemas, omit it.

### 2c. Sub-task

Read from cache first: `cache.issueTypes` — identify which entry has `subtask: true`; that exact key name is required.

```
mcp__atlassian__createJiraIssue({
  cloudId:       "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  projectKey:    "PROJ",                                    ← cache.project.key
  issueTypeName: "Sub-task",                               ← exact subtask type name from cache.issueTypes
  summary: "Write unit tests for token refresh",
  description: "## Parent ticket\nPROJ-147\n\n## Objective\n- Cover the token refresh logic with unit tests\n- Advances PROJ-147 by guarding against refresh regressions\n\n## Details\n- Affects the token refresh module and its Jest suite\n- Uses mock timers for expiry paths\n\n## Acceptance Criteria\n- [ ] All refresh paths are covered\n- [ ] Existing tests still pass\n\n## How to Test\n1. **Prerequisites:** Project dependencies installed\n2. **Steps:**\n   1. Run the Jest suite\n3. **Expected result:** All token refresh tests pass",
  contentFormat: "markdown",
  parent: "PROJ-147",                                      // string key, NOT { key: "..." } object
  responseContentFormat: "markdown"
})
→ Extract: key = "PROJ-149"
```

Error handling: If 400 → confirm `issueTypeName` exactly matches the subtask entry in `cache.issueTypes` (may be "Sub-task", "Subtask", or a custom name). If `parent` is rejected, check that PROJ-147 is a non-subtask issue type.

---

## 3. Edit Issue

### 3a. Update Summary and Priority

Read from cache first: `cache.fieldSchemas[issueType].priority.allowedValues` to confirm the priority name is valid.

```
mcp__atlassian__editJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-147",
  fields: {
    summary:  "Implement OAuth2 token refresh with retry logic",
    priority: { name: "Highest" }                     // { name } object, value from cache.fieldSchemas[type].priority.allowedValues
  },
  responseContentFormat: "markdown"
})
```

### 3b. Update Labels and Components

```
mcp__atlassian__editJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-148",
  fields: {
    labels:     ["sso", "firefox", "auth", "critical"],          // replaces existing labels entirely
    components: [{ name: "Auth" }, { name: "Frontend" }]         // array of { name } objects
  },
  responseContentFormat: "markdown"
})
```

### 3c. Update Custom Fields (Story Points and Sprint)

Read from cache first: `cache.fieldSchemas[issueType]` to confirm the custom field keys.

```
mcp__atlassian__editJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-147",
  fields: {
    customfield_10016: 5,   // Story Points — raw number, key from cache.fieldSchemas
    customfield_10020: 42   // Sprint ID — raw number (NOT the sprint name or a { name } object)
  },
  responseContentFormat: "markdown"
})
```

Error handling: If 400 with "Field ... cannot be set" → confirm `fields` is a flat object, not nested under `fields.fields`. Verify each custom field key uses the `customfield_XXXXX` format from `cache.fieldSchemas`.

---

## 4. Search Issues

### 4a. Summary View (my open issues)

```
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  jql: "project = PROJ AND assignee = currentUser() AND status != Done ORDER BY updated DESC",
  fields: ["summary", "status", "priority", "assignee", "updated"],
  maxResults: 25,
  responseContentFormat: "markdown"
})
→ Format results as table: Key | Summary | Status | Priority | Updated
```

### 4b. Detail View (bugs in current sprint)

```
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  jql: "project = PROJ AND issuetype = Bug AND sprint in openSprints() ORDER BY priority ASC",
  fields: ["summary", "status", "priority", "assignee", "created", "updated", "description"],
  maxResults: 10,
  responseContentFormat: "markdown"
})
→ Render each issue's description field as markdown
```

### 4c. Text Search

```
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  jql: "project = PROJ AND text ~ \"token refresh\" ORDER BY updated DESC",
  fields: ["summary", "status", "issuetype", "assignee"],
  maxResults: 20,
  responseContentFormat: "markdown"
})
```

### 4d. Paginated Results

```
// First page
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  jql: "project = PROJ AND status = \"To Do\" ORDER BY created ASC",
  fields: ["summary", "status", "priority"],
  maxResults: 50,
  startAt: 0,
  responseContentFormat: "markdown"
})
→ Check: if issues.length === 50 AND total > 50, more pages exist — fetch next page

// Second page (same params, advance startAt)
mcp__atlassian__searchJiraIssuesUsingJql({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  jql: "project = PROJ AND status = \"To Do\" ORDER BY created ASC",
  fields: ["summary", "status", "priority"],
  maxResults: 50,
  startAt: 50,
  responseContentFormat: "markdown"
})
```

---

## 5. Transition Issue

### 5a. Simple Transition (no required fields)

Read from cache first: `cache.workflows[issueType].transitions[currentStatus]`.

```
// Step 1: Get current status and issue type
mcp__atlassian__getJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-147",
  fields:   ["status", "issuetype"],
  responseContentFormat: "markdown"
})
→ Extract: status.name = "To Do", issuetype.name = "Task"

// Step 2: Look up transition in cache
// cache.workflows["Task"].transitions["To Do"] = [
//   { "id": "21", "name": "Start Progress", "to": "In Progress", "requiredFields": {} }
// ]
// requiredFields is empty — no extra fields needed

// Step 3: Execute transition
mcp__atlassian__transitionJiraIssue({
  cloudId:    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey:   "PROJ-147",
  transition: { id: "21" }                              ← cache.workflows["Task"].transitions["To Do"][n].id
})
→ Success: PROJ-147 moved to "In Progress"
```

### 5b. Transition Requiring Resolution

Read from cache first: confirm `requiredFields` in the target transition entry.

```
// cache.workflows["Task"].transitions["In Progress"][2] = {
//   "id": "51", "name": "Done", "to": "Done",
//   "requiredFields": {
//     "resolution": { "required": true, "allowedValues": ["Done", "Won't Do"] }
//   }
// }

mcp__atlassian__transitionJiraIssue({
  cloudId:    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey:   "PROJ-147",
  transition: { id: "51" },                             // id from cache — NOT the transition name
  fields: {
    resolution: { name: "Done" }                        // required by this transition; value from allowedValues
  }
})
→ Success: PROJ-147 moved to "Done" with resolution "Done"
```

Error handling: If 400 with "Field required" → a required field was missing or wrongly formatted; re-check `requiredFields` in the transition definition and supply `{ name: "..." }` for resolution.

### 5c. Transition with Unknown Current Status (get fresh)

Use when the issue's current status is unknown or may have changed since the cache was built.

```
// Step 1: Get context-sensitive transitions for this specific issue
mcp__atlassian__getTransitionsForJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  issueKey: "PROJ-147"
})
→ transitions = [
    { "id": "41", "name": "Submit for Review", "to": "In Review" },
    { "id": "51", "name": "Done",              "to": "Done"      }
  ]
// This list already reflects only the valid transitions from the current status

// Step 2: Match the desired target and execute
mcp__atlassian__transitionJiraIssue({
  cloudId:    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  issueKey:   "PROJ-147",
  transition: { id: "41" }
})
→ Success: PROJ-147 moved to "In Review"
```

---

## 6. Add Comment

### 6a. Plain Comment

```
# Step 1: Compose comment in markdown
COMMENT_MD="Reviewed the implementation. Token refresh is working in staging. Ready for QA sign-off."

# Step 2: Convert to ADF
ADF_JSON=$(echo "$COMMENT_MD" | node "<PLUGIN_ROOT>/scripts/lib/markdown-to-adf.js")

# Step 3: Post with ADF format
mcp__atlassian__addCommentToJiraIssue({
  cloudId:        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueIdOrKey:   "PROJ-147",
  commentBody:    <ADF_JSON>,
  contentFormat:         "adf",
  responseContentFormat: "markdown"
})
```

### 6b. Comment with Code Block and Table

```
# Step 1: Compose comment in markdown (use REFERENCE.md Section 4 safe syntax)
COMMENT_MD="## Root Cause Analysis\n\nThe blank page is caused by the SAML callback handler returning early when \`RelayState\` is empty.\n\n\`\`\`js\n// Before fix:\nif (!relayState) return; // silently drops the response\n\n// After fix:\nif (!relayState) relayState = '/dashboard';\n\`\`\`\n\n## Test Results\n\n| Browser | Status |\n|---------|--------|\n| Chrome  | Pass   |\n| Firefox | Pass   |\n| Safari  | Pass   |"

# Step 2: Convert to ADF
ADF_JSON=$(echo -e "$COMMENT_MD" | node "<PLUGIN_ROOT>/scripts/lib/markdown-to-adf.js")

# Step 3: Post with ADF format
mcp__atlassian__addCommentToJiraIssue({
  cloudId:        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueIdOrKey:   "PROJ-148",
  commentBody:    <ADF_JSON>,
  contentFormat:         "adf",
  responseContentFormat: "markdown"
})
```

---

## 7. Link Issues

### 7a. Blocks Link

Read from cache first: `cache.linkTypes` to confirm the link type name; outward = the issue doing the blocking.

```
// "PROJ-147 blocks PROJ-148"
// cache.linkTypes includes: { "name": "Blocks", "inward": "is blocked by", "outward": "blocks" }
// outwardIssue = the blocker; inwardIssue = the issue being blocked

mcp__atlassian__createIssueLink({
  cloudId:      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  linkType:     { name: "Blocks" },                       // name from cache.linkTypes
  inwardIssue:  { key: "PROJ-148" },                      // the blocked issue
  outwardIssue: { key: "PROJ-147" }                       // the blocking issue
})
```

### 7b. Relates-to Link

```
mcp__atlassian__createIssueLink({
  cloudId:      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  linkType:     { name: "Relates" },                      // name from cache.linkTypes
  inwardIssue:  { key: "PROJ-147" },
  outwardIssue: { key: "PROJ-200" }
})
```

Error handling: If 404 or "Link type not found" → the `linkType.name` must match exactly the `name` field in `cache.linkTypes` (case-sensitive). Re-read cache and use the exact string.

---

## 8. Assign Issue

### 8a. Known User (from cache)

Read from cache first: `cache.userMappings` — if the name is present, use the stored accountId directly.

```
// cache.userMappings["Jane Smith"] = "5b10a2844c20165700ede21g"

mcp__atlassian__editJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-147",
  fields: {
    assignee: { accountId: "5b10a2844c20165700ede21g" }  ← cache.userMappings["Jane Smith"]
  },
  responseContentFormat: "markdown"
})
```

### 8b. New User Lookup

```
// Step 1: Look up the user by name or email fragment
mcp__atlassian__lookupJiraAccountId({
  cloudId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  query:   "john.doe"
})
→ results = [
    { accountId: "abc123", displayName: "John Doe", emailAddress: "john.doe@company.com" }
  ]
// If multiple results: present all to user and ask which one to use before proceeding

// Step 2: Assign with confirmed accountId
mcp__atlassian__editJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  issueKey: "PROJ-147",
  fields: {
    assignee: { accountId: "abc123" }
  },
  responseContentFormat: "markdown"
})

// Step 3: Update cache so future operations skip the lookup
// Add to cache.userMappings: { "John Doe": "abc123" }
```

---

## 9. Log Work

### 9a. Simple Time Log

```
mcp__atlassian__addWorklogToJiraIssue({
  cloudId:        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey:       "PROJ-147",
  timeSpent:      "2h 30m",                                 // Jira duration notation
  adjustEstimate: "auto"                                    // auto-reduces remaining estimate
})
```

### 9b. Time Log with Comment and New Estimate

```
mcp__atlassian__addWorklogToJiraIssue({
  cloudId:        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey:       "PROJ-147",
  timeSpent:      "4h",
  comment:        "Implemented token refresh flow and wrote unit tests. Discovered edge case with concurrent refresh — added mutex.",
  adjustEstimate: "new",
  newEstimate:    "2h"                                      // override remaining estimate explicitly
})
```

Error handling: If `timeSpent` is rejected → use Jira duration notation: `1w`, `2d`, `4h`, `30m`, `1h 30m`. Do not use ISO duration or decimal hours.

---

## 10. View Issue

### 10a. Summary Fields

```
mcp__atlassian__getJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-147",
  fields:   ["summary", "status", "assignee", "priority", "issuetype", "labels", "components"],
  responseContentFormat: "markdown"
})
→ Display: key, summary, status.name, assignee.displayName, priority.name, labels[], components[].name
```

### 10b. Full Details (description and custom fields)

```
mcp__atlassian__getJiraIssue({
  cloudId:  "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  ← cache.cloudId
  issueKey: "PROJ-147",
  fields: [
    "summary", "description", "status", "assignee", "reporter",
    "priority", "issuetype", "labels", "components", "fixVersions",
    "created", "updated",
    "customfield_10016",   ← Story Points key from cache.fieldSchemas
    "customfield_10020"    ← Sprint key from cache.fieldSchemas
  ],
  responseContentFormat: "markdown"
})
→ Render description as markdown; display all fields with their labels
```

---

## 11. Bulk Create

Independent creates go out in one parallel batch (several `createJiraIssue` calls in one message); report once after the batch. Create parents before children (for example the Epic before its Stories).

```
// Notify user before starting: "Creating 3 issues..."

mcp__atlassian__createJiraIssue({
  cloudId:       "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  projectKey:    "PROJ",
  issueTypeName: "Task",
  summary:       "Set up CI pipeline",
  description:   "## Objective\nConfigure GitHub Actions CI for automated testing.\n\n## Acceptance Criteria\n- [ ] Tests run on every PR\n- [ ] Coverage report published",
  contentFormat:         "markdown",
  responseContentFormat: "markdown"
})

mcp__atlassian__createJiraIssue({
  cloudId:       "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  projectKey:    "PROJ",
  issueTypeName: "Task",
  summary:       "Add staging environment config",
  description:   "## Objective\nCreate staging environment variables and deployment config.\n\n## Acceptance Criteria\n- [ ] Staging env vars documented in .env.example\n- [ ] Deployment pipeline targets staging",
  contentFormat:         "markdown",
  responseContentFormat: "markdown"
})

mcp__atlassian__createJiraIssue({
  cloudId:       "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  projectKey:    "PROJ",
  issueTypeName: "Task",
  summary:       "Write smoke tests for release checklist",
  description:   "## Objective\nWrite smoke tests that can run against staging after each deploy.\n\n## Acceptance Criteria\n- [ ] 5 critical paths covered\n- [ ] Tests runnable from CI",
  contentFormat:         "markdown",
  responseContentFormat: "markdown"
})

// Report after the batch: Created PROJ-150, PROJ-151, PROJ-152
```

If any issue creation fails: record the failure with its error message, continue creating the remaining issues, and report all successes and failures together at the end. Do not abort the sequence on a single failure.
