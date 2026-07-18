const { EmbedBuilder } = require('discord.js');

function buildEmbed({
  title,
  description,
  color,
  fields = [],
  footerText,
  footerIconUrl,
  thumbnailUrl,
  authorName,
  authorIconUrl,
  timestamp = new Date(),
}) {
  const embed = new EmbedBuilder()
    .setColor(color ?? 0x5865f2)
    .setTimestamp(timestamp);

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (authorName) embed.setAuthor({ name: authorName, iconURL: authorIconUrl });
  if (footerText) embed.setFooter({ text: footerText, iconURL: footerIconUrl });
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  if (fields.length) {
    embed.addFields(fields.map((field) => ({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: Boolean(field.inline),
    })));
  }

  return embed;
}

function getEmbedColor(kind, fallback = 0x5865f2) {
  const palette = {
    success: 0x2ecc71,
    error: 0xe74c3c,
    warning: 0xf1c40f,
    neutral: 0x5865f2,
    close: 0xe67e22,
  };

  return palette[kind] ?? fallback;
}

module.exports = { buildEmbed, getEmbedColor };
