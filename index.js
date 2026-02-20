const { Client, GatewayIntentBits, EmbedBuilder, Partials, REST, Routes, SlashCommandBuilder, AuditLogEvent } = require('discord.js');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('God-Tier Logger is Online and Running on Render!'));
app.listen(process.env.PORT || 3000, () => console.log('✅ Web Server is ready for UptimeRobot.'));

process.on('unhandledRejection', error => console.error('⚠️ [Anti-Crash]:', error));
process.on('uncaughtException', error => console.error('⚠️ [Anti-Crash]:', error));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildInvites, 
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.AutoModerationExecution
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User]
});

const invitesCache = new Map();
const voiceSessions = new Map();
let memoryLogChannel = null;

async function sendLog(guild, embed) {
    const targetChannelId = memoryLogChannel || process.env.LOG_CHANNEL_ID; 
    if (!targetChannelId) return;
    const channel = guild.channels.cache.get(targetChannelId);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

client.once('ready', async () => {
    console.log(`🔥 Logged in as ${client.user.tag}! God-Tier Mode is ON!`);
    
    client.guilds.cache.forEach(async (guild) => {
        try {
            const invites = await guild.invites.fetch();
            invitesCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
        } catch (err) { }
    });

    const commands = [
        new SlashCommandBuilder()
            .setName('setup')
            .setDescription('เปิดระบบ Log')
            .addChannelOption(option => option.setName('channel').setDescription('เลือกห้อง Log').setRequired(true))
    ];
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'start') {
        const channel = interaction.options.getChannel('channel');
        memoryLogChannel = channel.id;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ ระบบพระเจ้าทำงานชั่วคราว').setDescription(`จะส่ง Log ไปที่ <#${channel.id}>\n*(⚠️ แนะนำให้เอา ID ห้องนี้ไปใส่ใน \`LOG_CHANNEL_ID\` บน Render เพื่อให้จำถาวร)*`).setColor('#00ff00')] });
    }
});

client.on('inviteCreate', invite => {
    const guildInvites = invitesCache.get(invite.guild.id);
    if (guildInvites) guildInvites.set(invite.code, invite.uses);
});
client.on('inviteDelete', invite => {
    const guildInvites = invitesCache.get(invite.guild.id);
    if (guildInvites) guildInvites.delete(invite.code);
});

client.on('guildMemberAdd', async member => {
    const newInvites = await member.guild.invites.fetch().catch(() => null);
    const oldInvites = invitesCache.get(member.guild.id);
    let inviterText = "ไม่ทราบ (Vanity/ลิงก์ถูกลบ)";
    if (newInvites && oldInvites) {
        const usedInvite = newInvites.find(i => (oldInvites.get(i.code) || 0) < i.uses);
        if (usedInvite) {
            inviterText = `<@${usedInvite.inviter.id}> (โค้ด: \`${usedInvite.code}\`, เชิญมาแล้ว ${usedInvite.uses} คน)`;
            oldInvites.set(usedInvite.code, usedInvite.uses);
        }
    }
    sendLog(member.guild, new EmbedBuilder().setTitle('📥 สมาชิกใหม่').setColor('#00ff00').setDescription(`**ผู้ใช้:** <@${member.id}>\n**เชิญโดย:** ${inviterText}`).setThumbnail(member.user.displayAvatarURL()).setTimestamp());
});

client.on('guildMemberRemove', async member => {
    const logs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick }).catch(() => null);
    const kickLog = logs?.entries.first();
    if (kickLog && kickLog.target.id === member.id && Date.now() - kickLog.createdTimestamp < 5000) {
        sendLog(member.guild, new EmbedBuilder().setTitle('🥾 โดนเตะออกจากเซิร์ฟ!').setColor('#ff9900').setDescription(`**ผู้ใช้:** <@${member.id}>\n**เตะโดย:** <@${kickLog.executor.id}>\n**เหตุผล:** ${kickLog.reason || 'ไม่ระบุ'}`).setTimestamp());
    } else {
        sendLog(member.guild, new EmbedBuilder().setTitle('👋 ออกจากเซิร์ฟเวอร์').setColor('#808080').setDescription(`**ผู้ใช้:** <@${member.id}>`).setTimestamp());
    }
});

client.on('messageDelete', async message => {
    if (message.author?.bot) return;
    let executor = "ลบเอง";
    const logs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete }).catch(() => null);
    const deleteLog = logs?.entries.first();
    if (deleteLog && deleteLog.target.id === message.author?.id && Date.now() - deleteLog.createdTimestamp < 5000) executor = `<@${deleteLog.executor.id}> (แอดมินลบ)`;
    
    let attachments = message.attachments.size > 0 ? '\n\n**📸 ไฟล์แนบ/รูปภาพ:**\n' + message.attachments.map(a => a.url).join('\n') : '';
    sendLog(message.guild, new EmbedBuilder().setTitle('🗑️ ข้อความถูกลบ').setColor('#ff0000').setDescription(`**เจ้าของ:** <@${message.author?.id}>\n**คนลบ:** ${executor}\n**ห้อง:** <#${message.channel.id}>\n**ข้อความ:** ${message.content || '*ไม่มี*'}${attachments}`).setTimestamp());
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (oldMessage.author?.bot || oldMessage.content === newMessage.content) return;
    sendLog(newMessage.guild, new EmbedBuilder().setTitle('✏️ ข้อความถูกแก้').setColor('#ffff00').setDescription(`**ผู้ใช้:** <@${newMessage.author?.id}>\n**ห้อง:** <#${newMessage.channel.id}>\n**ก่อนแก้:** ${oldMessage.content || '*ไม่มี*'}\n**หลังแก้:** ${newMessage.content || '*ไม่มี*'}`).setTimestamp());
});

client.on('autoModerationActionExecution', action => {
    sendLog(action.guild, new EmbedBuilder().setTitle('🛡️ AutoMod จับกุมคนทำผิด!').setColor('#ff0000').setDescription(`**ผู้ทำผิด:** <@${action.userId}>\n**ห้อง:** <#${action.channelId}>\n**คำที่โดนแบน:** \`${action.matchedKeyword || 'ไม่ระบุ'}\`\n**เนื้อหา:** ${action.content}`).setTimestamp());
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!oldMember.isCommunicationDisabled() && newMember.isCommunicationDisabled()) {
        const logs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberUpdate }).catch(() => null);
        sendLog(newMember.guild, new EmbedBuilder().setTitle('🤐 โดนสั่งใบ้ (Timeout)').setColor('#ff0000').setDescription(`**ผู้ใช้:** <@${newMember.id}>\n**สั่งโดย:** <@${logs?.entries.first()?.executor.id || 'ไม่ทราบ'}>\n**หมดเวลา:** <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:R>`).setTimestamp());
    }
    if (oldMember.nickname !== newMember.nickname) {
        sendLog(newMember.guild, new EmbedBuilder().setTitle('🏷️ เปลี่ยนชื่อเล่น').setColor('#00ffff').setDescription(`**ผู้ใช้:** <@${newMember.id}>\n**เก่า:** ${oldMember.nickname || oldMember.user.username}\n**ใหม่:** ${newMember.nickname || newMember.user.username}`).setTimestamp());
    }
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        const logs = await newMember.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
        const executor = (logs?.entries.first() && Date.now() - logs.entries.first().createdTimestamp < 5000) ? `<@${logs.entries.first().executor.id}>` : 'ไม่ทราบ';
        const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        if (addedRoles.size > 0) sendLog(newMember.guild, new EmbedBuilder().setTitle('🔰 ยัดยศ').setColor('#00ff00').setDescription(`**คนได้ยศ:** <@${newMember.id}>\n**ยศ:** ${addedRoles.map(r => `<@&${r.id}>`).join(', ')}\n**คนให้:** ${executor}`).setTimestamp());
        if (removedRoles.size > 0) sendLog(newMember.guild, new EmbedBuilder().setTitle('🔻 ปลดยศ').setColor('#ff0000').setDescription(`**คนโดนปลด:** <@${newMember.id}>\n**ยศ:** ${removedRoles.map(r => `<@&${r.id}>`).join(', ')}\n**คนปลด:** ${executor}`).setTimestamp());
    }
});

client.on('roleUpdate', async (oldRole, newRole) => {
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        const logs = await newRole.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleUpdate }).catch(() => null);
        sendLog(newRole.guild, new EmbedBuilder().setTitle('⚠️ มีคนแอบแก้สิทธิ์ยศ!').setColor('#ff9900').setDescription(`**ยศที่ถูกแก้:** <@&${newRole.id}>\n**คนแก้:** <@${logs?.entries.first()?.executor.id || 'ไม่ทราบ'}>`).setTimestamp());
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const memberId = newState.member.id;

    if (!oldState.channelId && newState.channelId) {
        voiceSessions.set(memberId, Date.now());
        sendLog(newState.guild, new EmbedBuilder().setTitle('🎤 เข้าห้องเสียง').setColor('#00ff00').setDescription(`**ผู้ใช้:** <@${memberId}>\n**ห้อง:** <#${newState.channelId}>`).setTimestamp());
    }
    if (oldState.channelId && !newState.channelId) {
        let durationStr = 'ไม่ทราบเวลา';
        if (voiceSessions.has(memberId)) {
            const ms = Date.now() - voiceSessions.get(memberId);
            durationStr = `${Math.floor(ms / 60000)} นาที ${Math.floor((ms % 60000) / 1000)} วินาที`;
            voiceSessions.delete(memberId);
        }
        let executor = "ออกเอง";
        const logs = await oldState.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberDisconnect }).catch(() => null);
        if (logs?.entries.first() && Date.now() - logs.entries.first().createdTimestamp < 5000) executor = `<@${logs.entries.first().executor.id}> (แอดมินเตะ)`;
        sendLog(oldState.guild, new EmbedBuilder().setTitle('🔇 ออกจากห้องเสียง').setColor('#ff0000').setDescription(`**ผู้ใช้:** <@${memberId}>\n**ห้อง:** <#${oldState.channelId}>\n**ระยะเวลาที่สิง:** ${durationStr}\n**คนทำ:** ${executor}`).setTimestamp());
    }
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        let executor = "ย้ายเอง";
        const logs = await newState.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberMove }).catch(() => null);
        if (logs?.entries.first() && Date.now() - logs.entries.first().createdTimestamp < 5000) executor = `<@${logs.entries.first().executor.id}> (แอดมินลาก)`;
        sendLog(newState.guild, new EmbedBuilder().setTitle('🔄 ย้ายห้องเสียง').setColor('#ffff00').setDescription(`**ผู้ใช้:** <@${memberId}>\n**ย้ายจาก:** <#${oldState.channelId}> ➡️ **ไป:** <#${newState.channelId}>\n**คนทำ:** ${executor}`).setTimestamp());
    }
    if (!oldState.streaming && newState.streaming) {
        sendLog(newState.guild, new EmbedBuilder().setTitle('📺 เริ่มสตรีมหน้าจอ').setColor('#cc00ff').setDescription(`**ผู้ใช้:** <@${memberId}>\n**ห้อง:** <#${newState.channelId}>`).setTimestamp());
    }
    if (!oldState.selfVideo && newState.selfVideo) {
        sendLog(newState.guild, new EmbedBuilder().setTitle('📷 เปิดกล้อง Webcam').setColor('#cc00ff').setDescription(`**ผู้ใช้:** <@${memberId}>\n**ห้อง:** <#${newState.channelId}>`).setTimestamp());
    }
});

client.on('guildUpdate', async (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name || oldGuild.icon !== newGuild.icon) {
        const logs = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate }).catch(() => null);
        sendLog(newGuild, new EmbedBuilder().setTitle('🏢 เซิร์ฟเวอร์ถูกอัปเดต').setColor('#00ffff').setDescription(`**คนแก้:** <@${logs?.entries.first()?.executor.id || 'ไม่ทราบ'}>\n*(แอบเปลี่ยนชื่อ/เปลี่ยนโปรไฟล์)*`).setTimestamp());
    }
});

client.on('channelDelete', async channel => {
    const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    sendLog(channel.guild, new EmbedBuilder().setTitle('🗑️ ลบห้อง').setColor('#ff0000').setDescription(`**ห้อง:** ${channel.name}\n**คนลบ:** <@${logs?.entries.first()?.executor.id || 'ไม่ทราบ'}>`).setTimestamp());
});

client.on('guildBanAdd', async ban => {
    const logs = await ban.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberBanAdd }).catch(() => null);
    sendLog(ban.guild, new EmbedBuilder().setTitle('🔨 แบน!').setColor('#ff0000').setDescription(`**ผู้โดนแบน:** <@${ban.user.id}>\n**แบนโดย:** <@${logs?.entries.first()?.executor.id || 'ไม่ทราบ'}>\n**เหตุผล:** ${logs?.entries.first()?.reason || 'ไม่มี'}`).setTimestamp());
});

client.login(process.env.TOKEN);
