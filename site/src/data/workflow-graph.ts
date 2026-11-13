export interface WorkflowNode {
  slug: string;
  command: string;
  category: 'planning' | 'review' | 'gitops' | 'workflows' | 'devops' | 'integrations';
  lane: 'plan' | 'review' | 'ship';
  col: number;
  tagline: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
  style: 'solid' | 'dashed' | 'cross-lane';
}

export const workflowNodes: WorkflowNode[] = [
  // Plan lane
  { slug: 'jira-sdlc', command: '/jira-sdlc', category: 'integrations', lane: 'plan', col: 0, tagline: 'Create & manage Jira issues' },
  { slug: 'github-sdlc', command: '/github-sdlc', category: 'integrations', lane: 'plan', col: 3, tagline: 'Create & manage GitHub issues' },
  { slug: 'plan-sdlc', command: '/plan-sdlc', category: 'planning', lane: 'plan', col: 1, tagline: 'Write implementation plans' },
  { slug: 'execute-plan-sdlc', command: '/execute-plan-sdlc', category: 'planning', lane: 'plan', col: 2, tagline: 'Execute plans with parallel waves' },
  // Review lane
  { slug: 'setup-sdlc', command: '/setup-sdlc', category: 'review', lane: 'review', col: 0, tagline: 'Configure review dimensions, PR template, guardrails' },
  { slug: 'review-sdlc', command: '/review-sdlc', category: 'review', lane: 'review', col: 1, tagline: 'Multi-dimension code review' },
  { slug: 'received-review-sdlc', command: '/received-review-sdlc', category: 'review', lane: 'review', col: 2, tagline: 'Process review feedback' },
  { slug: 'harden-sdlc', command: '/harden-sdlc', category: 'review', lane: 'review', col: 3, tagline: 'Harden guardrails after failure' },
  // Ship lane
  { slug: 'commit-sdlc', command: '/commit-sdlc', category: 'gitops', lane: 'ship', col: 0, tagline: 'Smart commit message generation' },
  { slug: 'pr-sdlc', command: '/pr-sdlc', category: 'gitops', lane: 'ship', col: 1, tagline: 'Create structured pull requests' },
  { slug: 'version-sdlc', command: '/version-sdlc', category: 'gitops', lane: 'ship', col: 2, tagline: 'Bump version and create release' },
  { slug: 'ship-sdlc', command: '/ship-sdlc', category: 'workflows', lane: 'ship', col: 3, tagline: 'Full pipeline orchestrator' },
  { slug: 'verify-pipeline-sdlc', command: '/verify-pipeline-sdlc', category: 'devops', lane: 'ship', col: 4, tagline: 'Diagnose & fix failed CI runs' },
];

export const workflowEdges: WorkflowEdge[] = [
  // Plan lane flow
  { from: 'jira-sdlc', to: 'plan-sdlc', label: 'informs', style: 'solid' },
  { from: 'github-sdlc', to: 'plan-sdlc', label: 'informs', style: 'solid' },
  { from: 'plan-sdlc', to: 'execute-plan-sdlc', label: 'executes', style: 'solid' },
  // Review lane flow
  { from: 'setup-sdlc', to: 'review-sdlc', label: 'configures', style: 'solid' },
  { from: 'review-sdlc', to: 'received-review-sdlc', label: 'findings to', style: 'solid' },
  // Ship lane flow
  { from: 'commit-sdlc', to: 'pr-sdlc', label: 'staged for', style: 'solid' },
  { from: 'pr-sdlc', to: 'version-sdlc', label: 'merged then', style: 'solid' },
  // Cross-lane
  { from: 'execute-plan-sdlc', to: 'review-sdlc', label: 'feeds into', style: 'cross-lane' },
  { from: 'received-review-sdlc', to: 'commit-sdlc', label: 'fixes flow into', style: 'cross-lane' },
  { from: 'execute-plan-sdlc', to: 'commit-sdlc', label: 'or ship directly', style: 'cross-lane' },
  { from: 'execute-plan-sdlc', to: 'version-sdlc', label: 'release after', style: 'cross-lane' },
  { from: 'review-sdlc', to: 'commit-sdlc', label: 'approved, then', style: 'cross-lane' },
  // Ship-sdlc orchestrator
  { from: 'ship-sdlc', to: 'execute-plan-sdlc', label: 'invokes', style: 'dashed' },
  { from: 'ship-sdlc', to: 'commit-sdlc', label: 'invokes', style: 'dashed' },
  { from: 'ship-sdlc', to: 'review-sdlc', label: 'invokes', style: 'dashed' },
  { from: 'ship-sdlc', to: 'received-review-sdlc', label: 'invokes conditionally', style: 'dashed' },
  { from: 'ship-sdlc', to: 'version-sdlc', label: 'invokes', style: 'dashed' },
  { from: 'ship-sdlc', to: 'pr-sdlc', label: 'invokes', style: 'dashed' },
  // Harden loop
  { from: 'ship-sdlc', to: 'harden-sdlc', label: 'on failure', style: 'cross-lane' },
  { from: 'harden-sdlc', to: 'setup-sdlc', label: 'tightens guardrails', style: 'dashed' },
  // verify-pipeline-sdlc
  { from: 'pr-sdlc', to: 'verify-pipeline-sdlc', label: 'CI failure on', style: 'solid' },
  { from: 'verify-pipeline-sdlc', to: 'commit-sdlc', label: 'fix-applied', style: 'cross-lane' },
  { from: 'ship-sdlc', to: 'verify-pipeline-sdlc', label: 'invokes', style: 'dashed' },
];

export const laneLabels: Record<string, string> = {
  plan: 'PLAN',
  review: 'REVIEW',
  ship: 'SHIP',
};

export const laneOrder = ['plan', 'review', 'ship'] as const;
