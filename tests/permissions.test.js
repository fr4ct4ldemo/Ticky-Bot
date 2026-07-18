jest.mock('../src/lib/prisma', () => ({ category: { findUnique: jest.fn() } }));
const prisma = require('../src/lib/prisma');
const { hasStaffPermission, parseTeamRoleIds, getStaffRoleIdsForCategory, canManageTicket } = require('../src/lib/permissions');

function makeFakeMember({ isAdmin = false, roleIds = [] } = {}) {
  return {
    permissions: {
      has: () => isAdmin,
    },
    roles: {
      cache: {
        map: (fn) => roleIds.map((id) => fn({ id })),
      },
    },
  };
}

describe('permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hasStaffPermission returns true for administrator even without required roles', () => {
    const member = makeFakeMember({ isAdmin: true, roleIds: [] });
    expect(hasStaffPermission(member, [])).toBe(true);
  });

  test('hasStaffPermission returns true for non-admin when member has a required role', () => {
    const member = makeFakeMember({ isAdmin: false, roleIds: ['111'] });
    expect(hasStaffPermission(member, ['111'])).toBe(true);
  });

  test('hasStaffPermission returns false when member is neither admin nor has a required role', () => {
    const member = makeFakeMember({ isAdmin: false, roleIds: ['111'] });
    expect(hasStaffPermission(member, ['222'])).toBe(false);
  });

  test('hasStaffPermission returns false when member is null', () => {
    expect(hasStaffPermission(null, ['111'])).toBe(false);
    expect(hasStaffPermission(undefined, ['111'])).toBe(false);
  });

  test('hasStaffPermission returns false for administrator when allowAdmin is false and no matching role', () => {
    const member = makeFakeMember({ isAdmin: true, roleIds: [] });
    expect(hasStaffPermission(member, ['111'], false)).toBe(false);
  });

  test('parseTeamRoleIds returns parsed array for valid JSON array string', () => {
    expect(parseTeamRoleIds('["111","222"]')).toEqual(['111', '222']);
  });

  test('parseTeamRoleIds returns [] for null input', () => {
    expect(parseTeamRoleIds(null)).toEqual([]);
  });

  test('parseTeamRoleIds returns [] for malformed JSON string', () => {
    expect(parseTeamRoleIds('not json')).toEqual([]);
  });

  test('parseTeamRoleIds returns [] for JSON that is not an array', () => {
    expect(parseTeamRoleIds('{"foo":"bar"}')).toEqual([]);
  });

  test('getStaffRoleIdsForCategory returns [] immediately for falsy categoryId', async () => {
    expect(await getStaffRoleIdsForCategory(null)).toEqual([]);
    expect(await getStaffRoleIdsForCategory(undefined)).toEqual([]);
    expect(await getStaffRoleIdsForCategory('')).toEqual([]);
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
  });

  test('getStaffRoleIdsForCategory returns parsed role IDs for a category with a team', async () => {
    prisma.category.findUnique.mockResolvedValue({ team: { roleIds: '["111","222"]' } });
    expect(await getStaffRoleIdsForCategory('category-1')).toEqual(['111', '222']);
    expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { id: 'category-1' }, include: { team: true } });
  });

  test('getStaffRoleIdsForCategory returns [] when category team is null', async () => {
    prisma.category.findUnique.mockResolvedValue({ team: null });
    expect(await getStaffRoleIdsForCategory('category-1')).toEqual([]);
  });

  test('canManageTicket returns true for administrator without category lookup', async () => {
    const member = makeFakeMember({ isAdmin: true, roleIds: [] });
    const ticket = { categoryId: 'category-1' };
    expect(await canManageTicket(member, ticket)).toBe(true);
  });

  test('canManageTicket returns true for non-admin member with matching category team role', async () => {
    prisma.category.findUnique.mockResolvedValue({ team: { roleIds: '["111"]' } });
    const member = makeFakeMember({ isAdmin: false, roleIds: ['111'] });
    const ticket = { category: { id: 'category-1' } };
    expect(await canManageTicket(member, ticket)).toBe(true);
  });

  test('canManageTicket returns false for non-admin member without matching category team role', async () => {
    prisma.category.findUnique.mockResolvedValue({ team: { roleIds: '["111"]' } });
    const member = makeFakeMember({ isAdmin: false, roleIds: ['222'] });
    const ticket = { category: { id: 'category-1' } };
    expect(await canManageTicket(member, ticket)).toBe(false);
  });

  test('canManageTicket returns false when ticket category has no team assigned', async () => {
    prisma.category.findUnique.mockResolvedValue({ team: null });
    const member = makeFakeMember({ isAdmin: false, roleIds: ['111'] });
    const ticket = { categoryId: 'category-1' };
    expect(await canManageTicket(member, ticket)).toBe(false);
  });

  test('canManageTicket returns false when member is null', async () => {
    const ticket = { categoryId: 'category-1' };
    expect(await canManageTicket(null, ticket)).toBe(false);
  });

  test('canManageTicket returns false when ticket is null', async () => {
    const member = makeFakeMember({ isAdmin: false, roleIds: ['111'] });
    expect(await canManageTicket(member, null)).toBe(false);
  });
});
