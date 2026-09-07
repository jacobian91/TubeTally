const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class OrganizationValidationError extends Error {}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OrganizationValidationError(`${label} is required.`);
  }
  return value;
}

export function requiredUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new OrganizationValidationError(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function normalizeOrganizationName(value) {
  if (typeof value !== 'string') throw new OrganizationValidationError('Organization name must be text.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new OrganizationValidationError('Organization name is required.');
  if (name.length > 120) throw new OrganizationValidationError('Organization name is too long.');
  return name;
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new OrganizationValidationError('Email must be text.');
  const email = value.trim().toLocaleLowerCase('en-US');
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new OrganizationValidationError('Enter a valid email address.');
  }
  return email;
}

export function validateCreateOrganization(input) {
  const value = object(input, 'Organization');
  const name = normalizeOrganizationName(value.name);
  return { name, normalizedName: name.toLocaleLowerCase('en-US') };
}

export function validateInvite(input) {
  const value = object(input, 'Invitation');
  return { email: normalizeEmail(value.email) };
}

export function validateMembershipUpdate(input) {
  const value = object(input, 'Membership');
  if (!['admin', 'member'].includes(value.role)) {
    throw new OrganizationValidationError('Role must be admin or member.');
  }
  return { role: value.role };
}

export function validateInvitePreference(input) {
  const value = object(input, 'Preferences');
  if (typeof value.blockOrganizationInvites !== 'boolean') {
    throw new OrganizationValidationError('blockOrganizationInvites must be true or false.');
  }
  return { blockOrganizationInvites: value.blockOrganizationInvites };
}
