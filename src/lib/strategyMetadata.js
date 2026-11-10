import { clockBookDesk } from './clockBookDesk';
import { SN_S275_DESK } from './snS275Desk';

/** Shared static schedule metadata; backend strategy IDs remain unchanged. */

export const STRATEGY_METADATA = {
  SN_S01: { entry: '12:45' },
  SN_S02_V4F: { entry: '09:30' },
  SN_S_54_V4: { entry: '09:15+' },
  SN_S03_V4F: { entry: '09:30' },
  SN_S05_V2: { entry: '09:25' },
  SN_S06_V2: { entry: '09:30' },
  SN_S07_V2: { entry: '14:00' },
  SN_S08: { entry: '12:45+' },
  SN_S09: { entry: '12:30' },
  MANUAL_TEST: { entry: 'Manual' },
  NF_S01_V1: { entry: '09:25' },
  NF_S05_V1: { entry: '09:25' },
  NF_S06_V1: { entry: '09:30' },
  NF_S59_V1: { entry: '11:30' },
  NF_S58_V7: { entry: '12:31+' },
  NF_S310_V1: { entry: '10:00' },
  NF_S0_10: { entry: '09:16' },
  GL_1: { entry: '09:16' },
  ...SN_S275_DESK,
  ...clockBookDesk('NF_S90', '15:23'),
  ...clockBookDesk('SN_275', '15:23'),
};

export const ENTRY_TIMES = Object.fromEntries(
  Object.entries(STRATEGY_METADATA).map(([id, value]) => [id, value.entry])
);

export const EXIT_TIMES = Object.fromEntries(
  Object.entries(STRATEGY_METADATA)
    .filter(([, value]) => value.exit)
    .map(([id, value]) => [id, value.exit])
);
