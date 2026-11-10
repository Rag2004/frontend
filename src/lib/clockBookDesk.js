/** Entry clocks shared by the 23-book NF_S90 and SN_275 families. */

function namedClocks() {
  const clocks = ['09:20', '09:30'];
  let minutes = 9 * 60 + 45;
  const end = 14 * 60 + 45;
  while (minutes <= end) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    clocks.push(`${hour}:${minute}`);
    minutes += 15;
  }
  return clocks;
}

export function clockBookDesk(prefix, exit) {
  return Object.fromEntries(
    namedClocks().map((entry, index) => [`${prefix}_T${index + 1}`, { entry, exit }]),
  );
}
