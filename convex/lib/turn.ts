/**
 * How long a turn's lock lasts. A turn is one stretch of Gala's work on one
 * project; while it runs, the project is locked to it. A lock older than
 * this is dead: the turn's id stops working, another turn may open, and the
 * studio stops showing "working".
 */
export const TURN_LIFETIME_MS = 12 * 60 * 1000;
