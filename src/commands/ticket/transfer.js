const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const prisma = require('../../lib/prisma');
const { buildEmbed, getEmbedColor } = require('../../lib/embeds');
const { canManageTicket } = require('../../lib/permissions');
const { buildTicketEmbed, buildTicketActionRow } = require('../../lib/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer a ticket to another staff member')
    .addUserOption((option) => option.setName('user').setDescription('Staff member').setRequired(true)),
  async execute(interaction) {
    if (!interaction.guildId) {
      const embed = buildEmbed({ title: '❌ Guild Required', description: 'This command can only be used inside a server.', color: getEmbedColor('error') });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    try {
      const ticket = await prisma.ticket.findFirst({
        where: { guildId: interaction.guildId, channelId: interaction.channelId, status: 'OPEN' },
        include: { category: true },
      });

      if (!ticket) {
        const embed = buildEmbed({ title: '❌ No Ticket Here', description: 'This command must be used inside an open ticket channel.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (!(await canManageTicket(interaction.member, ticket))) {
        const embed = buildEmbed({ title: '⛔ Forbidden', description: 'Only staff can transfer tickets.', color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember || !(await canManageTicket(targetMember, ticket))) {
        const embed = buildEmbed({ title: '❌ Invalid Target', description: `<@${targetUser.id}> isn't staff for this ticket's category.`, color: getEmbedColor('error') });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      await prisma.ticket.update({ where: { id: ticket.id }, data: { staffUserId: targetUser.id } });
      ticket.staffUserId = targetUser.id;

      const guildConfig = await prisma.guild.findUnique({ where: { guildId: interaction.guildId } });
      const embed = buildTicketEmbed({ ticket, guildConfig });
      const row = buildTicketActionRow(ticket);

      await interaction.reply({
        embeds: [buildEmbed({ title: '🔁 Ticket Transferred', description: `This ticket was transferred to <@${targetUser.id}>.`, color: getEmbedColor('neutral') })],
      });
      await interaction.channel.send({ embeds: [embed], components: [row] }).catch(() => {});
    } catch (error) {
      console.error('Error in /transfer:', error);
      const fallback = buildEmbed({ title: '❌ Error', description: 'Unable to transfer that ticket.', color: getEmbedColor('error') });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [fallback], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ embeds: [fallback] });
      }
    }
  },
};
