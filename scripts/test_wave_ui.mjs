import assert from 'node:assert/strict';
import test from 'node:test';
import { formatStrategyLabel } from '../src/lib/strategyDisplayNames.js';
import {
  groupNfS010Positions,
  nfS010UntaggedSectionLabel,
  nfS010WaveSectionLabel,
  parseWaveNumber,
} from '../src/lib/strategyWaveUi.js';

test('formatStrategyLabel appends wave only for NF_S0_10', () => {
  assert.equal(formatStrategyLabel('NF_S0_10', 2), 'NF_S0_10_W2');
  assert.equal(formatStrategyLabel('NF_S0_10', '3'), 'NF_S0_10_W3');
  assert.equal(formatStrategyLabel('NF_S0_10', null), 'NF_S0_10');
  assert.equal(formatStrategyLabel('NF_S06', 1), 'NF_S06');
  assert.equal(formatStrategyLabel('NF_S310_V1', 1), 'NF_S33');
});

test('groupNfS010Positions keeps stable W1-W4 and untagged fallback', () => {
  const grouped = groupNfS010Positions([
    { strategy_id: 'NF_S0_10', wave: 3, security_id: 1 },
    { strategy_id: 'NF_S0_10', wave: '1', security_id: 2 },
    { strategy_id: 'NF_S0_10', wave: null, security_id: 3 },
    { strategy_id: 'NF_S06', wave: 1, security_id: 4 },
  ]);
  assert.deepEqual(
    grouped.waves[1].map((r) => r.security_id),
    [2],
  );
  assert.deepEqual(grouped.waves[2], []);
  assert.deepEqual(
    grouped.waves[3].map((r) => r.security_id),
    [1],
  );
  assert.deepEqual(grouped.waves[4], []);
  assert.deepEqual(
    grouped.untagged.map((r) => r.security_id),
    [3],
  );
  assert.equal(nfS010WaveSectionLabel(1), 'NF_S0_10_W1');
  assert.equal(nfS010UntaggedSectionLabel(), 'NF_S0_10_UNTAGGED');
  assert.equal(parseWaveNumber('4'), 4);
  assert.equal(parseWaveNumber(9), null);
});

test('groupNfS010Positions mirrors book hedges into active waves only', () => {
  const grouped = groupNfS010Positions([
    { strategy_id: 'NF_S0_10', wave: 1, security_id: 10, side: 'SELL', quantity: 65 },
    { strategy_id: 'NF_S0_10', wave: 2, security_id: 11, side: 'SELL', quantity: 65 },
    {
      strategy_id: 'NF_S0_10',
      wave: 0,
      security_id: 99,
      leg_role: 'hedge_call',
      side: 'BUY',
      quantity: 260,
      unrealized: 40,
    },
    {
      strategy_id: 'NF_S0_10',
      wave: 0,
      security_id: 98,
      leg_role: 'hedge_put',
      side: 'BUY',
      quantity: 260,
      unrealized: -20,
    },
  ]);
  assert.equal(grouped.untagged.length, 0);
  assert.equal(grouped.waves[1].length, 3); // short + 2 mirrored hedges
  assert.equal(grouped.waves[2].length, 3);
  assert.equal(grouped.waves[3].length, 0);
  assert.equal(grouped.waves[4].length, 0);
  const w1Hedge = grouped.waves[1].find((r) => r.leg_role === 'hedge_call');
  assert.equal(w1Hedge.quantity, 130);
  assert.equal(w1Hedge._bookHedgeMirror, true);
  assert.equal(w1Hedge.unrealized, 20);
});
