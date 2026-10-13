import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight, Clock, Gift, History, LifeBuoy, LogOut, Megaphone, RefreshCw, Share2, ShoppingBag, Snowflake, User, Users, Zap } from 'lucide-react'
import { api, dmy, Snap } from './api'
import { logout, N } from './lib'
import { Badge, Btn, cx, Empty, Install, Modal, toast, useAsync } from './ui'

/* ---------- общие элементы клиентского интерфейса ---------- */
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
export function useCountUp(v: number) {
  const [n, setN] = useState(reduced() ? v : 0), prev = useRef(reduced() ? v : 0)
  useEffect(() => {
    if (reduced()) { setN(v); prev.current = v; return }
    const from = prev.current, t0 = performance.now(), d = 800; let raf = 0
    const step = (t: number) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); setN(Math.round(from + (v - from) * e)); if (k < 1) raf = requestAnimationFrame(step); else prev.current = v }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [v])
  return n
}
// концентрические кольца в углу жёлтой карточки (как в референсе)
export const Rings = () => <svg aria-hidden className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 opacity-[.13]" viewBox="0 0 200 200" fill="none" stroke="#000" strokeWidth="9">
  {[90, 66, 42, 18].map(r => <circle key={r} cx="100" cy="100" r={r} />)}</svg>
const delay = (i: number) => ({ animationDelay: `${i * 60}ms` })
export const ScreenHead = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) =>
  <div className="rise flex items-start justify-between gap-3 mb-5"><div><h1 className="text-[26px] leading-tight font-bold tracking-tight">{title}</h1>{sub && <div className="text-mute mt-0.5">{sub}</div>}</div>{right && <div className="flex items-center gap-1 shrink-0">{right}</div>}</div>
const IconTile = ({ children }: { children: ReactNode }) => <span className="grid place-items-center w-11 h-11 rounded-xl bg-gold/15 text-gold shrink-0">{children}</span>
export const RoundBtn = ({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) =>
  <button onClick={onClick} aria-label={label} className="press grid place-items-center w-10 h-10 rounded-full border border-line bg-surface text-[#F5F5F5] hover:bg-hover">{children}</button>

/* ---------- Главная ---------- */
/* фон карточек «Ваш баланс» / «Тебе +2 000»: жёлтые глянцевые складки + 3D-графика справа */
const CardArt = ({ img, cls }: { img: string; cls: string }) => <>
  <span aria-hidden className="bal-art pointer-events-none absolute inset-0" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}bal-bg.webp)` }} />
  <span aria-hidden className="bal-glow pointer-events-none absolute right-[2%] top-[4%] w-40 h-40 rounded-full" />
  <img src={`${import.meta.env.BASE_URL}${img}`} alt="" aria-hidden draggable={false} className={cx('bal-crown pointer-events-none select-none absolute', cls)} />
</>
/* Карточка баланса: размер суммы подбирается так, чтобы цифры всегда помещались левее короны */
function useBalanceFit(text: string) {
  const card = useRef<HTMLButtonElement>(null), probe = useRef<HTMLSpanElement>(null), [fs, setFs] = useState(42)
  useLayoutEffect(() => {
    const c = card.current, p = probe.current; if (!c || !p) return
    const run = () => { const crown = c.querySelector<HTMLElement>('.bal-crown'), pad = parseFloat(getComputedStyle(c).paddingLeft) || 24
      const room = (crown ? crown.offsetLeft : c.clientWidth) - pad - 4, w = p.offsetWidth
      if (w > 0 && room > 0) setFs(Math.max(24, Math.min(42, Math.floor(56 * room / w)))) }
    run(); if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(run); ro.observe(c); ro.observe(p); return () => ro.disconnect()   // и при смене ширины, и после загрузки шрифта
  }, [text])
  return { card, probe, fs }
}
export function HomeScreen({ s, go, right, banner, recent }: { s: Snap; go: (tab: string) => void; right: ReactNode; banner: ReactNode; recent: ReactNode }) {
  const bal = useCountUp(s.balance), fit = useBalanceFit(N(s.balance)), [batches, setBatches] = useState(false), [promos, setPromos] = useState(false)
  const pend = s.batches.some(b => b.pending), first = s.batches.filter(b => b.expires).sort((a, b) => +new Date(a.expires!) - +new Date(b.expires!))[0]
  const life = first ? `Действуют до ${dmy(first.expires!)} · ${first.days} дн.` : pend ? 'Активируются при первом использовании' : 'Бонусы действуют 90 дней'
  const left = s.daysLeft, mStatus = left === null ? null : s.frozenUntil ? ['Заморожен', 'bg-sky-400/15 text-sky-300'] : left <= 0 ? ['Истёк', 'bg-red-500/15 text-red-300'] : left <= 7 ? [`${left} дн.`, 'bg-amber-400/15 text-amber-300'] : ['Активен', 'bg-emerald-500/15 text-emerald-300']
  const promo = s.promos[0]
  return <div className="max-w-lg mx-auto">
    <ScreenHead title="Formula Bonus" sub="Твои бонусы и награды" right={right} />
    {banner}
    <button ref={fit.card} onClick={() => setBatches(true)} style={delay(1)} className="rise press bal-card relative overflow-hidden w-full text-left rounded-[24px] px-5 pt-4 pb-3.5">
      <CardArt img="crown.webp" cls="right-[3%] top-[8%] w-[34%] max-w-[150px]" />
      <div className="relative z-[1] text-[14px] font-medium text-white/85">Ваш баланс</div>
      <span ref={fit.probe} aria-hidden className="bal-num invisible absolute left-0 top-0 text-[56px] leading-none font-extrabold tracking-tight">{N(s.balance)}</span>
      <div className="bal-num relative z-[1] h-10 mt-0.5 flex items-end" style={{ fontSize: fit.fs }}><span className="leading-none font-extrabold tracking-tight text-white">{N(bal)}</span></div>
      <div className="relative z-[1] text-[20px] leading-6 mt-0.5 font-extrabold text-gold">Bonus</div>
      <div className="relative z-[1] mt-2 flex items-center gap-2"><span className="bal-pill inline-flex items-center gap-2 min-w-0 rounded-full text-white pl-1.5 pr-3.5 py-1.5 text-[clamp(11px,3.4vw,13px)] font-semibold">
        <span className="grid place-items-center w-6 h-6 rounded-full border-2 border-gold text-gold shrink-0"><Clock size={12} strokeWidth={2.5} /></span><span className="min-w-0">{life.split(' · ')[0]}{life.includes(' · ') && <span className="whitespace-nowrap"> · {life.split(' · ')[1]}</span>}</span></span>
        <ChevronRight size={20} className="ml-auto shrink-0 text-white/85" /></div>
      {s.reserved > 0 && <div className="relative z-[1] mt-2 text-[13px] text-white/70">Зарезервировано под заказ: {N(s.reserved)}</div>}
    </button>

    <button onClick={() => go('renew')} style={delay(2)} className="rise press card-dark w-full text-left rounded-3xl p-4 mt-3 flex items-center gap-4">
      <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gold/15 text-gold shrink-0"><Zap size={26} fill="currentColor" /></span>
      <span className="flex-1 min-w-0"><span className="block text-[13px] text-mute">Абонемент</span><span className="block text-xl font-bold truncate">{s.plan ?? 'Нет активного'}</span>
        {s.endsOn && <span className="block text-xs text-mute mt-0.5">до {dmy(s.endsOn)}{left !== null && left > 0 ? ` · осталось ${left} дн.` : ''}</span>}</span>
      {mStatus ? <span className={cx('rounded-full px-3 py-1.5 text-[13px] font-semibold', mStatus[1])}>{mStatus[0]}</span> : <span className="rounded-full px-3 py-1.5 text-[13px] font-semibold bg-gold text-black">Выбрать</span>}
    </button>

    <div style={delay(3)} className="rise grid grid-cols-3 gap-3 mt-3">{([['store', 'Магазин', ShoppingBag], ['friends', 'Друзья', Users], ['history', 'История', History]] as const).map(([k, l, I]) =>
      <button key={k} onClick={() => go(k)} className="press card-dark rounded-2xl p-3.5 pt-4 text-left"><IconTile><I size={20} /></IconTile><div className="mt-5 font-semibold text-[15px]">{l}</div></button>)}</div>

    <div style={delay(4)} className="rise flex items-center justify-between mt-7 mb-3"><h2 className="text-xl font-bold">Предложения</h2>{s.promos.length > 0 && <button onClick={() => setPromos(true)} className="text-gold font-semibold text-[13px]">Все</button>}</div>
    <div style={delay(5)} className="rise space-y-3">
      <button onClick={() => setPromos(true)} className="press card-dark relative overflow-hidden w-full text-left rounded-2xl p-5 flex items-center gap-4">
        <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-gold" />
        <span className="flex-1 min-w-0"><span className="block text-lg font-bold">{promo?.title ?? 'Акции клуба'}</span><span className="block text-[13px] text-mute mt-0.5 line-clamp-2">{promo?.body || 'Специальные предложения для клиентов Formula'}</span></span>
        <span className="grid place-items-center w-12 h-12 rounded-full bg-gold text-black shrink-0">{promo?.value ? <b className="text-[13px]">{promo.value}</b> : <Zap size={22} fill="currentColor" />}</span>
      </button>
      <button onClick={() => go('friends')} className="press card-dark w-full text-left rounded-2xl p-5 flex items-center gap-4">
        <span className="flex-1"><span className="block text-lg font-bold">Приглашай друзей</span><span className="block text-[13px] text-mute mt-0.5">и получай +2 000 бонусов</span></span><Users size={24} className="text-gold" /></button>
    </div>
    <div style={delay(6)} className="rise mt-7">{recent}</div>

    {batches && <Modal title="Мои бонусы" onClose={() => setBatches(false)}>{s.batches.length ? <div className="divide-y divide-line -my-2">{s.batches.map(b => <div key={b.id} className="py-3"><div className="font-medium">{N(b.amount)} · {b.label}</div><div className="text-xs text-mute">{b.pending ? 'Активируются при первом использовании' : `Действуют до ${dmy(b.expires!)} · осталось ${b.days} дн.`}</div></div>)}</div> : <Empty>Бонусов пока нет — они начисляются за абонементы, покупки и друзей</Empty>}
      <Btn className="w-full" onClick={() => { setBatches(false); go('store') }}>Потратить в магазине</Btn></Modal>}
    {promos && <Modal title="Акции клуба" onClose={() => setPromos(false)}>{s.promos.length ? <div className="divide-y divide-line -my-2">{s.promos.map(p => <div key={p.id} className="py-3 flex justify-between gap-3"><div><div className="font-medium">{p.title}</div>{p.body && <div className="text-[13px] text-mute">{p.body}</div>}{p.ends_on && <div className="text-xs text-mute mt-0.5">до {dmy(p.ends_on)}</div>}</div>{p.value && <Badge t="gold">{p.value}</Badge>}</div>)}</div> : <Empty>Сейчас акций нет — мы пришлём уведомление, когда появятся</Empty>}</Modal>}
  </div>
}

/* ---------- Друзья (рефералы) ---------- */
export const inviteLink = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?ref=${encodeURIComponent(code)}`
export function FriendsScreen({ s, back }: { s: Snap; back: () => void }) {
  const [r] = useAsync(api.myReferrals), [busy, setBusy] = useState(false), link = inviteLink(s.code)
  const text = `Тренируюсь в Formula — присоединяйся! Регистрируйся по моему приглашению: ${link}`
  const share = async () => {
    setBusy(true)
    try {
      if (navigator.share) { await navigator.share({ title: 'Приглашение в Formula', text, url: link }); return }
      await navigator.clipboard.writeText(text); toast('Приглашение скопировано — отправьте другу')
    } catch (e: any) { if (e?.name !== 'AbortError') { try { await navigator.clipboard.writeText(text); toast('Приглашение скопировано — отправьте другу') } catch { toast('Не удалось поделиться. Скопируйте код вручную', false) } } }
    finally { setBusy(false) }
  }
  const copyCode = () => navigator.clipboard?.writeText(s.code).then(() => toast('Код скопирован')).catch(() => {})
  const steps: [string, string][] = [['Отправь приглашение другу', 'Поделись ссылкой или кодом из приложения'], ['Друг совершает покупку', 'Первая покупка в клубе'], ['Получи бонусы', '+2 000 на твой баланс']]
  const friends = r?.friends ?? [], done = friends.filter(f => f.status === 'confirmed').length, earned = useCountUp(r?.earned ?? 0)   // живой счётчик на карточке
  return <div className="max-w-lg mx-auto">
    <ScreenHead title="Пригласи друга" sub="Делись клубом — получай бонусы" right={<RoundBtn onClick={back} label="Назад"><ChevronRight size={18} className="rotate-180" /></RoundBtn>} />
    <div style={delay(1)} className="rise bal-card relative overflow-hidden rounded-[24px] px-5 pt-4 pb-3.5">
      <CardArt img="people.webp" cls="right-[3%] top-[4%] w-[36%] max-w-[176px]" />
      <div className="relative z-[1] text-[14px] font-medium text-white/85">Тебе</div>
      <div className="relative z-[1] h-10 mt-0.5 flex items-end text-[42px] leading-none font-extrabold tracking-tight text-white">+2 000</div>
      <div className="relative z-[1] text-[20px] leading-6 mt-0.5 font-extrabold text-gold">Bonus</div>
      <div className="relative z-[1] mt-2"><span className="bal-pill inline-flex items-center gap-2 rounded-full text-white pl-1.5 pr-3.5 py-1.5 text-[clamp(11px,3.4vw,13px)] font-semibold">
        <span className="grid place-items-center w-6 h-6 rounded-full border-2 border-gold text-gold shrink-0"><Users size={12} strokeWidth={2.5} /></span>
        <span className="min-w-0">{friends.length ? <>Приглашено друзей: {friends.length}<span className="whitespace-nowrap"> · {earned > 0 ? <span className="text-gold">+{N(earned)}</span> : 'ждём покупку'}</span></> : 'За друга после его первой покупки'}</span></span></div>
    </div>
    <div className="space-y-3 mt-4">{steps.map(([t, d], i) => <div key={t} style={delay(i + 2)} className="rise card-dark rounded-2xl p-4 flex items-center gap-4">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-gold text-black font-bold shrink-0">{i + 1}</span><span><span className="block font-semibold">{t}</span><span className="block text-[13px] text-mute">{d}</span></span></div>)}</div>
    <div style={delay(5)} className="rise mt-4 card-dark rounded-2xl p-4 flex items-center gap-3"><span className="flex-1 min-w-0"><span className="block text-xs text-mute">Твой код</span><span className="block text-lg font-bold tracking-[0.2em]">{s.code}</span></span>
      <Btn v="secondary" onClick={copyCode}>Скопировать</Btn></div>
    <button style={delay(6)} disabled={busy || !s.code} onClick={share} className="rise press w-full mt-4 h-14 rounded-2xl bg-gold text-black font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50"><Share2 size={18} />Поделиться приглашением</button>

    {r && (r.earned > 0 || friends.length > 0) && <div style={delay(7)} className="rise mt-7">
      <div className="grid grid-cols-2 gap-3"><div className="card-dark rounded-2xl p-4"><div className="text-xs text-mute">Начислено за друзей</div><div className="text-2xl font-bold text-gold mt-1">+{N(r.earned)}</div></div>
        <div className="card-dark rounded-2xl p-4"><div className="text-xs text-mute">Друзей</div><div className="text-2xl font-bold mt-1">{friends.length}</div><div className="text-xs text-mute">купили: {done}</div></div></div>
      <h2 className="text-lg font-bold mt-6 mb-3">Приглашённые друзья</h2>
      <div className="card-dark rounded-2xl divide-y divide-line">{friends.map((f, i) => <div key={i} className="flex items-center gap-3 p-4">
        <span className="grid place-items-center w-10 h-10 rounded-full bg-gold/15 text-gold font-bold shrink-0">{f.name[0]?.toUpperCase()}</span>
        <span className="flex-1 min-w-0"><span className="block font-medium truncate">{f.name}</span><span className="block text-xs text-mute">с {dmy(f.created_at)}</span></span>
        {f.status === 'confirmed' ? <span className="text-gold font-bold">+2 000</span> : <span className="text-xs text-mute">ждём покупку</span>}</div>)}</div>
    </div>}
  </div>
}

/* ---------- Профиль ---------- */
export function ProfileScreen({ s, go, children }: { s: Snap; go: (tab: string) => void; children: ReactNode }) {
  const Row = ({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) => <button onClick={onClick} className="press w-full flex items-center gap-3 p-4 text-left hover:bg-hover"><span className="text-gold">{icon}</span><span className="flex-1 font-medium">{label}</span><ChevronRight size={16} className="text-mute" /></button>
  return <div className="max-w-lg mx-auto space-y-3 rise-kids">
    <ScreenHead title="Профиль" />
    <div className="rise card-dark rounded-3xl p-5 flex items-center gap-4"><span className="grid place-items-center w-14 h-14 rounded-full bg-gold text-black text-xl font-bold">{(s.name || 'К')[0].toUpperCase()}</span>
      <span className="min-w-0"><span className="block text-lg font-bold truncate">{s.name}</span><span className="block text-[13px] text-mute">{s.phone || 'Клиент клуба'}</span></span></div>
    <div className="rise card-dark rounded-2xl divide-y divide-line overflow-hidden">
      <Row icon={<RefreshCw size={18} />} label="Продлить абонемент" onClick={() => go('renew')} />
      <Row icon={<Users size={18} />} label="Пригласить друга" onClick={() => go('friends')} />
      <Row icon={<Gift size={18} />} label="Подарочные карточки" onClick={() => go('cards')} />
      <Row icon={<Snowflake size={18} />} label="Заморозить абонемент" onClick={() => go('freeze')} />
      <Row icon={<Megaphone size={18} />} label="Объявления клуба" onClick={() => go('news')} />
      <Row icon={<LifeBuoy size={18} />} label="Поддержка" onClick={() => go('support')} />
    </div>
    {children}
    <Install />
    <Btn v="ghost" className="w-full !h-10" onClick={() => logout()}><LogOut size={15} />Выйти</Btn>
  </div>
}
