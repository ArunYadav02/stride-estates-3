// ---------------------------------------------------------------------------
// SALES CHAINS
//
// A sale does not fall through because of your link. It falls through because
// of somebody else's, four houses away, and nobody was watching it. Average
// offer-to-exchange in England is around three months and roughly a quarter of
// agreed sales collapse — almost always for a reason that was visible weeks
// earlier and unowned.
//
// So the model here is not "our sale". It is the whole chain, with one link
// marked as ours, and a computed answer to the only question that matters on a
// Monday morning: which link is holding everyone up, and who do I ring.
// ---------------------------------------------------------------------------

import { parseJson, daysBetween, now } from '../lib/helpers.js';

export const MILESTONES = [
  { id: 'offer_accepted', label: 'Offer accepted', typical_days: 0 },
  { id: 'solicitors_instructed', label: 'Solicitors instructed', typical_days: 7 },
  { id: 'searches_ordered', label: 'Searches ordered', typical_days: 21 },
  { id: 'enquiries_answered', label: 'Enquiries answered', typical_days: 49 },
  { id: 'mortgage_offer', label: 'Mortgage offer', typical_days: 56 },
  { id: 'exchange', label: 'Exchange', typical_days: 84 },
];

const ORDER = MILESTONES.map((m) => m.id);

/** Whose problem is each stall, in the words an agent would use on the phone. */
const CHASE = {
  offer_accepted: 'Confirm the offer in writing and send the memorandum of sale.',
  solicitors_instructed: 'Chase both parties for solicitor details — nothing starts until this is done.',
  searches_ordered: 'Ring the buyer\'s solicitor: searches are the longest lead time in the process.',
  enquiries_answered: 'Chase the seller\'s solicitor for replies to enquiries. This is where chains die quietly.',
  mortgage_offer: 'Check the lender has issued the formal offer, not just the AIP.',
  exchange: 'Agree a completion date with every link before anyone commits.',
};

function linkProgress(link) {
  const milestones = parseJson(link.milestones, {});
  const done = ORDER.filter((id) => milestones[id] === 'done').length;
  const blocked = ORDER.find((id) => milestones[id] === 'blocked') || null;
  const active = ORDER.find((id) => milestones[id] === 'active') || null;

  return {
    milestones,
    done,
    blocked,
    active,
    // Where the link actually is: the first thing not finished.
    position: ORDER.find((id) => milestones[id] !== 'done') || 'exchange',
    percent: Math.round((done / ORDER.length) * 100),
  };
}

/**
 * Health of a whole chain. The weakest link is a blocked one if there is one,
 * otherwise the least progressed — because a chain moves at the speed of its
 * slowest member and nothing else.
 */
export function assessChain(chain, links) {
  const today = now().slice(0, 10);

  const assessed = links
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((link) => {
      const progress = linkProgress(link);
      const days = link.agreed_on ? daysBetween(link.agreed_on, today) : null;
      const milestone = MILESTONES.find((m) => m.id === progress.position);
      const behind = days !== null && milestone ? days - milestone.typical_days : null;

      return {
        ...link,
        milestones: progress.milestones,
        progress_percent: progress.percent,
        position_label: MILESTONES.find((m) => m.id === progress.position)?.label,
        blocked_at: progress.blocked,
        blocked_label: progress.blocked ? MILESTONES.find((m) => m.id === progress.blocked)?.label : null,
        days_since_agreed: days,
        days_behind: behind !== null && behind > 0 ? behind : 0,
        is_ours: Boolean(link.is_ours),
      };
    });

  const blockedLinks = assessed.filter((link) => link.blocked_at);
  const weakest = blockedLinks.length
    ? blockedLinks.sort((a, b) => a.progress_percent - b.progress_percent)[0]
    : assessed.slice().sort((a, b) => a.progress_percent - b.progress_percent)[0];

  const chase = weakest
    ? CHASE[weakest.blocked_at || weakest.milestones && Object.keys(weakest.milestones).find((k) => weakest.milestones[k] === 'active')] ||
      CHASE[ORDER.find((id) => weakest.milestones[id] !== 'done')] ||
      'Chain looks healthy — confirm dates with every party.'
    : null;

  return {
    ...chain,
    links: assessed,
    length: assessed.length,
    progress_percent: assessed.length
      ? Math.round(assessed.reduce((sum, l) => sum + l.progress_percent, 0) / assessed.length)
      : 0,
    // A chain can only exchange when every link can.
    ready_to_exchange: assessed.every((link) => link.progress_percent >= 83),
    weakest_link_id: weakest?.id ?? null,
    at_risk: blockedLinks.length > 0 || assessed.some((link) => link.days_behind > 21),
    blocked_count: blockedLinks.length,
    what_to_chase: chase,
    oldest_days: Math.max(0, ...assessed.map((link) => link.days_since_agreed || 0)),
  };
}
