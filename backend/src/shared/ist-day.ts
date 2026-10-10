/**
 * The quota day: one calendar day in India Standard Time.
 *
 * IST is a fixed UTC+05:30 with no daylight saving, so a constant offset is exact — no tz
 * database needed. This is the ONLY place the day key and reset time are computed; the key is
 * passed into SQL rather than derived there, so JS and the database can never disagree.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface IstDayWindow {
    /** `YYYY-MM-DD` of the IST calendar day containing `now`. */
    day: string;
    /** 00:00 IST of the next day, as an absolute instant. */
    resetAt: Date;
}

export function istDayWindow(now: Date): IstDayWindow {
    // Shift into IST wall-clock, truncate to midnight, shift back.
    const istMidnight = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
    return {
        day: new Date(istMidnight).toISOString().slice(0, 10),
        resetAt: new Date(istMidnight + DAY_MS - IST_OFFSET_MS),
    };
}

/** Seconds until `resetAt`, for a Retry-After header. Never below 1. */
export function retryAfterSeconds(resetAt: Date, now: Date): number {
    return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}
