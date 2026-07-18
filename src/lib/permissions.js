const { PermissionsBitField } = require('discord.js');
const prisma = require('./prisma');

/**
 * Returns true if `member` counts as staff: either they have the
 * Administrator permission (unless allowAdmin is false), or they hold at
 * least one of the given Discord role IDs.
 */
function hasStaffPermission(member, requiredRoleIds = [], allowAdmin = true) {
  if (!member) return false;
  if (allowAdmin && member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

  const roleIds = new Set(member.roles.cache.map((role) => role.id));
  return requiredRoleIds.some((roleId) => roleIds.has(roleId));
}

/**
 * Parses a Team's `roleIds` column (stored as a JSON array string, e.g.
 * '["123","456"]') back into a plain array. Returns [] for null/invalid
 * values so callers never need to null-check.
 */
function parseTeamRoleIds(roleIds) {
  if (!roleIds) return [];
  try {
    const parsed = JSON.parse(roleIds);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Resolves the Discord role IDs allowed to manage tickets in a given
 * category, via that category's assigned Team (set through
 * `/ticket-panel create staff_role:`). Returns [] if the category has no
 * team assigned (or no category was given), meaning only Administrators
 * count as staff for that ticket.
 */
async function getStaffRoleIdsForCategory(categoryId) {
  if (!categoryId) return [];
  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { team: true } });
  return parseTeamRoleIds(category?.team?.roleIds);
}

/**
 * Ticket-management permission check: true if `member` is a server
 * Administrator, or holds one of the staff roles assigned to the ticket's
 * category. Pass the ticket with its `category` relation included where
 * possible to avoid an extra query; falls back to `ticket.categoryId`
 * otherwise.
 */
async function canManageTicket(member, ticket) {
  if (!member || !ticket) return false;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

  const categoryId = ticket.category?.id || ticket.categoryId;
  const staffRoleIds = await getStaffRoleIdsForCategory(categoryId);
  if (staffRoleIds.length === 0) return false;

  return hasStaffPermission(member, staffRoleIds, false);
}

module.exports = {
  hasStaffPermission,
  parseTeamRoleIds,
  getStaffRoleIdsForCategory,
  canManageTicket,
};
