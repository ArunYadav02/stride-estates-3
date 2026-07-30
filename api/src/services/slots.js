// ---------------------------------------------------------------------------
// Viewing availability. The concierge may only ever offer times that exist in
// the real diary — otherwise it books people into thin air, which is worse than
// making them wait until morning.
// ---------------------------------------------------------------------------

import { db } from '../db/index.js';

const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;
const SLOT_MINUTES = 30;

/**
 * Free slots for a negotiator over the next `days`, skipping anything that
 * clashes with an existing viewing and anything already in the past.
 */
export function freeSlots(agencyId, { userId, days = 5, limit = 4 } = {}) {
  const existing = db.all(
    `SELECT starts_at, duration_min FROM viewings
      WHERE agency_id = ? AND status IN ('booked','attended')
        AND starts_at >= ?`,
    [agencyId, new Date().toISOString()]
  ).map((row) => {
    const start = new Date(row.starts_at);
    return { start, end: new Date(start.getTime() + row.duration_min * 60000) };
  });

  const slots = [];
  const cursor = new Date();
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 2); // never offer inside the next two hours

  for (let day = 0; day < days && slots.length < limit; day += 1) {
    const date = new Date(cursor);
    date.setDate(date.getDate() + day);
    if (date.getDay() === 0) continue; // closed Sundays

    for (let hour = OPEN_HOUR; hour < CLOSE_HOUR && slots.length < limit; hour += 1) {
      for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
        const start = new Date(date);
        start.setHours(hour, minute, 0, 0);
        if (start <= cursor && day === 0) continue;

        const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
        const clashes = existing.some((busy) => start < busy.end && busy.start < end);
        if (clashes) continue;

        slots.push({
          iso: start.toISOString(),
          label: start.toLocaleString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit',
          }),
        });

        if (slots.length >= limit) break;
      }
    }
  }

  return slots;
}

/** Match free text back to an offered slot: "Saturday", "Sat 10:00", "the first one". */
export function matchSlot(text, slots) {
  if (!slots.length) return null;
  const needle = String(text).toLowerCase();

  if (/\b(first|1st|earliest|sooner)\b/.test(needle)) return slots[0];
  if (/\b(last|latest)\b/.test(needle)) return slots[slots.length - 1];

  // Day and time mentioned together, then day alone, then time alone.
  const withTime = slots.find((slot) => {
    const label = slot.label.toLowerCase();
    const day = label.slice(0, 3);
    const time = label.match(/(\d{2}):(\d{2})/);
    return needle.includes(day) && time && needle.includes(time[1].replace(/^0/, ''));
  });
  if (withTime) return withTime;

  const byDay = slots.find((slot) => needle.includes(slot.label.slice(0, 3).toLowerCase()));
  if (byDay) return byDay;

  const byTime = slots.find((slot) => {
    const time = slot.label.match(/(\d{2}):(\d{2})/);
    return time && needle.includes(`${time[1].replace(/^0/, '')}`);
  });
  return byTime || null;
}
