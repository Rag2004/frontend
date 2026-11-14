const CLOCK_FAMILY = /^(.+)_T(\d+)$/;

function sumField(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

/**
 * Collapse PREFIX_T{n} books into one family row. A family with a single book
 * stays a normal row. Member order is the tranche number.
 */
export function groupPnlFamilies(rows) {
  const groups = new Map();
  const top = [];
  for (const row of rows || []) {
    const match = CLOCK_FAMILY.exec(String(row?.strategy_id || ''));
    if (!match) {
      top.push({ ...row, rowKind: 'book' });
      continue;
    }
    const family = match[1];
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push({ ...row, rowKind: 'member', familyIndex: Number(match[2]) });
  }
  for (const [family, members] of groups) {
    if (members.length < 2) {
      top.push({ ...members[0], rowKind: 'book' });
      continue;
    }
    members.sort((a, b) => a.familyIndex - b.familyIndex);
    const symbols = new Set(members.map((member) => member.symbolLabel));
    top.push({
      strategy_id: `family:${family}`,
      rowKind: 'family',
      familyId: family,
      symbolLabel: symbols.size === 1 ? [...symbols][0] : 'Mixed',
      expiryLabel: '',
      realized: sumField(members, 'realized'),
      unrealized: sumField(members, 'unrealized'),
      total: sumField(members, 'total'),
      members,
    });
  }
  return top;
}

/** Family prefixes that have at least two clock books. Members stay in tranche order. */
export function listClockFamilies(strategyIds) {
  const groups = new Map();
  for (const id of strategyIds || []) {
    const match = CLOCK_FAMILY.exec(String(id || ''));
    if (!match) continue;
    const family = match[1];
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push({ id: String(id), index: Number(match[2]) });
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([id, members]) => ({
      id,
      members: members.sort((a, b) => a.index - b.index).map((member) => member.id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
