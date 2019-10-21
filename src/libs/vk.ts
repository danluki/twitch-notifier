import { VK } from 'vk-io'
import { info, error } from '../helpers/logs'
import { Twitch } from './twitch'
import { User } from '../models/User'
import { Channel } from '../models/Channel'
import { config } from '../helpers/config'
import { remove, chunk } from 'lodash'

const bot = new VK({
  token: config.vk.token
})
const twitch = new Twitch(config.twitch.clientId)

bot.updates.on('message', (ctx, next) => {
  if (ctx.senderId !== -187752469) {
    info(`Vk | New message from: ${ctx.senderId}, message: ${ctx.text}`)
  }

  return next()
})
bot.updates.hear(value => (value.startsWith('!подписка')), async (ctx) => {
  const [user] = await User.findOrCreate({ where: { id: ctx.senderId, service: 'vk' }, defaults: { follows: [], service: 'vk' } })
  const argument: string = ctx.text.split(' ')[1]
  if (!argument) {
    return ctx.reply('Вы должны указать на кого подписаться.')
  }
  if (/[^a-zA-Z0-9_]/gmu.test(argument)) {
    return ctx.reply('Имя стримера может содержать только "a-z", "0-9" и "_" символы')
  }
  try {
    const streamer = await twitch.getChannel(argument)
    await Channel.findOrCreate({ where: { id: streamer.id }, defaults: { username: streamer.login, online: false } })
    if (user.follows.includes(streamer.id)) {
      return ctx.reply(`Вы уже подписаны на ${streamer.displayName}.`)
    } else {
      user.follows.push(streamer.id)
      await user.update({ follows: user.follows })
      await ctx.reply(`Вы успешно подписались на ${streamer.displayName}!\nЧто бы отписаться напишите: !отписка ${streamer.displayName}`)
    }
  } catch (e) {
    error(e)
    ctx.reply(e.message)
  }
})


bot.updates.hear(value => (value.startsWith('!отписка')), async (ctx) => {
  const user = await User.findOne({ where: { id: ctx.senderId, service: 'vk' } })
  if (!user) {
    return ctx.reply('В данный момент вы ни на кого не подписаны.')
  }
  const argument: string = ctx.text.split(' ')[1]
  if (!argument) {
    return ctx.reply('Вы должны указать от кого отписаться.')
  }
  if (/[^a-zA-Z0-9_]/gmu.test(argument)) {
    return ctx.reply('Имя стримера может содержать только "a-z", "0-9" и "_" символы')
  }
  try {
    const streamer = await twitch.getChannel(argument)
    if (!user.follows.includes(streamer.id)) {
      return ctx.reply(`Вы не подписаны на канал ${streamer.displayName}.`)
    } else {
      remove(user.follows, (o: number) => o === streamer.id)
      await user.update({ follows: user.follows })
      await ctx.reply(`Вы успешно отписались от ${streamer.displayName}.`)
    }
  } catch (e) {
    error(e)
    ctx.reply(e.message)
  }
})

bot.updates.hear(value => (value.startsWith('!подписки')), async (ctx) => {
  const user = await User.findOne({ where: { id: ctx.senderId, service: 'vk' } })
  if (!user || !user.follows.length) {
    return ctx.reply('В данный момент вы ни на кого не подписаны.')
  } else {
    const channels = await twitch.getChannelsById(user.follows)
    const follows = channels.map(o => o.displayName).join(', ')
    ctx.reply(`Вы подписаны на: ${follows}`)
  }
})

bot.updates.hear(value => (value.startsWith('!команды')), async (ctx) => {
  ctx.reply(`
  На данный момент доступны следующие команды: 
  !подписка username
  !отписка username
  !подписки 
  !команды
  `)
})

export function say(userId: number | number[], message: string, attachment?: string) {
  info(`Send message to ${Array.isArray(userId) ? userId.join(', ') : userId}. message: ${message}`)
  const targets = Array.isArray(userId) ? userId : [userId]
  const chunks = chunk(targets, 100)

  for (const chunk of chunks) {
    bot.api.messages.send({
      random_id: Math.random() * (1000000000 - 9) + 10,
      user_ids: chunk,
      message,
      dont_parse_links: true
    })
  }
} 

bot.updates.start().then(() => info('VK bot connected.')).catch(console.error)