/** Entry clocks for the twelve Sensex SN_S275 books. Each id is its own desk row. */

export const SN_S275_PARENT_IDS = Array.from({ length: 12 }, (_, index) => `SN_S275_T${index + 1}`);

export const SN_S275_ENTRY_TIMES = {
  SN_S275_T1: '09:20',
  SN_S275_T2: '09:30',
  SN_S275_T3: '10:00',
  SN_S275_T4: '10:30',
  SN_S275_T5: '11:00',
  SN_S275_T6: '11:30',
  SN_S275_T7: '12:00',
  SN_S275_T8: '12:30',
  SN_S275_T9: '13:00',
  SN_S275_T10: '13:30',
  SN_S275_T11: '14:00',
  SN_S275_T12: '14:30',
};

export const SN_S275_EXIT = '15:25';

export const SN_S275_DESK = Object.fromEntries(
  SN_S275_PARENT_IDS.map((id) => [id, { entry: SN_S275_ENTRY_TIMES[id], exit: SN_S275_EXIT }]),
);
