import { Context, Schema } from 'koishi'
import { ColorIdent } from './state'

const MAX_LEVEL = 9

export const name = 'color-ident'
export const using = ['canvas']

export interface Config {
  submission: 'strict' | 'loose' | 'mention'
}

export const Config: Schema<Config> = Schema.object({
  submission: Schema.union([
    Schema.const('strict').description('只接受指令输入'),
    Schema.const('loose').description('允许直接输入答案文本'),
    Schema.const('mention').description('仅在私聊或被提及时接受直接输入'),
  ]).role('radio').description('答案提交方式。').default('mention'),
})

export function apply(ctx: Context, config: Config) {
  const states: Record<string, ColorIdent> = {}

  ctx.middleware(async (session, next) => {
    const state = states[session.channelId]
    if (!state || config.submission === 'strict') return next()
    const { content, atSelf } = session.stripped
    if (!session.isDirect && !atSelf && config.submission !== 'loose') return next()
    if (!/^([a-z]\d|\d[a-z])$/i.test(content)) {
      return next()
    }
    return session.execute({
      name: 'color-ident',
      args: [content],
    })
  })

  ctx.command('color-ident [position]', '色彩识别测试')
    .alias('色彩识别')
    .option('quit', '-q  停止测试')
    .action(async ({ session, options }, position) => {
      const id = session.channelId

      if (!states[id]) {
        if (position || options.quit) {
          return '没有正在进行的色彩识别测试。输入“色彩识别”开始一轮测试。'
        }

        states[id] = new ColorIdent(0)
        await session.send('测试开始。')
        return await states[id].render(session)
      }

      if (options.quit) {
        delete states[id]
        return '测试已停止。'
      }

      const state = states[id]
      if (!position) return await states[id].render(session)

      if (!/^([a-z]\d|\d[a-z])$/i.test(position)) {
        return '请输入由字母+数字构成的坐标。'
      }

      let x: number, y: number
      if (position[0] > '9') {
        x = position.charCodeAt(0) % 32 - 1
        y = parseInt(position.slice(1)) - 1
      } else {
        x = position.charCodeAt(position.length - 1) % 32 - 1
        y = parseInt(position.slice(0, -1)) - 1
      }

      if (x !== state.line || y !== state.row) {
        return '回答错误。'
      }

      if (state.level === MAX_LEVEL) {
        delete states[id]
        return `恭喜 ${session.username} 成功通关，本次测试结束。`
      }

      states[id] = new ColorIdent(state.level + 1)
      await session.send(`恭喜 ${session.username} 回答正确，下面进入第 ${state.level + 2} 题。`)
      return await states[id].render(session)
    })
}
