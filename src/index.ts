import { Context, Logger, Random, Schema, Session } from 'koishi'
import {} from '@koishijs/canvas'

const logger = new Logger('color-ident')

const MAX_LEVEL = 9

function randomSign() {
  return Random.int(2) * 2 - 1
}

function to256(scale: number) {
  scale *= 256
  return scale > 255 ? 'ff' : scale < 0 ? '00' : Math.floor(scale).toString(16).padStart(2, '0')
}

function createColor(r: number, g: number, b: number) {
  return `#${to256(r)}${to256(g)}${to256(b)}`
}

function hsv(h: number, s: number = 1, v: number = 1) {
  let c = v * s
  const hh = h / 60
  const m = v - c
  const x = c * (1 - Math.abs(hh % 2 - 1)) + m
  c = c + m
  switch (Math.floor(hh)) {
    case 0: return createColor(c, x, m)
    case 1: return createColor(x, c, m)
    case 2: return createColor(m, c, x)
    case 3: return createColor(m, x, c)
    case 4: return createColor(x, m, c)
    case 5: return createColor(c, m, x)
  }
}

const widthList = [2, 2, 2, 3, 3, 3, 3, 3, 3, 3]
const heightList = [2, 2, 2, 2, 2, 2, 2, 3, 3, 3]
const hDeltaList = [300, 270, 240, 210, 180, 160, 140, 120, 100, 80]
const sRangeList = [0.75, 0.7, 0.675, 0.65, 0.625, 0.6, 0.575, 0.55, 0.525, 0.5]
const vRangeList = [0.75, 0.7, 0.675, 0.65, 0.625, 0.6, 0.575, 0.55, 0.525, 0.5]

class ColorIdent {
  public width: number
  public height: number
  public line: number
  public row: number
  public bgColor: string
  public fgColor: string
  public grid: string[][] = []
  public base: string

  constructor(public level: number) {
    const h = Random.real(360)
    const s = Random.real(0.4, 0.9)
    const v = Random.real(0.4, 0.9)
    this.base = hsv(h, s, v)
    this.width = widthList[level]
    this.height = heightList[level]
    this.line = Math.floor(Math.random() * this.height)
    this.row = Math.floor(Math.random() * this.width)

    const inversed = s < 0.2 && v > 0.8
    this.bgColor = inversed ? '#000000' : '#ffffff'
    this.fgColor = inversed ? '#ffffff' : '#000000'

    for (let i = 0; i < this.height; i++) {
      this.grid.push([])
      for (let j = 0; j < this.width; j++) {
        if (i === this.line && j === this.row) {
          logger.debug('base = hsv(%d, %d, %d)', h, s, v)
          this.grid[i].push(this.base)
          continue
        }

        const factorH = Math.random() * 0.4 + 0.3
        const residue = 1 - factorH
        const factorS = residue * (Math.random() * 0.6 + 0.2)
        const factorV = residue - factorS

        let deltaS = factorS * sRangeList[level]
        if (deltaS + s > 1) {
          deltaS *= -1
        } else if (deltaS <= s) {
          deltaS *= randomSign()
        }
        let deltaV = factorV * vRangeList[level]
        if (deltaV + v > 1) {
          deltaV *= -1
        } else if (deltaV <= v) {
          deltaV *= randomSign()
        }

        const deltaH = factorH * hDeltaList[level] * randomSign()
        let biasedH = h + deltaH
        if (biasedH < 0) biasedH += 360
        else if (biasedH >= 360) biasedH -= 360
        logger.debug('biased = hsv(%d, %d, %d)', biasedH, s + deltaS, v + deltaV)
        this.grid[i].push(hsv(biasedH, s + deltaS, v + deltaV))
      }
    }
  }

  async render(session: Session) {
    const scale = 256
    const el = await session.app.canvas.render((this.width + 1.5) * scale, (this.height + 1.5) * scale, (ctx) => {
      ctx.fillStyle = this.bgColor
      ctx.fillRect(0, 0, (this.width + 1.5) * scale, (this.height + 1.5) * scale)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '128px sans-serif'
      ctx.fillStyle = this.fgColor
      for (let index = 1; index <= this.width; ++index) {
        ctx.fillText(String(index), (index + 0.5) * scale, 0.6 * scale)
      }
      for (let index = 1; index <= this.height; ++index) {
        ctx.fillText(String.fromCharCode(index + 64), 0.6 * scale, (index + 0.5) * scale)
      }

      const markSize = 0.4
      for (let i = 0; i < this.height; i += 1) {
        for (let j = 0; j < this.width; j += 1) {
          const cx = j + 1.5
          const cy = i + 1.5
          ctx.fillStyle = this.grid[i][j]
          ctx.beginPath()
          ctx.moveTo((cx - markSize) * scale, (cy - markSize) * scale)
          ctx.lineTo((cx + markSize) * scale, (cy - markSize) * scale)
          ctx.lineTo((cx + markSize) * scale, (cy + markSize) * scale)
          ctx.lineTo((cx - markSize) * scale, (cy + markSize) * scale)
          ctx.closePath()
          ctx.fill()
        }
      }
    })
    return [`请输入最接近 ${this.base} 的颜色的坐标。`, el]
  }
}

export const name = 'color-ident'
export const using = ['canvas']

export interface Config {
  middleware: 'disabled' | 'enabled' | 'restricted'
}

export const Config: Schema<Config> = Schema.object({
  middleware: Schema.union([
    Schema.const('disabled').description('只接受指令输入。'),
    Schema.const('enabled').description('接受任何中间件输入。'),
    Schema.const('restricted').description('仅在私聊或被提及时接受中间件输入。'),
  ]).role('radio').description('中间件模式。').default('restricted'),
})

export function apply(ctx: Context, config: Config) {
  const states: Record<string, ColorIdent> = {}

  ctx.middleware(async (session, next) => {
    const state = states[session.channelId]
    if (!state || config.middleware === 'disabled') return next()
    const { content, atSelf } = session.stripped
    if (!session.isDirect && !atSelf && config.middleware !== 'enabled') return next()
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
      if (!position) return '请输入坐标。'

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
