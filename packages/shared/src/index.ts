/**
 * The contract between the PWA and the API.
 *
 * Everything here is environment-free: no DOM, no Node, no Dexie. The streak
 * rules and the day-boundary maths live here precisely so the client and the
 * server cannot drift — the server maintains `challenge_members.current_streak`
 * and enforces the edit window using these exact functions.
 */
// Plain `export *`, not `export type *`: types.ts now carries a runtime value
// (MEALS) alongside the type declarations.
export * from './types';
export * from './defaults';
export * from './rolling';
export * from './scoring';
export * from './sync';
export * from './time';
