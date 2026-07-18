const prisma = require('./prisma');

// Fixed set of ticket categories. Panels are built from this list directly —
// there's no `/category create` step anymore. To change the categories,
// edit this list; `ensureDefaultCategories` will create any that are missing
// for a guild (existing ones, and any tickets already tied to them, are left
// alone) the next time a panel is created.
const DEFAULT_CATEGORIES = [
  { name: 'General Support', emoji: '🎫' },
  { name: 'Giveaway Support', emoji: '🎉' },
  { name: 'Custom Order', emoji: '🛠️' },
  { name: 'Other', emoji: '❓' },
];

async function ensureDefaultCategories(guildId) {
  const categories = [];
  for (const def of DEFAULT_CATEGORIES) {
    let category = await prisma.category.findFirst({ where: { guildId, name: def.name } });
    if (!category) {
      category = await prisma.category.create({ data: { guildId, name: def.name, emoji: def.emoji } });
    }
    categories.push(category);
  }
  return categories;
}

module.exports = { DEFAULT_CATEGORIES, ensureDefaultCategories };
