import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Gift, Sparkles, X } from 'lucide-react'
import { api, dmy, ScratchCardT } from './api'
import { N } from './lib'
import { cx, Empty, toast, useBackClose } from './ui'
import { ScreenHead } from './home'

/* Подарочные (скретч-) карточки. Приз разыгрывается на сервере (scratch_card) — подделать с телефона нельзя. */
export const SRC: Record<string, string> = { welcome: 'Подарок за регистрацию', purchase: 'За покупку абонемента', manual: 'Подарок от Formula', birthday: 'С днём рождения!', referral: 'За приглашение друга' }
type Result = { won: boolean; title: string; bonus: number; code: string | null; expires_at: string | null; status: string }
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const crownSrc = `${import.meta.env.BASE_URL}crown.webp`
// подарок из Blender: два слоя одного кадра — открытая коробка со свечением внутри и крышка с бантом
const giftBody = `${import.meta.env.BASE_URL}gift-body.webp`, giftLid = `${import.meta.env.BASE_URL}gift-lid.webp`

/* ---------- частицы: золотая пыль из-под пальца и салют при выигрыше ---------- */
type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; rot: number; vr: number; rect: boolean }
const GOLD = ['#FFD21C', '#F5B300', '#FFE89A', '#FFF6D6', '#E0A526']
function useParticles() {
  const cv = useRef<HTMLCanvasElement>(null), parts = useRef<P[]>([]), raf = useRef(0)
  const loop = () => {
    const c = cv.current; if (!c) return
    const g = c.getContext('2d')!, dpr = Math.min(devicePixelRatio || 1, 2)
    if (c.width !== innerWidth * dpr) { c.width = innerWidth * dpr; c.height = innerHeight * dpr }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight)
    parts.current = parts.current.filter(p => p.life < p.max)
    for (const p of parts.current) {
      p.life++; p.vy += p.rect ? 0.16 : 0.12; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr
      g.globalAlpha = Math.max(0, 1 - p.life / p.max); g.fillStyle = p.color
      if (p.rect) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.restore() }
      else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill() }
    }
    g.globalAlpha = 1
    raf.current = parts.current.length ? requestAnimationFrame(loop) : 0
  }
  const kick = () => { if (!raf.current) raf.current = requestAnimationFrame(loop) }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const dust = (x: number, y: number) => {
    if (reduced()) return
    for (let i = 0; i < 3; i++) parts.current.push({ x: x + (Math.random() - .5) * 18, y: y + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 2.2, vy: -Math.random() * 1.6, life: 0, max: 26 + Math.random() * 18, size: 1 + Math.random() * 1.8, color: GOLD[(Math.random() * GOLD.length) | 0], rot: 0, vr: 0, rect: false })
    kick()
  }
  const burst = (x: number, y: number) => {
    if (reduced()) return
    for (let i = 0; i < 170; i++) { const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9
      parts.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, life: 0, max: 70 + Math.random() * 50, size: 6 + Math.random() * 7, color: i % 11 === 0 ? '#C8203A' : GOLD[(Math.random() * GOLD.length) | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, rect: true }) }
    kick()
  }
  const sparkle = (x: number, y: number) => {   // золотые искры вверх из открытого подарка
    if (reduced()) return
    for (let i = 0; i < 90; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 1.5, v = 5 + Math.random() * 9
      parts.current.push({ x: x + (Math.random() - .5) * 60, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 45 + Math.random() * 40, size: 1.4 + Math.random() * 2.6, color: GOLD[(Math.random() * GOLD.length) | 0], rot: 0, vr: 0, rect: false }) }
    kick()
  }
  return { cv, dust, burst, sparkle }
}

/* ---------- золотая фольга ---------- */
function paintFoil(c: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight
  c.width = w * dpr; c.height = h * dpr
  const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const lg = g.createLinearGradient(0, 0, w, h)
  ;[[0, '#7c5210'], [.22, '#f3cd72'], [.46, '#b07d24'], [.7, '#ffe7a6'], [1, '#93641a']].forEach(([o, col]) => lg.addColorStop(o as number, col as string))
  g.fillStyle = lg; g.fillRect(0, 0, w, h)
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(255,255,255,${Math.random() * .07})`; g.fillRect(0, y, w, 1); g.fillStyle = `rgba(60,35,0,${Math.random() * .06})`; g.fillRect(0, y + 1, w, 1) }
  g.globalAlpha = .1; g.strokeStyle = '#4a2f05'; g.lineWidth = 1
  for (let x = -h; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke() }
  g.globalAlpha = 1; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = 'rgba(58,36,4,.88)'; g.font = '800 21px Inter, system-ui, sans-serif'; g.fillText('СОТРИ ПАЛЬЦЕМ', w / 2, h / 2 - 9)
  g.fillStyle = 'rgba(58,36,4,.62)'; g.font = '600 12px Inter, system-ui, sans-serif'; g.fillText('и узнай свой приз', w / 2, h / 2 + 15)
  for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, Math.random() * 1.6 + .6, 0, 7); g.fill() }
}

/* ---------- полноэкранная карточка ---------- */
export function ScratchOverlay({ card, onClose }: { card: ScratchCardT; onClose: () => void }) {
  useBackClose(onClose)
  const already = !!card.seen_at && !!card.drawn_at
  const [res, setRes] = useState<Result | null>(already ? { won: !!card.won, title: card.prize_title ?? '', bonus: card.prize_bonus, code: card.status === 'opened' ? card.code : null, expires_at: card.expires_at, status: card.status } : null)
  const [revealed, setRevealed] = useState(already), [progress, setProgress] = useState(0), [wantReveal, setWantReveal] = useState(false)
  const foil = useRef<HTMLCanvasElement>(null), area = useRef<HTMLDivElement>(null), fx = useParticles()
  const drawing = useRef(false), last = useRef<[number, number] | null>(null), moves = useRef(0)
  // новая карточка сначала появляется в подарке: коробка падает, трясётся, по нажатию открывается — и карточка вылетает
  const fromGift = useRef(!already && !reduced()), giftRef = useRef<HTMLButtonElement>(null)
  const [stage, setStage] = useState<'gift' | 'opening' | 'card'>(fromGift.current ? 'gift' : 'card'), [giftGone, setGiftGone] = useState(!fromGift.current)
  const openGift = () => {
    if (stage !== 'gift') return
    setStage('opening'); navigator.vibrate?.([12, 40, 12, 40, 30])
    setTimeout(() => { const r = giftRef.current?.getBoundingClientRect(); if (r) fx.sparkle(r.left + r.width / 2, r.top + r.height * 0.34) }, 470)
    setTimeout(() => setStage('card'), 680); setTimeout(() => setGiftGone(true), 1400)
  }

  useEffect(() => { if (!already) api.scratchCard(card.id).then(setRes).catch(e => { toast(e.message, false); onClose() }) }, []) // eslint-disable-line
  useEffect(() => { if (!revealed && foil.current) paintFoil(foil.current) }, [revealed, stage])
  // стёрто больше половины и приз уже получен с сервера → открываем
  useEffect(() => {
    if (!wantReveal || !res || revealed) return
    setRevealed(true); api.cardSeen(card.id).catch(() => {})
    navigator.vibrate?.(res.won ? [30, 40, 60] : 20)
    const r = area.current?.getBoundingClientRect(); if (res.won && r) setTimeout(() => fx.burst(r.left + r.width / 2, r.top + r.height / 2), 120)
  }, [wantReveal, res, revealed]) // eslint-disable-line

  const pos = (e: React.PointerEvent) => { const r = foil.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number] }
  const scratch = (e: React.PointerEvent) => {
    const c = foil.current; if (!c || !drawing.current) return
    const g = c.getContext('2d')!, [x, y] = pos(e), [lx, ly] = last.current ?? [x, y]
    g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 38
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(x, y); g.stroke(); last.current = [x, y]
    fx.dust(e.clientX, e.clientY)
    if (++moves.current % 7 === 0) {
      const d = g.getImageData(0, 0, c.width, c.height).data; let clear = 0, n = 0
      for (let i = 3; i < d.length; i += 4 * 24) { n++; if (d[i] < 40) clear++ }
      const p = clear / n; setProgress(p); if (p > 0.5) setWantReveal(true)
    }
  }
  const won = res?.won
  return createPortal(<div className="fixed inset-0 z-[80] overflow-y-auto sc-backdrop" role="dialog" aria-label="Подарочная карточка">
    <div className={cx('sc-rays', revealed && won && 'sc-rays-win')} aria-hidden />
    <canvas ref={fx.cv} className="fixed inset-0 w-full h-full pointer-events-none z-[2]" aria-hidden />
    <button onClick={onClose} aria-label="Закрыть" className="fixed z-[3] right-4 top-[max(1rem,env(safe-area-inset-top))] grid place-items-center w-10 h-10 rounded-full bg-white/10 text-white backdrop-blur"><X size={18} /></button>
    <div className="relative z-[1] min-h-full flex flex-col items-center justify-center px-5 py-16">
      <div className="sc-title text-center mb-5"><div className="inline-flex items-center gap-1.5 text-gold text-[13px] font-semibold"><Sparkles size={14} />Подарочная карточка</div>
        <h2 className="text-2xl font-bold mt-1">{SRC[card.source] ?? 'Подарок'}</h2>{card.note && card.source !== 'welcome' && <div className="text-mute text-[13px] mt-0.5">{card.note}</div>}</div>
      <div className="relative w-[min(86vw,340px)] min-h-[340px] flex flex-col">
      {!giftGone && <button ref={giftRef} type="button" onClick={openGift} aria-label="Открыть подарок" className={cx('gb', stage === 'opening' && 'gb-opening', stage === 'card' && 'gb-out')}>
        <span className="gb-in"><span className="gb-glow" aria-hidden /><span className="gb-shadow" aria-hidden />
          <span className="gb-box"><img src={giftBody} alt="" draggable={false} /><span className="gb-beam" aria-hidden /><img src={giftLid} alt="" draggable={false} className="gb-lid" /></span></span>
        {stage === 'gift' && <span className="gb-hint">Нажми на подарок</span>}
      </button>}
      {stage === 'card' && <div className={cx('sc-card relative w-full rounded-[28px] p-5 pb-6', fromGift.current && 'sc-fly', revealed && won && 'sc-card-win')}>
        <div className="flex items-center justify-between mb-4"><img src={crownSrc} alt="" className="h-9 w-auto drop-shadow-[0_4px_10px_rgba(255,190,40,.35)]" /><span className="text-[11px] font-semibold tracking-[0.2em] text-gold/80">FORMULA BONUS</span></div>
        <div ref={area} className="relative h-[210px] rounded-2xl overflow-hidden border border-gold/25 bg-[radial-gradient(120%_100%_at_50%_0%,#2a1f06_0%,#0d0b06_70%)]">
          <div className="absolute inset-0 grid place-items-center text-center px-5">
            {!res ? <div className="w-8 h-8 rounded-full border-2 border-gold/30 border-t-gold animate-spin" /> : won
              ? <div className={cx(revealed && 'sc-pop')}><Gift size={34} className="mx-auto text-gold drop-shadow-[0_0_14px_rgba(255,210,28,.7)]" /><div className="mt-2 text-[26px] leading-tight font-extrabold sc-gold-text">{res.title}</div>{res.bonus > 0 && <div className="text-[13px] text-gold/80 mt-1">+{N(res.bonus)} бонусов</div>}</div>
              : <div className={cx(revealed && 'sc-pop')}><div className="text-4xl">🍀</div><div className="mt-2 text-xl font-bold">Повезёт в следующий раз</div></div>}
          </div>
          {!already && <canvas ref={foil} onPointerDown={e => { drawing.current = true; last.current = pos(e); (e.target as Element).setPointerCapture(e.pointerId); scratch(e) }} onPointerMove={scratch}
            onPointerUp={() => { drawing.current = false; last.current = null }} onPointerCancel={() => { drawing.current = false; last.current = null }}
            className={cx('absolute inset-0 w-full h-full touch-none cursor-grab transition-all duration-700', revealed && 'opacity-0 scale-110 blur-sm pointer-events-none')} />}
        </div>
        {!revealed && <div className="mt-4"><div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round(progress / .5 * 100))}%` }} /></div>
          <button onClick={() => setWantReveal(true)} className="mt-3 w-full text-center text-xs text-mute underline-offset-2 hover:underline">Открыть без стирания</button></div>}
      </div>}
      </div>
      {revealed && res && <div className="sc-result w-[min(86vw,340px)] mt-5 text-center">
        {won && res.code ? <div className="rounded-2xl border border-gold/30 bg-black/60 p-4"><div className="text-[13px] text-mute">Покажите код на ресепшене</div><div className="text-4xl font-extrabold tracking-[0.25em] text-gold my-1.5">{res.code}</div>{res.expires_at && <div className="text-xs text-mute">Действует до {dmy(res.expires_at)}</div>}</div>
          : won ? <div className="text-[15px] text-gold">Бонусы уже на вашем балансе ✨</div>
          : <div className="text-[13px] text-mute">Новые карточки приходят за покупки абонемента и в акциях клуба.</div>}
        <button onClick={onClose} className="press mt-4 w-full h-12 rounded-2xl bg-gold text-black font-bold">{won ? 'Супер!' : 'Понятно'}</button></div>}
    </div>
  </div>, document.body)
}

/* ---------- экран «Подарочные карточки» ---------- */
export function CardsScreen({ cards, open }: { cards: ScratchCardT[] | null; open: (c: ScratchCardT) => void }) {
  const state = (c: ScratchCardT): [string, string] => !c.drawn_at || !c.seen_at ? ['new', 'Сотри меня'] : c.won === false ? ['lose', 'Без приза'] : c.status === 'opened' && c.expires_at && new Date(c.expires_at) < new Date() ? ['exp', 'Срок истёк'] : c.status === 'opened' ? ['code', `Код ${c.code}`] : c.status === 'expired' ? ['exp', 'Срок истёк'] : ['done', c.prize_bonus ? 'Зачислено ✓' : 'Получено ✓']
  return <div className="max-w-lg mx-auto">
    <ScreenHead title="Подарочные карточки" sub="Стирайте и забирайте призы" />
    {cards === null ? <Empty>Загрузка…</Empty> : !cards.length ? <div className="rise card-dark rounded-2xl p-6 text-center"><Gift size={32} className="mx-auto text-gold" /><div className="font-semibold mt-3">Карточек пока нет</div><div className="text-[13px] text-mute mt-1">Они приходят за регистрацию, покупку абонемента и в акциях клуба.</div></div>
      : <div className="grid grid-cols-2 gap-3">{cards.map((c, i) => { const [k, label] = state(c)
        return <button key={c.id} onClick={() => open(c)} style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }} className={cx('rise press relative overflow-hidden rounded-2xl p-4 text-left aspect-[4/5] flex flex-col', k === 'new' ? 'sc-mini-new text-black' : 'card-dark', (k === 'lose' || k === 'exp') && 'opacity-60')}>
          {k === 'new' && <span className="sc-mini-shine" aria-hidden />}
          <span className={cx('text-[11px] font-semibold', k === 'new' ? 'text-black/60' : 'text-mute')}>{SRC[c.source] ?? 'Подарок'}</span>
          <span className="flex-1 grid place-items-center">{k === 'new' ? <Gift size={40} className="drop-shadow" /> : <span className="text-center font-bold leading-tight">{c.prize_title}</span>}</span>
          <span className={cx('text-[13px] font-bold', k === 'new' ? '' : k === 'code' ? 'text-gold tracking-wider' : 'text-mute')}>{label}</span>
          {k === 'code' && c.expires_at && <span className="text-[11px] text-mute">до {dmy(c.expires_at)}</span>}
        </button> })}</div>}
  </div>
}

/* баннер на главной (в существующий слот banner, сам экран главной не меняется) */
export const CardsBanner = ({ count, onOpen }: { count: number; onOpen: () => void }) =>
  <button onClick={onOpen} className="rise press sc-banner relative overflow-hidden w-full mb-3 text-left rounded-2xl px-4 py-3 flex items-center gap-3 text-black">
    <span className="sc-mini-shine" aria-hidden /><Gift size={22} className="shrink-0" />
    <span className="flex-1"><b>{count === 1 ? 'У вас подарочная карточка' : `У вас ${count} ${[2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'подарочные карточки' : 'подарочных карточек'}`}</b><span className="block text-[13px] text-black/70">Сотрите и узнайте приз</span></span><span className="font-bold">→</span></button>
