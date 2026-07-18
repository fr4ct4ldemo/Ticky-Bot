const { buildEmbed, getEmbedColor } = require('../src/lib/embeds');

describe('embed builder', () => {
  test('builds an embed with color and fields', () => {
    const embed = buildEmbed({ title: 'Test', description: 'Body', color: 0x123456, fields: [{ name: 'A', value: 'B' }] });
    expect(embed.data.title).toBe('Test');
    expect(embed.data.description).toBe('Body');
    expect(embed.data.color).toBe(0x123456);
    expect(embed.data.fields).toHaveLength(1);
  });

  test('provides fallback palette colors', () => {
    expect(getEmbedColor('success')).toBe(0x2ecc71);
    expect(getEmbedColor('unknown')).toBe(0x5865f2);
  });
});
