import { describe, expect, it } from 'vitest';
import { unmetPasswordRequirements } from './password.ts';

const unmet = (password: string) =>
  unmetPasswordRequirements(password).map((requirement) => requirement.id);

describe('password requirements', () => {
  it.each([
    'correct horse battery',
    'tulip-cactus-river',
    'Tr0ub4dor&3xtra',
    'contraseña segura',
    'exactly12ch4',
    `${'a1b2c3d'.repeat(18)}x`.slice(0, 128),
  ])('accepts %s', (password) => {
    expect(unmet(password)).toEqual([]);
  });

  it.each([
    ['', ['min-length', 'letter', 'number-or-symbol', 'not-guessable']],
    ['short1', ['min-length']],
    ['elevenchar1', ['min-length']],
    ['onlylettershere', ['number-or-symbol']],
    ['1234 7890 2468', ['letter']],
    ['my password is long', ['not-guessable']],
    ['MY PASSWORD IS LONG', ['not-guessable']],
    ['qwerty uiop asdf', ['not-guessable']],
    ['a123456 b c d e', ['not-guessable']],
    ['aaaaaaaaaaaa1', []],
    ['a1a1a1a1a1a1', ['not-guessable']],
    ['abc1abc1abc1', ['not-guessable']],
    ['abcde1abcde1', ['not-guessable']],
    ['ab1'.repeat(43), ['max-length', 'not-guessable']],
  ])('finds what is wrong with %j', (password, expected) => {
    expect(unmet(password)).toEqual(expected);
  });

  it('counts a password of exactly the longest length as fine, and one more as too long', () => {
    const longest = `${'horse7'.repeat(21)}xy`;
    expect(longest).toHaveLength(128);
    expect(unmet(longest)).toEqual([]);
    expect(unmet(`${longest}z`)).toEqual(['max-length']);
  });
});
