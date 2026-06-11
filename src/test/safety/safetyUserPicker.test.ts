import { describe, it, expect } from 'vitest';
import {
  filterSafetyProfiles,
  SAFETY_USER_PICKER_IDLE_LIMIT,
} from '@/components/safety/SafetyUserPicker';
import type { SafetyProfileLite } from '@/hooks/useSafetyOrg';

const mk = (id: string, full_name: string | null, email: string | null, employee_code: string | null): SafetyProfileLite =>
  ({ id, full_name, email, employee_code });

const PROFILES: SafetyProfileLite[] = [
  mk('1', 'Avinash Kumar', 'avinash@bfcl.com', '101732'),
  mk('2', 'Aabid Hussain', 'aabid@bfcl.com', '200416'),
  mk('3', 'Abhay Kumar', 'abhay1@bfcl.com', '100540'),
  mk('4', 'Abhay Kumar', 'abhay2@bfcl.com', '100172'),
  mk('5', null, 'noname@bfcl.com', '999001'),
  mk('6', 'No Code Person', 'nocode@bfcl.com', null),
];

describe('filterSafetyProfiles (Safety user picker search)', () => {
  it('returns all (capped) profiles when query is empty or whitespace', () => {
    expect(filterSafetyProfiles(PROFILES, '')).toHaveLength(PROFILES.length);
    expect(filterSafetyProfiles(PROFILES, '   ')).toHaveLength(PROFILES.length);
  });

  it('matches by partial name, case-insensitive', () => {
    const res = filterSafetyProfiles(PROFILES, 'avin');
    expect(res.map((p) => p.id)).toEqual(['1']);
    expect(filterSafetyProfiles(PROFILES, 'KUMAR')).toHaveLength(3);
  });

  it('matches by employee ID (partial and full)', () => {
    expect(filterSafetyProfiles(PROFILES, '101732').map((p) => p.id)).toEqual(['1']);
    expect(filterSafetyProfiles(PROFILES, '1005').map((p) => p.id)).toEqual(['3']);
  });

  it('matches by email', () => {
    expect(filterSafetyProfiles(PROFILES, 'aabid@').map((p) => p.id)).toEqual(['2']);
  });

  it('handles null name / code without crashing', () => {
    expect(filterSafetyProfiles(PROFILES, '999001').map((p) => p.id)).toEqual(['5']);
    expect(filterSafetyProfiles(PROFILES, 'no code').map((p) => p.id)).toEqual(['6']);
  });

  it('returns empty array for no matches (failure path)', () => {
    expect(filterSafetyProfiles(PROFILES, 'zzz-does-not-exist')).toEqual([]);
  });

  it('caps idle results but returns ALL matches when searching', () => {
    const big = Array.from({ length: 500 }, (_, i) => mk(`u${i}`, `Worker ${i}`, `w${i}@x.com`, `E${i}`));
    // Idle (no query) -> capped to keep dropdown fast.
    expect(filterSafetyProfiles(big, '')).toHaveLength(SAFETY_USER_PICKER_IDLE_LIMIT);
    // Searching -> NOT capped, so users beyond the idle window are findable.
    expect(filterSafetyProfiles(big, 'worker')).toHaveLength(500);
    expect(filterSafetyProfiles(big, 'Worker 4')).toHaveLength(
      big.filter((p) => p.full_name?.includes('Worker 4')).length,
    );
  });

  it('finds a specific user even when they are far past the idle cap', () => {
    const big = Array.from({ length: 500 }, (_, i) => mk(`u${i}`, `Worker ${i}`, `w${i}@x.com`, `E${i}`));
    big.push(mk('target', 'Avinash Kumar', 'avi@x.com', '101732'));
    expect(filterSafetyProfiles(big, '101732').map((p) => p.id)).toEqual(['target']);
    expect(filterSafetyProfiles(big, 'avinash').map((p) => p.id)).toEqual(['target']);
  });
});