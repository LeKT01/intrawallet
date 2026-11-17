import { daysBefore } from './currency.ts'

const us = ['XNAS', 'XNYS', 'ARCX', 'XASE', 'BATS', 'US']
const schedules: Record<string, [string, number, number]> = {
  US: ['America/New_York', 570, 960],
  SW: ['Europe/Zurich', 540, 1050],
  XETRA: ['Europe/Berlin', 540, 1050],
  TGAT: ['Europe/Berlin', 450, 1320],
}
const holidays: Record<string, string[]> = {
  US: ['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
    '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24'],
  SW: ['2026-01-01','2026-01-02','2026-04-03','2026-04-06','2026-05-01','2026-05-14','2026-05-25','2026-12-24','2026-12-25','2026-12-31'],
  XETRA: ['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31'],
}
const earlyUS = new Set(['2026-11-27', '2026-12-24', '2027-11-26'])
const formatters = new Map<string, Intl.DateTimeFormat>()
const venueFor = (venue: string) => us.includes(venue) ? 'US' : ({ XSWX: 'SW', XETR: 'XETRA' }[venue] ?? venue)

function clock(at: number, zone: string) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }))
  const [date, time] = formatters.get(zone)!.format(at).split(' ')
  const [hour, minute] = time.split(':').map(Number)
  return { date, minute: hour * 60 + minute }
}

export function marketClosedDay(venue: string, date: string) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay()
  return weekday === 0 || weekday === 6 || Boolean(holidays[venueFor(venue)]?.includes(date))
}

/** The session preceding a closed calendar day, or null on a trading day. */
export function closingSessionForClosedDay(venue: string, date: string) {
  if (!marketClosedDay(venue, date)) return null
  do { date = daysBefore(date, 1) } while (marketClosedDay(venue, date))
  return date
}

function closeMinute(venue: string, date: string) {
  return venue === 'US' && earlyUS.has(date) ? 780 : (schedules[venue]?.[2] ?? 1050)
}

export function marketOpen(venue: string, at: number) {
  venue = venueFor(venue)
  const schedule = schedules[venue]
  if (!schedule) return null
  const local = clock(at, schedule[0])
  return !marketClosedDay(venue, local.date) && local.minute >= schedule[1] && local.minute < closeMinute(venue, local.date)
}

export function latestClosingDay(venue: string, at: number) {
  venue = venueFor(venue)
  const local = clock(at, schedules[venue]?.[0] ?? 'Europe/Zurich')
  let date = local.minute >= closeMinute(venue, local.date) + 120 ? local.date : daysBefore(local.date, 1)
  while (marketClosedDay(venue, date)) date = daysBefore(date, 1)
  return date
}

export function closeTimestamp(venue: string, day: string) {
  venue = venueFor(venue)
  const noon = Date.parse(day + 'T12:00:00Z')
  return noon + (closeMinute(venue, day) - clock(noon, schedules[venue]?.[0] ?? 'Europe/Zurich').minute) * 60000
}

/** Visual reference intervals only: these are not portfolio valuations. */
export function missingWeekendIntervals(points: readonly { date: string; value: unknown }[]) {
  const first = points[0]?.date
  const last = points.at(-1)?.date
  if (!first || !last || first === last) return []
  const dayMs = 86400000
  const at = (date: string) => Date.parse(date + 'T00:00:00Z')
  const available = points.filter(point => point.value !== null)
  const timestamps = new Set(available.map(point => at(point.date)))
  const intervals: { start: number; end: number; reference: string }[] = []
  const firstTime = at(first)
  const lastTime = at(last)
  let index = 0
  for (let start = firstTime; start < lastTime; start += dayMs) {
    while (index + 1 < available.length && at(available[index + 1].date) <= start) index++
    const reference = available[index]?.date
    const weekday = new Date(start).getUTCDay()
    if (!reference || at(reference) >= start || timestamps.has(start) || (weekday !== 0 && weekday !== 6)) continue
    const end = Math.min(start + dayMs, lastTime)
    const previous = intervals.at(-1)
    if (previous?.end === start && previous.reference === reference) previous.end = end
    else intervals.push({ start, end, reference })
  }
  return intervals
}
