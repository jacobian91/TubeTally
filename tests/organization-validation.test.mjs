import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OrganizationValidationError,
  normalizeEmail,
  validateCreateOrganization,
  validateInvite,
  validateMembershipUpdate,
} from '../netlify/functions/_shared/organization-validation.mjs';

test('normalizes organization names and invitation emails', () => {
  assert.deepEqual(validateCreateOrganization({ name: '  West   Valley Farm ' }), {
    name: 'West Valley Farm',
    normalizedName: 'west valley farm',
  });
  assert.equal(normalizeEmail('  FARMER@Example.COM '), 'farmer@example.com');
});

test('rejects invalid organization inputs', () => {
  assert.throws(() => validateCreateOrganization({ name: '  ' }), OrganizationValidationError);
  assert.throws(() => validateInvite({ email: 'not-an-email' }), OrganizationValidationError);
  assert.throws(() => validateMembershipUpdate({ role: 'owner' }), OrganizationValidationError);
});
