/** Named entry clocks for the PEN_12 books, the 60% target copies, and the trail copies. The engine opens 30 seconds earlier. */

const PEN_12_TIMES = [
  '09:20',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
];

export const PEN_12_EXIT = '15:23';

function pen12Desk(prefix) {
  return Object.fromEntries(
    PEN_12_TIMES.map((entry, index) => [`${prefix}_T${index + 1}`, { entry, exit: PEN_12_EXIT }]),
  );
}

export const SN_PEN_12_PARENT_IDS = PEN_12_TIMES.map((_, index) => `SN_PEN_12_T${index + 1}`);
export const NF_PEN_12_PARENT_IDS = PEN_12_TIMES.map((_, index) => `NF_PEN_12_T${index + 1}`);
export const SN_TGT_PEN12_PARENT_IDS = PEN_12_TIMES.map((_, index) => `SN_TGT_PEN12_T${index + 1}`);
export const NF_TGT_PEN12_PARENT_IDS = PEN_12_TIMES.map((_, index) => `NF_TGT_PEN12_T${index + 1}`);
export const SN_TR_PEN12_PARENT_IDS = PEN_12_TIMES.map((_, index) => `SN_TR_PEN12_T${index + 1}`);
export const NF_TR_PEN_12_PARENT_IDS = PEN_12_TIMES.map((_, index) => `NF_TR_PEN_12_T${index + 1}`);
export const SN_PEN_12_DESK = pen12Desk('SN_PEN_12');
export const NF_PEN_12_DESK = pen12Desk('NF_PEN_12');
export const SN_TGT_PEN12_DESK = pen12Desk('SN_TGT_PEN12');
export const NF_TGT_PEN12_DESK = pen12Desk('NF_TGT_PEN12');
export const SN_TR_PEN12_DESK = pen12Desk('SN_TR_PEN12');
export const NF_TR_PEN_12_DESK = pen12Desk('NF_TR_PEN_12');
