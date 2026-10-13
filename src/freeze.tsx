import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, Snowflake, Sun } from 'lucide-react'
import { api, dmy, FreezeInfo } from './api'
import { Btn, cx, Empty, Modal, toast, useAsync } from './ui'
import { ScreenHead } from './home'

/* Заморозка абонемента: клиент сам ставит паузу, админ получает уведомление (в приложении и push). */
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x }
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней'
const Flakes = () => { const f = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ l: (i * 37) % 100, d: 6 + (i * 7) % 9, s: 8 + (i * 5) % 12, o: .15 + ((i * 13) % 30) / 100, delay: -(i * 1.3) })), [])
  return <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">{f.map((x, i) => <Snowflake key={i} size={x.s} className="fz-flake absolute -top-4 text-sky-100" style={{ left: `${x.l}%`, opacity: x.o, animationDuration: `${x.d}s`, animationDelay: `${x.delay}s` }} />)}</div> }

export function FreezeScreen({ go, reloadSnap }: { go: (t: string) => void; reloadSnap: () => void }) {
  const [f, load] = useAsync<FreezeInfo>(api.myFreeze), [days, setDays] = useState<number | null>(null), [ask, setAsk] = useState(false), [busy, setBusy] = useState(false), [ice, setIce] = useState(false), [unAsk, setUnAsk] = useState(false)
  if (!f) return <div className="max-w-lg mx-auto"><ScreenHead title="Заморозка" /><Empty>Загрузка…</Empty></div>
  const lim = f.limits, act = f.active, left = lim?.left ?? 0, min = lim?.min ?? 1, d = Math.max(min, Math.min(days ?? Math.min(7, left), left))
  const doFreeze = () => { setBusy(true); api.freeze(d).then(() => { setAsk(false); setIce(true); navigator.vibrate?.([20, 60, 20]); setTimeout(() => { setIce(false); load(); reloadSnap() }, 1900) }).catch(e => toast(e.message, false)).finally(() => setBusy(false)) }
  const doUnfreeze = () => { setBusy(true); api.unfreeze().then(r => { toast(r.returned ? `Абонемент разморожен, возвращено ${r.returned} ${plural(r.returned)}` : 'Абонемент разморожен'); setUnAsk(false); load(); reloadSnap() }).catch(e => toast(e.message, false)).finally(() => setBusy(false)) }
  const daysLeft = act ? Math.max(0, Math.ceil((+new Date(act.until + 'T00:00:00') - Date.now()) / 864e5)) : 0
  return <div className="max-w-lg mx-auto">
    <ScreenHead title="Заморозка" sub="Пауза в тренировках без потери дней" />
    <div className="rise fz-card relative overflow-hidden rounded-[28px] p-6">
      <Flakes />
      <div className="relative flex flex-col items-center text-center">
        <span className={cx('fz-orb grid place-items-center w-24 h-24 rounded-full', act && 'fz-orb-on')}><Snowflake size={46} className="fz-spin text-sky-100" /></span>
        {!f.membership ? <><div className="text-xl font-bold mt-5">Нет активного абонемента</div><div className="text-[13px] text-sky-100/60 mt-1">Заморозить можно только действующий абонемент.</div>
          <Btn className="mt-5 !h-11 w-full" onClick={() => go('renew')}>Выбрать абонемент</Btn></>
        : act ? <><div className="text-[13px] text-sky-200/80 mt-5">Абонемент заморожен</div><div className="text-[clamp(28px,10vw,40px)] leading-none font-extrabold mt-1 fz-ice-text whitespace-nowrap">до {dmy(act.until)}</div>
          <div className="text-[13px] text-sky-100/60 mt-2">Осталось {daysLeft} {plural(daysLeft)} паузы · абонемент «{f.membership.plan}» продлён до {dmy(f.membership.ends_on)}</div>
          <div className="w-full h-1.5 rounded-full bg-white/10 mt-5 overflow-hidden"><div className="h-full fz-bar" style={{ width: `${Math.round((1 - daysLeft / act.days) * 100)}%` }} /></div>
          <button disabled={busy} onClick={() => setUnAsk(true)} className="press mt-6 w-full h-12 rounded-2xl bg-white text-black font-bold flex items-center justify-center gap-2"><Sun size={18} />Разморозить досрочно</button></>
        : left <= 0 ? <><div className="text-xl font-bold mt-5">Дни заморозки закончились</div><div className="text-[13px] text-sky-100/60 mt-1">По этому абонементу использовано {lim?.used} из {lim?.max} {plural(lim?.max ?? 0)}.</div></>
        : <>
          <div className="text-[13px] text-sky-200/80 mt-5">На сколько заморозить?</div>
          <div className="flex items-center gap-5 mt-2">
            <button aria-label="Меньше" disabled={d <= min} onClick={() => setDays(d - 1)} className="press grid place-items-center w-12 h-12 rounded-full bg-white/10 text-white disabled:opacity-30"><Minus size={20} /></button>
            <div className="min-w-[120px]"><div key={d} className="fz-num text-[64px] leading-none font-extrabold fz-ice-text">{d}</div><div className="text-sky-100/70 text-[13px]">{plural(d)}</div></div>
            <button aria-label="Больше" disabled={d >= left} onClick={() => setDays(d + 1)} className="press grid place-items-center w-12 h-12 rounded-full bg-white/10 text-white disabled:opacity-30"><Plus size={20} /></button>
          </div>
          <input type="range" min={min} max={left} value={d} onChange={e => setDays(+e.target.value)} className="fz-range w-full mt-5" aria-label="Дней заморозки" />
          <div className="flex flex-wrap justify-center gap-2 mt-3">{[...new Set([min, 7, 14, 30, left])].filter(x => x >= min && x <= left).sort((a, b) => a - b).map(x =>
            <button key={x} onClick={() => setDays(x)} className={cx('press h-8 px-3 rounded-full text-[13px] font-semibold border', d === x ? 'bg-sky-200 text-black border-sky-200' : 'border-white/15 text-sky-100/80')}>{x} {plural(x)}</button>)}</div>
          <div className="w-full mt-5 rounded-2xl bg-black/30 border border-white/10 divide-y divide-white/10 text-[13px] text-left">
            {[['Пауза до', dmy(+addDays(new Date().toISOString().slice(0, 10), d))], ['Абонемент продлится до', dmy(+addDays(f.membership.ends_on, d))], ['Осталось дней заморозки', `${left} из ${lim?.max}`]].map(([a, b]) =>
              <div key={a} className="flex justify-between px-4 py-2.5"><span className="text-sky-100/60">{a}</span><b className="font-semibold">{b}</b></div>)}</div>
          <button disabled={busy} onClick={() => setAsk(true)} className="press mt-5 w-full h-12 rounded-2xl fz-btn font-bold flex items-center justify-center gap-2"><Snowflake size={18} />Заморозить на {d} {plural(d)}</button>
          <div className="text-[11px] text-sky-100/50 mt-3">Разморозить можно в любой момент — неиспользованные дни вернутся.</div>
        </>}
      </div>
    </div>
    {ask && <Modal title="Заморозить абонемент?" onClose={() => setAsk(false)}><div className="text-[13px] text-mute">Пауза на {d} {plural(d)}, до {dmy(+addDays(new Date().toISOString().slice(0, 10), d))}. Абонемент продлится на эти дни. Администратор получит уведомление.</div>
      <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setAsk(false)}>Отмена</Btn><Btn disabled={busy} onClick={doFreeze}>Заморозить</Btn></div></Modal>}
    {unAsk && <Modal title="Разморозить досрочно?" onClose={() => setUnAsk(false)}><div className="text-[13px] text-mute">Неиспользованные дни паузы ({daysLeft}) вернутся в запас заморозки, абонемент снова начнёт идти с сегодняшнего дня.</div>
      <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setUnAsk(false)}>Отмена</Btn><Btn disabled={busy} onClick={doUnfreeze}>Разморозить</Btn></div></Modal>}
    {ice && createPortal(<div className="fz-ice fixed inset-0 z-[90] grid place-items-center pointer-events-none" aria-live="polite"><div className="fz-ice-msg text-center"><Snowflake size={64} className="mx-auto text-white fz-spin" /><div className="mt-3 text-2xl font-extrabold text-white">Абонемент заморожен</div></div></div>, document.body)}
  </div>
}
