import { SN_S275_PARENT_IDS } from './snS275Desk';

/** Frontend-only DTE bucket filters for Setup & Risk (backend IDs unchanged). */

export const DTE_FILTERS = {
  ALL: 'all',
  NIFTY_0DT: 'nifty_0dt',
  NIFTY_1DT: 'nifty_1dt',
  NIFTY_2DT: 'nifty_2dt',
  SENSEX_0DT: 'sensex_0dt',
};

export const DTE_FILTER_OPTIONS = [
  { value: DTE_FILTERS.ALL, label: 'All' },
  { value: DTE_FILTERS.NIFTY_0DT, label: 'Nifty 0DTE' },
  { value: DTE_FILTERS.NIFTY_1DT, label: 'Nifty 1DTE' },
  { value: DTE_FILTERS.NIFTY_2DT, label: 'Nifty 2DTE' },
  { value: DTE_FILTERS.SENSEX_0DT, label: 'Sensex 0DTE' },
];

const NIFTY_MULTI = [DTE_FILTERS.NIFTY_0DT, DTE_FILTERS.NIFTY_1DT, DTE_FILTERS.NIFTY_2DT];
const NF_S90_IDS = Array.from({ length: 23 }, (_, index) => `NF_S90_T${index + 1}`);
const SN_275_IDS = Array.from({ length: 23 }, (_, index) => `SN_275_T${index + 1}`);
const CLOCK_FAMILY = /^(.+)_T(\d+)$/;

/** Backend strategy ID → filter bucket membership. */
const STRATEGY_DTE_BUCKETS = {
  NF_S0_10: [DTE_FILTERS.NIFTY_0DT],
  GL_1: [DTE_FILTERS.NIFTY_0DT],
  NF_S01_V1: [DTE_FILTERS.NIFTY_0DT],
  NF_S05_V1: [DTE_FILTERS.NIFTY_0DT],
  NF_S06_V1: [DTE_FILTERS.NIFTY_0DT],
  NF_S59_V1: NIFTY_MULTI,
  NF_S58_V7: NIFTY_MULTI,
  NF_S310_V1: NIFTY_MULTI,
  SN_S01: [DTE_FILTERS.SENSEX_0DT],
  SN_S02_V4F: [DTE_FILTERS.SENSEX_0DT],
  SN_S03_V4F: [DTE_FILTERS.SENSEX_0DT],
  SN_S05_V2: [DTE_FILTERS.SENSEX_0DT],
  SN_S06_V2: [DTE_FILTERS.SENSEX_0DT],
  SN_S07_V2: [DTE_FILTERS.SENSEX_0DT],
  SN_S08: [DTE_FILTERS.SENSEX_0DT],
  SN_S09: [DTE_FILTERS.SENSEX_0DT],
  SN_S_54_V4: [DTE_FILTERS.SENSEX_0DT],
  MANUAL_TEST: [DTE_FILTERS.SENSEX_0DT],
  ...Object.fromEntries(SN_S275_PARENT_IDS.map((id) => [id, [DTE_FILTERS.SENSEX_0DT]])),
  ...Object.fromEntries(NF_S90_IDS.map((id) => [id, NIFTY_MULTI])),
  ...Object.fromEntries(SN_275_IDS.map((id) => [id, [DTE_FILTERS.SENSEX_0DT]])),
};

/** Fixed section order for All view — exactly the four dashboard sections. */
const ALL_VIEW_SECTION_DEFS = [
  { id: DTE_FILTERS.NIFTY_0DT, label: 'Nifty 0DTE' },
  { id: DTE_FILTERS.NIFTY_1DT, label: 'Nifty 1DTE' },
  { id: DTE_FILTERS.NIFTY_2DT, label: 'Nifty 2DTE' },
  { id: DTE_FILTERS.SENSEX_0DT, label: 'Sensex 0DTE' },
];

export function getStrategyDteBuckets(strategyId) {
  const buckets = STRATEGY_DTE_BUCKETS[strategyId];
  return Array.isArray(buckets) ? [...buckets] : [];
}

export function strategyMatchesDteFilter(strategyId, filter) {
  const f = filter || DTE_FILTERS.ALL;
  const buckets = STRATEGY_DTE_BUCKETS[strategyId];
  if (!buckets?.length) return false;
  if (f === DTE_FILTERS.ALL) return true;
  return buckets.includes(f);
}

export function dteFilterLabel(filter) {
  const opt = DTE_FILTER_OPTIONS.find((o) => o.value === filter);
  return opt?.label || 'All';
}

function clockBookIndex(strategyId) {
  const match = CLOCK_FAMILY.exec(String(strategyId || ''));
  return match ? Number(match[2]) : 0;
}

/**
 * Pull clock books (PREFIX_T1..) into one collapsible family section with a master toggle.
 * Families of a single book stay in the normal DTE sections.
 */
function splitClockFamilies(strategies) {
  const groups = new Map();
  const solo = [];
  for (const strategy of strategies) {
    const match = CLOCK_FAMILY.exec(String(strategy?.id || ''));
    if (!match) {
      solo.push(strategy);
      continue;
    }
    const family = match[1];
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(strategy);
  }
  const sections = [];
  for (const [family, members] of groups) {
    if (members.length < 2) {
      solo.push(...members);
      continue;
    }
    members.sort((a, b) => clockBookIndex(a?.id) - clockBookIndex(b?.id));
    sections.push({
      id: `family:${family}`,
      label: family,
      strategies: members,
      collapsible: true,
      familyToggle: true,
      liveCount: members.filter((s) => s?.isTrading).length,
    });
  }
  sections.sort((a, b) => a.label.localeCompare(b.label));
  return { solo, sections };
}

/**
 * Build Setup & Risk table sections from already-filtered strategies.
 * - Specific DTE filter: one section labeled with that filter (collapsible: false).
 * - All: always the four sections; multi-bucket strategies appear in every matching section;
 *   unmapped strategies are omitted.
 * Never mutates input.
 *
 * @param {Array<{ id: string, isTrading?: boolean }>} strategies
 * @param {string} activeFilter
 * @returns {Array<{ id: string, label: string, strategies: typeof strategies, collapsible: boolean, liveCount: number }>}
 */
export function buildSetupDteSections(strategies, activeFilter) {
  const list = Array.isArray(strategies) ? strategies : [];
  const filter = activeFilter || DTE_FILTERS.ALL;
  const { solo, sections: families } = splitClockFamilies(list);

  if (filter !== DTE_FILTERS.ALL) {
    const blocks = [];
    if (solo.length) {
      blocks.push({
        id: filter,
        label: dteFilterLabel(filter),
        strategies: [...solo],
        collapsible: false,
        liveCount: solo.filter((s) => s?.isTrading).length,
      });
    }
    return [...blocks, ...families];
  }

  const buckets = new Map(ALL_VIEW_SECTION_DEFS.map((d) => [d.id, []]));
  for (const strategy of solo) {
    const membership = getStrategyDteBuckets(strategy?.id);
    for (const sectionId of membership) {
      const bucket = buckets.get(sectionId);
      if (bucket) bucket.push(strategy);
    }
  }

  const dteSections = ALL_VIEW_SECTION_DEFS.map((def) => {
    const items = buckets.get(def.id) || [];
    return {
      id: def.id,
      label: def.label,
      strategies: items,
      collapsible: true,
      liveCount: items.filter((s) => s?.isTrading).length,
    };
  });
  return [...dteSections, ...families];
}
