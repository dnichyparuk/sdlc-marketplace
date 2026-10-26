export type StepType = 'script' | 'llm' | 'critique' | 'user' | 'dispatch' | 'verify';
export type SkillCategory = 'planning' | 'review' | 'gitops' | 'workflows' | 'devops' | 'integrations';

export interface PipelineStep {
  id: string;
  label: string;
  type: StepType;
  description?: string;
}

export interface SkillConnection {
  to: string;
  label: string;
}

export interface SkillMeta {
  slug: string;
  command: string;
  category: SkillCategory;
  userInvocable: boolean;
  tagline: string;
  pipeline: PipelineStep[];
  connections: SkillConnection[];
}

export const skillsMeta: SkillMeta[] = [
  {
    slug: 'plan-sdlc',
    command: '/plan-sdlc',
    category: 'planning',
    userInvocable: true,
    tagline: 'Decomposes requirements into classified tasks; dispatches a dynamic-dimension orchestrator for 4+ file scopes; enforces Contract concreteness (G18/R45), render-don\'t-narrate (G19/R46), Notes rationale-only (G20/R48), and self-contained code refs (G21/R51) in critique; annotates OpenSpec tasks.md with per-task back-pointers when `--from-openspec` is active.',
    pipeline: [
      { id: 'requirements', label: 'Gather requirements', type: 'user', description: 'Free-form description, spec file, or clarification questions' },
      { id: 'guardrails', label: 'Load guardrails', type: 'script', description: 'Reads plan guardrails from project config for critique evaluation' },
      { id: 'explore', label: 'Explore codebase', type: 'script', description: 'Dispatches dynamic-dimension orchestrator; produces discovery-brief.md with F-DIM-N finding IDs (R24–R28); falls back to inline exploration for ≤3-file scopes or on error' },
      { id: 'g17-dispatch', label: 'Dimension Coverage (G17)', type: 'dispatch', description: 'Dispatches G17 subagent in parallel to check review-dimension coverage; advisory — failure skips gracefully without blocking plan finalization (R31)' },
      { id: 'decompose', label: 'Decompose tasks', type: 'llm', description: 'Breaks requirements into tasks with complexity/risk metadata' },
      { id: 'critique-plan', label: 'Self-critique plan', type: 'critique', description: 'Reviews for coverage, dependency integrity, scope creep, render-concreteness (G19), Notes rationale-only (G20), and self-contained code refs (G21)' },
      { id: 'revise-present', label: 'Revise and present', type: 'user', description: 'Fixes critique issues; shows plan for approval' },
      { id: 'save', label: 'Write plan document', type: 'script', description: 'Writes plan to plansDirectory with date prefix' },
      { id: 'openspec-annotate', label: 'Annotate OpenSpec tasks', type: 'script', description: 'Injects ref comments into tasks.md and annotates plan tasks with openspec-task blocks' },
      { id: 'plan-review', label: 'Cross-model review', type: 'dispatch', description: 'Dispatches a second model to review the written plan; dispatches run in the foreground (run_in_background: false) behind an explicit await barrier so results are consolidated only after every lane returns (R-c1)' },
      { id: 'gate-a-intake', label: 'Gate A: Intake Audit', type: 'dispatch', description: 'opsx:verify-style audit of source OpenSpec change before decomposition (CRITICAL blocks; WARNING/SUGGESTION recorded as caveats)' },
      { id: 'gate-b-scorecard', label: 'Gate B: Verification Scorecard', type: 'critique', description: 'Requirement-to-task traceability matrix + per-check severity scorecard + go/no-go verdict (additive layer over existing Step 5 lens results)' },
    ],
    connections: [
      { to: 'setup-sdlc', label: 'consumes guardrails from' },
      { to: 'execute-plan-sdlc', label: 'produces plans for' },
      { to: 'ship-sdlc', label: 'full pipeline after' },
      { to: 'review-sdlc', label: 'review after execution' },
      { to: 'pr-sdlc', label: 'open PR after execution' },
    ],
  },
  {
    slug: 'execute-plan-sdlc',
    command: '/execute-plan-sdlc',
    category: 'planning',
    userInvocable: true,
    tagline: 'Orchestrates wave-based parallel plan execution with critique loops, spec compliance review, and automatic error recovery; flips OpenSpec tasks.md checkboxes in real time as waves complete.',
    pipeline: [
      { id: 'load-plan', label: 'Prepare and validate plan', type: 'script', description: 'skill/execute.js reads the explicit plan file (never conversation context), validates it, and resolves flags, waves and worker routing' },
      { id: 'classify', label: 'Classify tasks and build waves', type: 'llm', description: 'Reads the prepared complexity, risk and waves; raises a task only with a stated reason' },
      { id: 'critique-waves', label: 'Critique wave structure', type: 'critique', description: 'Checks file conflicts, risk clustering, context gaps' },
      { id: 'preset', label: 'Revise and select quality tier', type: 'user', description: 'Fixes wave issues; presents the Speed/Balanced/Quality worker routing tiers' },
      { id: 'high-risk-gate', label: 'High-risk gate', type: 'user', description: 'Pauses before waves with breaking or irreversible changes' },
      { id: 'dispatch-wave', label: 'Dispatch wave agents', type: 'dispatch', description: 'Dispatches worker agents (agent × effort) from main context, or one wave-runner per wave for plans of execute.waveRunnerMinPlanTasks tasks or more; batches trivials' },
      { id: 'mechanical-verify', label: 'Verify and checkpoint', type: 'verify', description: 'git diff, canary tokens, tests, conflict detection' },
      { id: 'context-overflow-recovery', label: 'CONTEXT_OVERFLOW recovery', type: 'verify', description: 'Detects missing task IDs via parseWaveSummary; runner mode auto-splits and re-dispatches wave halves when context was exhausted; direct mode reports the task FAILED for Step 6 recovery' },
      { id: 'spec-review', label: 'Spec compliance review', type: 'critique', description: 'Reviewer checks implementations against specifications; once after the final wave by default (execute.specReviewer), per wave when configured or under --quality minimal' },
      { id: 'openspec-flip', label: 'Flip OpenSpec checkboxes', type: 'script', description: 'Marks completed OpenSpec tasks as done in tasks.md after each wave' },
      { id: 'final-verify', label: 'Final verification', type: 'verify', description: 'Full test suite, build, lint after all waves complete' },
      { id: 'final-critique', label: 'Final output critique', type: 'critique', description: 'Checks deliverables, drift, orphaned files, TODOs' },
      { id: 'completeness-gate', label: 'Post-execute completeness gate', type: 'verify', description: 'Runs state/execute.js verify-completeness; exits 65 if any plannedTaskIds are unaccounted — halts pipeline before commit' },
    ],
    connections: [
      { to: 'plan-sdlc', label: 'executes plans from' },
      { to: 'review-sdlc', label: 'review changes after' },
      { to: 'pr-sdlc', label: 'open PR after' },
      { to: 'commit-sdlc', label: 'commit changes after' },
      { to: 'version-sdlc', label: 'release after' },
    ],
  },
  {
    slug: 'ship-sdlc',
    command: '/ship-sdlc',
    category: 'workflows',
    userInvocable: true,
    tagline: 'Orchestrates the full shipping pipeline via a steps[]-based config: execute, commit, review, fix, version, and PR in one invocation, with outcome-verified step completion.',
    pipeline: [
      { id: 'load-config', label: 'Load config and flags', type: 'script', description: 'Reads .sdlc/local.json (ship section), merges CLI flags, auto-migrates v1 configs, detects context' },
      { id: 'build-pipeline', label: 'Build pipeline plan', type: 'llm', description: 'Determines which steps run, builds routing table with conditions' },
      { id: 'validate', label: 'Validate pipeline', type: 'critique', description: 'Checks prerequisites, warns about interactive pauses' },
      { id: 'confirm', label: 'Present and confirm', type: 'user', description: 'Shows full pipeline table; proceeds automatically in --auto mode' },
      { id: 'execute-steps', label: 'Execute pipeline steps', type: 'dispatch', description: 'Runs the pipeline; every sub-skill (including execute-plan-sdlc) is dispatched as an Agent for context isolation, returning a structured result that drives the pipeline state machine' },
      { id: 'review-gate', label: 'Review verdict gate', type: 'llm', description: 'Evaluates review findings; triggers fix loop for critical/high' },
      { id: 'verify-openspec', label: 'Verify OpenSpec (opt-in)', type: 'dispatch', description: 'Runs openspec validate --strict inline to validate implementation completeness against the spec; runs only when configured in steps[] and a matched change exists' },
      { id: 'archive-openspec', label: 'Archive OpenSpec change (conditional)', type: 'script', description: 'Fresh task-completeness check; prompts to sync or archive-anyway when incomplete; runs openspec archive inline' },
      { id: 'report', label: 'Pipeline summary', type: 'verify', description: 'Prints results, decisions log, deferred findings, cleanup' },
    ],
    connections: [
      { to: 'execute-plan-sdlc', label: 'invokes' },
      { to: 'commit-sdlc', label: 'invokes' },
      { to: 'review-sdlc', label: 'invokes' },
      { to: 'received-review-sdlc', label: 'invokes conditionally' },
      { to: 'version-sdlc', label: 'invokes' },
      { to: 'pr-sdlc', label: 'invokes' },
    ],
  },
  {
    slug: 'review-sdlc',
    command: '/review-sdlc',
    category: 'review',
    userInvocable: true,
    tagline: 'Dispatches parallel review subagents per dimension, deduplicates findings, and posts a consolidated comment to the PR.',
    pipeline: [
      { id: 'load-dimensions', label: 'Load review dimensions', type: 'script', description: 'Reads .sdlc/review-dimensions/ and matches dimensions to changed files via glob patterns' },
      { id: 'scope-diff', label: 'Resolve diff scope', type: 'script', description: 'Computes the diff based on --committed/--staged/--working/--worktree flags' },
      { id: 'dispatch-reviewers', label: 'Dispatch review agents', type: 'dispatch', description: 'Parallel subagents review each matching dimension independently' },
      { id: 'deduplicate', label: 'Deduplicate findings', type: 'llm', description: 'Merges overlapping findings from multiple dimensions into a unified list' },
      { id: 'persist-comment', label: 'Persist review comment', type: 'llm', description: 'Orchestrator writes consolidated comment body to disk; skill parses summary and handles posting in main context' },
      { id: 'post-prompt', label: 'Post or save comment', type: 'user', description: 'Prompts yes / save / cancel; posts via gh api -F body=@ or saves to .sdlc/reviews/' },
      { id: 'fix-prompt', label: 'Offer self-fix', type: 'user', description: 'Prompts to invoke received-review-sdlc when actionable findings exist' },
    ],
    connections: [
      { to: 'setup-sdlc', label: 'requires dimensions from' },
      { to: 'received-review-sdlc', label: 'hands off findings to' },
      { to: 'pr-sdlc', label: 'reviews PRs from' },
      { to: 'commit-sdlc', label: 'commit after approval' },
    ],
  },
  {
    slug: 'received-review-sdlc',
    command: '/received-review-sdlc',
    category: 'review',
    userInvocable: true,
    tagline: 'Responds to code review feedback with a dual self-critique gate and configurable per-severity auto-apply, preventing blind implementation of incorrect suggestions.',
    pipeline: [
      { id: 'load-feedback', label: 'Read review feedback', type: 'script', description: 'Gathers findings from context, paste, or gh API' },
      { id: 'categorize', label: 'Categorize and flag', type: 'llm', description: 'Classifies each item; flags unclear items to resolve' },
      { id: 'verify-claims', label: 'Verify against codebase', type: 'verify', description: 'Reads referenced code to confirm or refute each claim' },
      { id: 'evaluate', label: 'Evaluate suggestions', type: 'llm', description: 'Determines agree/disagree/needs-discussion per item' },
      { id: 'critique-eval', label: 'Critique evaluation', type: 'critique', description: 'Gate 1: checks blind agreement, YAGNI, completeness' },
      { id: 'revise-eval', label: 'Revise evaluation', type: 'llm', description: 'Strengthens reasoning, reclassifies unsupported items' },
      { id: 'draft-responses', label: 'Draft responses', type: 'llm', description: 'Writes per-item responses with technical substance' },
      { id: 'critique-responses', label: 'Critique responses', type: 'critique', description: 'Gate 2: checks performative language, weak pushback' },
      { id: 'implement', label: 'Implement and reply', type: 'user', description: 'Posts thread replies (with approval); implements fixes' },
    ],
    connections: [
      { to: 'review-sdlc', label: 'responds to findings from' },
      { to: 'pr-sdlc', label: 'addresses review on PR from' },
      { to: 'commit-sdlc', label: 'commit fixes after' },
    ],
  },
  {
    slug: 'commit-sdlc',
    command: '/commit-sdlc',
    category: 'gitops',
    userInvocable: true,
    tagline: 'Generates a commit message matching the project style, stashes unstaged changes automatically, and restores them after.',
    pipeline: [
      { id: 'prepare', label: 'Run commit-prepare.js', type: 'script', description: 'Computes staged diff, recent commits, branch context' },
      { id: 'analyze-diff', label: 'Analyze diff and style', type: 'llm', description: 'Reads staged changes and detects project commit style' },
      { id: 'generate-message', label: 'Generate commit message', type: 'llm', description: 'Drafts conventional or project-style commit message' },
      { id: 'critique-message', label: 'Critique message', type: 'critique', description: 'Reviews against 7 quality gates (style, accuracy, etc.)' },
      { id: 'revise-message', label: 'Revise message', type: 'llm', description: 'Fixes all failing quality gates from critique' },
      { id: 'review-confirm', label: 'Present and commit', type: 'user', description: 'Shows message; on approval: stash, commit, restore stash' },
      { id: 'verify-commit', label: 'Verify commit', type: 'verify', description: 'Confirms commit created and stash restored via git log' },
    ],
    connections: [
      { to: 'pr-sdlc', label: 'feeds into' },
      { to: 'version-sdlc', label: 'precedes tagging in' },
    ],
  },
  {
    slug: 'pr-sdlc',
    command: '/pr-sdlc',
    category: 'gitops',
    userInvocable: true,
    tagline: 'Analyzes branch commits and diff to generate a structured PR description, then opens the PR via the GitHub CLI.',
    pipeline: [
      { id: 'prepare', label: 'Run pr-prepare.js', type: 'script', description: 'Computes commits, diff, branch state, account switch' },
      { id: 'consume', label: 'Consume context', type: 'script', description: 'Parses commits, diff, JIRA ticket, custom template' },
      { id: 'draft-description', label: 'Draft PR description', type: 'llm', description: 'Fills all template sections from branch analysis' },
      { id: 'critique-draft', label: 'Critique draft', type: 'critique', description: 'Reviews against 9 quality gates (specificity, etc.)' },
      { id: 'revise-draft', label: 'Revise draft', type: 'llm', description: 'Fixes failing gates; asks user if context unclear' },
      { id: 'review-confirm', label: 'Present for approval', type: 'user', description: 'Shows title and description; yes/edit/cancel' },
      { id: 'create-pr', label: 'Create or update PR', type: 'script', description: 'Runs gh pr create or gh pr edit after approval' },
      { id: 'account-recovery', label: 'Post-failure account-switch', type: 'script', description: 'On permission error, auto-switches gh account and retries once (E7)' },
    ],
    connections: [
      { to: 'setup-sdlc', label: 'uses template from' },
      { to: 'review-sdlc', label: 'review branch before' },
      { to: 'commit-sdlc', label: 'follows commits from' },
    ],
  },
  {
    slug: 'version-sdlc',
    command: '/version-sdlc',
    category: 'gitops',
    userInvocable: true,
    tagline: 'Manages the full semantic release workflow: version bump, annotated git tag, optional CHANGELOG entry, and push.',
    pipeline: [
      { id: 'prepare', label: 'Run version-prepare.js', type: 'script', description: 'Detects version source, tags, commits, existing config' },
      { id: 'plan-release', label: 'Determine bump and changelog', type: 'llm', description: 'Selects version bump; drafts changelog entry if enabled' },
      { id: 'critique-release', label: 'Critique release plan', type: 'critique', description: 'Reviews semver, breaking changes, changelog completeness' },
      { id: 'revise-release', label: 'Revise release plan', type: 'llm', description: 'Fixes quality gate failures from critique' },
      { id: 'present-plan', label: 'Present release plan', type: 'user', description: 'Shows version, tag, changelog flag; awaits approval' },
      { id: 'verify-preconditions', label: 'Verify pre-conditions', type: 'verify', description: 'Checks tag conflicts, uncommitted changes, git identity' },
      { id: 'check-idempotency', label: 'Idempotency gate (Step 2.6)', type: 'verify', description: 'Detects release tags already at HEAD; skips bump if branch already tagged to stay idempotent' },
      { id: 'check-ci', label: 'Check CI scripts', type: 'verify', description: 'Verifies installed retag/changelog scripts are current' },
      { id: 'execute-release', label: 'Execute release', type: 'script', description: 'Atomically: bump version, changelog, commit, tag, push' },
    ],
    connections: [
      { to: 'pr-sdlc', label: 'follows PR merge in' },
      { to: 'commit-sdlc', label: 'follows commits from' },
      { to: 'jira-sdlc', label: 'update ticket after release' },
    ],
  },
  {
    slug: 'jira-sdlc',
    command: '/jira-sdlc',
    category: 'integrations',
    userInvocable: true,
    tagline: 'Manages Jira issues via Atlassian MCP with a project metadata cache that reduces most operations to a single MCP call; tracks MCP failures with a deterministic classifier and an analyze-then-confirm dispatch gate.',
    pipeline: [
      { id: 'resolve-project', label: 'Resolve project key', type: 'script', description: 'Auto-detects from git branch or .sdlc/jira-config.json' },
      { id: 'load-cache', label: 'Initialize or load cache', type: 'script', description: 'Builds cache on first use; reads cached metadata after' },
      { id: 'parse-intent', label: 'Classify operation', type: 'llm', description: 'Interprets request into create/edit/search/transition/etc.' },
      { id: 'critique-payload', label: 'Critique payload', type: 'llm', description: 'Write-ops only: checks template completeness, placeholder resolution, and field validity before approval' },
      { id: 'approve-payload', label: 'Approve payload', type: 'user', description: 'Write-ops only: presents final payload for explicit approve / change / cancel before any MCP dispatch' },
      { id: 'execute-op', label: 'Execute Jira operation', type: 'script', description: 'Calls Atlassian MCP with cached field IDs and schemas' },
      { id: 'mcp-telemetry', label: 'MCP failure telemetry (R27)', type: 'script', description: 'On any MCP error path, classifies the failure (transport/auth/schema/workflow/hook-block/link-verification) and appends a 5-line redacted block to .sdlc/learnings/log.md' },
      { id: 'analyze-confirm-gate', label: 'Analyze-then-confirm gate (R28)', type: 'critique', description: 'For recurrent or unrecoverable MCP failures, synthesizes a dispatch proposal (with gh-based duplicate detection) and presents it for explicit user approval before escalating to error-report-sdlc' },
      { id: 'cache-refresh', label: 'Update cache', type: 'script', description: 'Saves new users, transitions; auto-refreshes on stale data' },
    ],
    connections: [
      { to: 'pr-sdlc', label: 'create PR after story' },
      { to: 'review-sdlc', label: 'review before closing task' },
      { to: 'plan-sdlc', label: 'informs planning in' },
    ],
  },
  {
    slug: 'setup-sdlc',
    command: '/setup-sdlc',
    category: 'review',
    userInvocable: true,
    tagline: 'Unified project setup — configures version, ship, review, and jira settings in one interactive flow.',
    pipeline: [
      { id: 'detect', label: 'Detect current state', type: 'script', description: 'Runs setup-prepare.js to find existing configs and legacy files' },
      { id: 'migrate', label: 'Migrate legacy configs', type: 'llm', description: 'Consolidates legacy files into unified .sdlc/config.json' },
      { id: 'configure', label: 'Interactive config builder', type: 'user', description: 'Walks through version, ship, jira, and review settings' },
      { id: 'validate', label: 'Validate written config', type: 'verify', description: 'Re-runs setup-prepare.js to confirm config is readable' },
      { id: 'content-setup', label: 'Content setup', type: 'dispatch', description: 'Runs dimensions, PR template, plan template, and guardrails sub-flows' },
      { id: 'summary', label: 'Show summary', type: 'llm', description: 'Reports what was created, migrated, and configured' },
    ],
    connections: [
      { to: 'version-sdlc', label: 'configures versioning for' },
      { to: 'ship-sdlc', label: 'configures pipeline for' },
      { to: 'review-sdlc', label: 'provides dimensions for' },
      { to: 'plan-sdlc', label: 'provides guardrails and plan template for' },
      { to: 'jira-sdlc', label: 'configures project key for' },
    ],
  },
  {
    slug: 'harden-sdlc',
    command: '/harden-sdlc',
    category: 'workflows',
    userInvocable: true,
    tagline: 'After a pipeline failure, analyzes hardening surfaces (guardrails, review dimensions, copilot instructions) and proposes user-approved edits that would catch the same class of failure earlier next time. Supports --from-issue to hydrate failure context from a tracked plugin-defect issue. Strengthen-only in v1.',
    pipeline: [
      { id: 'consume', label: 'Run prepare script', type: 'script', description: 'Runs harden-prepare.js to load all five hardening surfaces deterministically' },
      { id: 'from-issue', label: '--from-issue mode (R19)', type: 'script', description: 'When invoked with --from-issue <N>, fetches the GitHub issue body via gh and pre-sets classification_hint to plugin-defect for issues tagged with the mcp-failure label' },
      { id: 'classify', label: 'Surface classification', type: 'llm', description: 'Surfaces failure context and classification hint to user' },
      { id: 'analyze', label: 'Dispatch orchestrator agent', type: 'dispatch', description: 'harden-orchestrator (haiku) classifies failure and drafts per-surface proposals as JSON' },
      { id: 'present', label: 'Present proposals', type: 'user', description: 'AskUserQuestion per proposal — apply / skip / cancel — with full patch preview' },
      { id: 'validate', label: 'Schema validation', type: 'verify', description: 'Validates approved sdlc.json edits via ci/validate-guardrails.js before write' },
      { id: 'apply', label: 'Write approved edits', type: 'llm', description: 'Edits surface files only after explicit approval and validation pass' },
      { id: 'route', label: 'Plugin-defect routing', type: 'dispatch', description: 'When classification is plugin-defect, dispatches error-report-sdlc with prepared payload' },
      { id: 'learn', label: 'Learning capture', type: 'llm', description: 'Appends a one-line summary entry to .sdlc/learnings/log.md' },
    ],
    connections: [
      { to: 'plan-sdlc', label: 'hardens after failure of' },
      { to: 'execute-plan-sdlc', label: 'hardens after failure of' },
      { to: 'review-sdlc', label: 'hardens after failure of' },
      { to: 'commit-sdlc', label: 'hardens after failure of' },
      { to: 'setup-sdlc', label: 'strengthens what is configured by' },
    ],
  },
  {
    slug: 'verify-pipeline-sdlc',
    command: '/verify-pipeline-sdlc',
    category: 'devops',
    userInvocable: true,
    tagline: 'Analyzes a failed CI run on a PR, classifies the root cause via a deterministic helper, and either applies a minimal fix or emits a proposal as a JSON verdict.',
    pipeline: [
      { id: 'consume', label: 'Parse args, load logs', type: 'script', description: 'Reads --pr / --logs; falls back to fetchFailedCheckLogs for the latest failed run' },
      { id: 'classify', label: 'Classify failure category', type: 'script', description: 'Runs verify-pipeline-sdlc-classify.js to bucket logs into lint/test/type/build/dep/infra/unknown' },
      { id: 'route', label: 'Apply or propose', type: 'llm', description: 'Actionable categories under --auto trigger an inline Edit; otherwise emits a proposal' },
      { id: 'verdict', label: 'Emit JSON verdict', type: 'verify', description: 'Single JSON line on stdout: fix-applied | proposal | abort' },
    ],
    connections: [
      { to: 'ship-sdlc', label: 'invoked by verify-pipeline step of' },
      { to: 'commit-sdlc', label: 'commit after fix-applied verdict' },
    ],
  },
];

export function getSkillMeta(slug: string): SkillMeta | undefined {
  return skillsMeta.find(s => s.slug === slug);
}

export function getSkillsByCategory(category: SkillCategory): SkillMeta[] {
  return skillsMeta.filter(s => s.category === category);
}
