import { avatarInitial, greetingName } from '../displayName';

describe('greetingName', () => {
  it('prefers the profile name, falling back to the sign-in name', () => {
    expect(greetingName('Majd', 'Majd K')).toBe('Majd');
    expect(greetingName(undefined, 'Majd K')).toBe('Majd K');
    expect(greetingName(null, null)).toBe('');
  });

  it('treats a blank profile name as missing', () => {
    expect(greetingName('   ', 'Omar')).toBe('Omar');
    expect(greetingName('', '')).toBe('');
  });

  it('trims and collapses whitespace but keeps long names whole', () => {
    expect(greetingName('  Abd   al-Rahman \n ', null)).toBe('Abd al-Rahman');
    const long = 'A'.repeat(60);
    expect(greetingName(long, null)).toBe(long);
  });

  it('leaves Arabic names intact', () => {
    expect(greetingName('عبد الرحمن بن عوف', null)).toBe('عبد الرحمن بن عوف');
  });
});

describe('avatarInitial', () => {
  it('uses the first letter of the name, upper-cased', () => {
    expect(avatarInitial('majd', 'x@y.z')).toBe('M');
    expect(avatarInitial('  omar', null)).toBe('O');
  });

  it('falls back to the email, then ?', () => {
    expect(avatarInitial('', 'zaid@example.com')).toBe('Z');
    expect(avatarInitial('  ', null)).toBe('?');
    expect(avatarInitial(undefined, undefined)).toBe('?');
  });

  it('keeps whole characters for Arabic and emoji', () => {
    expect(avatarInitial('عمر', null)).toBe('ع');
    expect(avatarInitial('😀 Sam', null)).toBe('😀');
  });
});
