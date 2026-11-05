import { describe, expect, it } from 'vitest';
import { codeSchema, profileSchema } from './validation.js';
describe('protocol boundaries', () => {
  it('normalizes invitation codes', () => expect(codeSchema.parse(' abcd23 ')).toBe('ABCD23'));
  it('rejects arbitrary paths and invalid roles', () => {
    expect(codeSchema.safeParse('../foo').success).toBe(false);
    expect(profileSchema.safeParse({ name: 'Joe', role: 'admin', avatar: 0 }).success).toBe(false);
  });
});
