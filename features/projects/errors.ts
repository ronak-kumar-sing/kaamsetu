// Maps the stable RPC error keys documented in docs/api/projects.md to user-facing copy.

const MESSAGES: Record<string, string> = {
  project_not_found:
    "We couldn't find that project. It may have been removed or you no longer have access.",
  not_project_client: 'Only the client who posted this project can do that.',
  not_assigned_freelancer: 'Only the freelancer assigned to this project can do that.',
  invalid_status: "That isn't possible in the current state. Pull to refresh and try again.",
  milestone_cap_exceeded:
    'One milestone is too large a share of the total. Split the work into more milestones or rebalance the amounts.',
  too_few_milestones: 'Add at least two milestones before publishing.',
  milestone_dates_invalid:
    'Milestone due dates must be in the future and must not go backwards from one milestone to the next.',
  revision_limit_reached: 'The revision limit for this project has been reached.',
  already_proposed: 'You already have a pending proposal on this project.',
  cannot_propose_own_project: "You can't send a proposal on your own project.",
  invite_invalid:
    'This invite is no longer valid. It may have expired, been revoked or already been used.',
  plan_total_mismatch:
    "Your milestone plan doesn't add up to your price. Adjust the amounts or your price so they match.",
  price_change_needs_plan:
    'You changed the price, so you also need to suggest a milestone plan that adds up to it.',
  invalid_input: 'Some details are missing or out of range. Check each field and try again.',
  milestone_not_found: "We couldn't find that milestone.",
  proposal_not_found: "We couldn't find that proposal. It may have been withdrawn.",
  milestone_status_locked: 'This milestone can no longer be changed in its current state.',
  not_authenticated: 'Please sign in again to continue.',
  role_required: 'Your account needs a different role to do that. Check Settings to add it.',
};

const PERMISSION_DENIED = "You don't have permission to do that.";
const NETWORK = 'Check your internet connection and try again.';
const FALLBACK = 'Something went wrong. Please try again.';

function field(error: unknown, key: string): string {
  if (error && typeof error === 'object' && key in error) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

/** The stable key out of a PostgREST error, e.g. "milestone_cap_exceeded", or null. */
export function rpcErrorKey(error: unknown): string | null {
  const message = field(error, 'message').trim();
  if (message in MESSAGES) return message;
  const known = Object.keys(MESSAGES).find((key) => message.includes(key));
  return known ?? null;
}

export function rpcErrorMessage(error: unknown): string {
  if (!error) return FALLBACK;
  const key = rpcErrorKey(error);
  if (key) return MESSAGES[key] ?? FALLBACK;
  if (field(error, 'code') === '42501') return PERMISSION_DENIED;
  const message = field(error, 'message').toLowerCase();
  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timed out') ||
    field(error, 'name') === 'TypeError'
  ) {
    return NETWORK;
  }
  if (message.includes('permission denied')) return PERMISSION_DENIED;
  return FALLBACK;
}
