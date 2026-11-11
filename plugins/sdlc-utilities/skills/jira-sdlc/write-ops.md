# jira-sdlc — Write pipeline

Write pipeline for the jira-sdlc skill. Loaded only for write classes (`create`, `edit`, `transition`, `comment`, `link`, `assign`, `worklog`, `bulk`). Read-only classes (`search`, `view`) never need it. `<PLUGIN_ROOT>` is the same absolute path SKILL.md uses.

## Canonical write procedure <!-- implements R17, R18, R19, R20, R21 -->

1. Gather inputs from the user request
2. Resolve description template (Create + description-touching Edit only — R18)
3. Detect placeholders with `jira.js --check-payload` (Step 2.5); escalate every `low`-confidence marker via `AskUserQuestion` (R19)
4. Build the proposed payload
5. Critique (R20) — emit the `Initial:` / `Critique:` / `Final:` block
6. Approval gate (R17) — print the full final payload, then `AskUserQuestion` with `approve` / `change <what>` / `cancel`. Dispatch only after `approve`; `change` returns to step 5 with the revised payload.
7. Dispatch the MCP write call
8. Post-op cache update

Read operations (Search, View, GetTransitions) and metadata-discovery operations are exempt from steps 5–7.

## Step 2.5 — Critique <!-- implements R20, P7 -->

Skip this step for read operations (`search`, `view`). For every write operation (`create`, `edit`, `transition`, `comment`, `link`, `assign`, `worklog`, `bulk`), run a critique pass against the proposed payload **before** showing it to the user.

1. Build the initial payload exactly as you would dispatch it (template-resolved per R18, placeholders resolved per R19, fields validated against cache per G5/G6/G8).
   - **Template resolution and fallback notices (R18):** Read `resolved`, `fallbacks`, and `noneTypes` from the prepare script output (`resolveTemplateStatus`). For each entry in `fallbacks`, print a one-line notice before building the payload:
     `Using <fallbackTo> template for <type> — override at .sdlc/jira-templates/<type>.md`
     For each entry in `noneTypes`, print a one-line warning and stop the operation:
     `No template for <type>. Run /jira-sdlc --init-templates or create .sdlc/jira-templates/<type>.md`
     Sub-bug, Sub-task, and Subtask types resolve via the FALLBACK_MAP in the prepare script (Sub-bug → Bug, Sub-task → Task, Subtask → Task) — the skill never re-derives this mapping.
2. For create, edit, comment and worklog: create a temp path (`<PAYLOAD_PATH>`) with one plain `mktemp` call. Read the empty file once with the Read tool, then write the draft MCP tool input to it with the Write tool. Then run one plain Bash call (`--type` is left out for comment and worklog):

   ```bash
   node "<PLUGIN_ROOT>/scripts/skill/jira.js" --output-file --project '<PROJECT_KEY>' --check-payload --type '<IssueType>' --input '<PAYLOAD_PATH>'
   ```

   Read the output file. Resolve every `placeholders[]` entry per R19 (low confidence → `AskUserQuestion`) and remove or rename every `unknownHeadings[]` entry to a template heading (R18). On exit 1, show `errors[]` (an unreadable or invalid payload file), fix the payload and run the check again. On exit 2, show stderr and invoke error-report-sdlc (E2). Remove the temp file with one plain Bash call: `rm -f '<PAYLOAD_PATH>'`.
3. Run the critique checklist:
   - **Template completeness** (create / description-touching edit) — every `## ` heading in the payload description belongs to the resolved template; no invented sections.
   - **Field correctness** — issue type / project key / parent / components / labels match cached `allowedValues`.
   - **Workflow validity** — for `transition`, the target status is reachable per the cached workflow graph (R6).
   - **Terminology consistency** — summary vocabulary matches description vocabulary (no contradictions).
   - **Terse content (R25)** — every `## ` section body in the description payload is a bullet list, numbered list, sub-heading set, or (Release Notes only) a single sentence. No paragraph longer than two consecutive non-list non-heading lines in any section. No filler transitional sentences between sections (`This ticket covers…`, `In summary…`, `The goal of…`). The `## Acceptance Criteria` section body is exclusively `- [ ] …` checklist items — no prose introduction, no prose summary, no sentence-form criteria. Summary is an imperative phrase ≤ 100 characters with no filler tokens (`This task covers`, `The goal of`, `We need to make sure`). Surface any violations in the `Critique:` block.
4. Surface the critique to the user as an `Initial:` / `Critique:` / `Final:` block — do not apply deltas silently.

## Step 2.6 — Approval <!-- implements R17, R21 -->

Skip for read operations. <!-- implements R17, R21(c) -->

1. Print the full final payload (not a summary — the bytes the MCP call will dispatch).
2. Call `AskUserQuestion` with three options:
   - **approve** — proceed to Step 3 dispatch
   - **change <what>** — describe the desired change; loop back to Step 2.5 with the revised draft
   - **cancel** — abort the operation, do not dispatch
3. Proceed to Step 3.

## Step 2.7 — Link verification — HARD GATE <!-- implements R22 -->

Skip for read operations. After approval (Step 2.6) and before MCP dispatch, validate every URL embedded in the description payload (for `createJiraIssue`/`editJiraIssue`) and the comment body (for `addCommentToJiraIssue`) via `scripts/skill/jira.js --validate-body`. The script reads the body from the `--file` path and resolves the expected Jira site (`siteUrl`) deterministically from the cached `~/.sdlc-cache/jira/<site>/<KEY>.json` — the skill MUST NOT construct ctx JSON.

1. Create a temp path (`<BODY_PATH>`) with one plain Bash call: `mktemp`.
2. Read the empty file once with the Read tool, then write the body to it with the Write tool: the description or comment markdown; for ADF payloads, every `text` node value joined by newlines (URLs in ADF link marks must also appear in that text).
3. Run one plain Bash call and take its exit code from the tool result as `<LINK_EXIT>`:

   ```bash
   node "<PLUGIN_ROOT>/scripts/skill/jira.js" --validate-body --project '<PROJECT_KEY>' --file '<BODY_PATH>'
   ```
4. Remove the file with one plain Bash call: `rm -f '<BODY_PATH>'`.

On a non-zero `<LINK_EXIT>`:
- The script has already printed the violation list to stderr (URL, line, reason code, observed/expected detail)
- Do NOT dispatch the MCP write tool — the payload is never sent to Jira
- Surface the violation list verbatim to the user
- Stop. Do not retry. Do not edit URLs without user input. Do not bypass.
- Run the MCP-failure gate (SKILL.md → Error Recovery → MCP-failure gate): class `link-verification`, tool `jira.js --validate-body`, error `link verification abort: <LINK_EXIT>`, recovery path `R22`, step label `Step 2.7`.

On zero exit, proceed to Step 3.

`SDLC_LINKS_OFFLINE=1` skips network reachability checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match) — use this in sandboxed CI runs.

## Write quality gates

| Gate | Check |
|------|-------|
| Approval gate (G9) | No write MCP call dispatched without an `approve` from the R17 prompt in this turn |
| Template enforced (G10) | No `description` field built without a resolved template — `.sdlc/jira-templates/<Type>.md` (override) or shipped `templates/<Type>.md` (R18) |
| Placeholders resolved (G11) | No `low`-confidence `{name}` or `[prose]` marker dispatched without explicit user resolution (R19) |
| Critique surfaced (G12) | No proposal presented to the user without a preceding `Initial:` / `Critique:` / `Final:` block (R20) |
| Approval and critique (G13) | No write MCP call without an `approve` answer (Step 2.6) and a surfaced critique (Step 2.5) |
| Link verified (G14, R22) | No write MCP call (`createJiraIssue`, `editJiraIssue`, `addCommentToJiraIssue`) dispatched without `scripts/skill/jira.js --validate-body` returning exit 0. The script enforces — SKILL.md only invokes it. See Step 2.7. |
| Terse content (G15) | Acceptance-Criteria checklist shape is checked in the Step 2.5 critique (R25.2) |

## Constraints

5. Build every `description` from a resolved template (a custom one wins over the shipped one) and fill or remove every placeholder; free-form text and raw placeholders are visible to every Jira user and defeat the team's structure (R18).
6. Ask the user to resolve each `low`-confidence placeholder instead of inferring it, because inferred content reads as fact in the ticket (R19).
7. Write description sections as bullet or numbered lists, with `- [ ]` Acceptance Criteria only and no filler transitions, so tickets stay scannable (R25).
8. Show the `Initial:` / `Critique:` / `Final:` block and the full final payload, and dispatch only after `approve` in this turn. The Step 2.6 approval prompt is the only gate before a write. It applies when another skill or pipeline invokes jira-sdlc too, because `--auto` is not a jira-sdlc flag (R17, R20, R21).
