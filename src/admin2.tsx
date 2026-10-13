import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Announcement, api, dmy, fmt, Prize } from './api'
import { N } from './lib'
import { act, Badge, Btn, Card, Confirm, Empty, Field, Input, Modal, num, PageHead, Select, Table, toast, useAsync } from './ui'
import { Bell2 } from './support'

const TA = 'w-full rounded-lg bg-bg border border-line px-3 py-2 outline-none focus:border-gold/60 placeholder:text-mute/60 resize-none'
const setting = (k: string, v: string) => api.saveSetting(k, v)

/* ======================= Подарочные карточки: призы и шансы ======================= */
export function CardsAdmin() {
  const [l, load] = useAsync(api.prizes), [st, loadSt] = useAsync(api.cardStats), [cfg, loadCfg] = useAsync(api.setting)
  const [ed, setEd] = useState<Partial<Prize> | null>(null), [f, setF] = useState<any>({}), [del, setDel] = useState<Prize | null>(null), [all, setAll] = useState(false), [note, setNote] = useState('')
  const open = (x: Prize | null) => { setEd(x ?? {}); setF({ title: x?.title ?? '', chance: x ? String(x.chance) : '', bonus: x?.bonus ? String(x.bonus) : '', stock: x?.stock == null ? '' : String(x.stock), active: x?.active ?? true }) }
  const save = () => act(async () => {
    const v = { title: f.title.trim(), chance: Math.min(100, Math.max(0, Number(String(f.chance).replace(',', '.')) || 0)), bonus: +(f.bonus || 0), stock: f.stock === '' || f.stock === null ? null : +f.stock, active: !!f.active }
    if (ed?.id) await api.updatePrize(ed.id, v); else await api.addPrize({ ...v, sort: (l?.length ?? 0) + 1 }); return 'Приз сохранён' }, () => { setEd(null); load() })
  const live = (l ?? []).filter(p => p.active && p.chance > 0 && (p.stock === null || p.stock > 0)), total = live.reduce((a, p) => a + p.chance, 0)
  const COL = ['#FFD21C', '#F5A300', '#FFE89A', '#C98A1A', '#FFF3C4', '#E0A526']
  return <div className="space-y-4">
    <PageHead title="Подарочные карточки"><Btn v="secondary" onClick={() => setAll(true)}>Выдать всем клиентам</Btn><Btn onClick={() => open(null)}><Plus size={14} />Добавить приз</Btn></PageHead>
    {st && <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-line border border-line rounded-xl overflow-hidden">{[['Выдано карточек', st.issued], ['Стёрто', st.opened], ['С призом', st.won], ['Ждут выдачи', st.waiting], ['Призов выдано', st.redeemed]].map(([a, b]) =>
      <div key={a as string} className="bg-surface p-4"><div className="text-xs text-mute">{a}</div><div className="text-xl font-semibold mt-1">{N(b as number)}</div></div>)}</div>}
    <Card title="Шансы выигрыша">
      <div className="h-3 rounded-full overflow-hidden flex bg-white/5">{live.map((p, i) => <div key={p.id} title={`${p.title}: ${p.chance}%`} style={{ width: `${Math.min(100, p.chance / Math.max(100, total) * 100)}%`, background: COL[i % COL.length] }} />)}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[13px]">{live.map((p, i) => <span key={p.id} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: COL[i % COL.length] }} />{p.title} — {p.chance}%</span>)}
        {total < 100 && <span className="inline-flex items-center gap-1.5 text-mute"><i className="w-2.5 h-2.5 rounded-sm bg-white/10" />Без приза — {Math.round((100 - total) * 1000) / 1000}%</span>}</div>
      {total > 100 && <div className="text-amber-300 text-[13px] mt-2">Сумма шансов {total}% больше 100% — шансы будут пересчитаны пропорционально, и проигрышей не будет.</div>}
      <div className="text-xs text-mute mt-2">Карточка за регистрацию всегда выигрышная: приз выбирается среди активных призов пропорционально их шансам.</div>
    </Card>
    <Card pad={false}><Table rows={l ?? []} empty="Призов пока нет — добавьте первый (например «Кофе в баре», шанс 30%)" cols={[
      { h: 'Приз', r: p => <b className="font-medium">{p.title}</b> }, { h: 'Шанс', r: p => `${p.chance}%` },
      { h: 'Тип', r: p => p.bonus > 0 ? <Badge t="gold">+{N(p.bonus)} бонусов сразу</Badge> : <Badge>Выдаёт ресепшен по коду</Badge>, cls: 'hidden md:table-cell' },
      { h: 'Осталось', r: p => p.stock === null ? '∞' : N(p.stock) }, { h: 'Статус', r: p => p.active ? <Badge t="green">Активен</Badge> : <Badge>Скрыт</Badge> },
      { h: '', cls: 'text-right', r: p => <span className="inline-flex gap-1"><Btn v="secondary" onClick={() => open(p)}>Изменить</Btn><Btn v="ghost" onClick={() => act(async () => { await api.updatePrize(p.id, { active: !p.active }); return 'Готово' }, load)}>{p.active ? 'Скрыть' : 'Показать'}</Btn><Btn v="danger" onClick={() => setDel(p)}>Удалить</Btn></span> }]} /></Card>
    <Card title="Когда клиенты получают карточки"><div className="grid sm:grid-cols-2 gap-3">
      <Field l="Карточка за регистрацию"><Select className="w-full" value={cfg?.card_welcome ?? '1'} onChange={e => setting('card_welcome', e.target.value).then(loadCfg).catch(x => toast(x.message, false))}><option value="1">Да — каждому новому клиенту</option><option value="0">Нет</option></Select></Field>
      <SettingNum k="card_prize_days" l="Срок действия приза, дней" cfg={cfg} done={loadCfg} def="30" />
      <SettingNum k="card_on_purchase" l="Карточек за покупку/продление абонемента" cfg={cfg} done={loadCfg} def="0" />
      <SettingNum k="card_on_annual" l="Карточек за годовой абонемент" cfg={cfg} done={loadCfg} def="0" />
    </div><div className="text-xs text-mute mt-2">Выдать карточку конкретному клиенту — в его карточке (Клиенты → клиент → «Подарочная карточка»). Приз по коду выдаётся в разделе «Списание».</div></Card>
    {ed && <Modal title={ed.id ? 'Изменить приз' : 'Новый приз'} onClose={() => setEd(null)}>
      <Field l="Что выигрывает клиент (текстом)"><Input value={f.title} maxLength={80} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Например: Протеиновый коктейль, +3 дня к абонементу" /></Field>
      <div className="grid grid-cols-2 gap-3"><Field l="Шанс, %"><Input inputMode="decimal" value={f.chance} onChange={e => setF({ ...f, chance: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="30" /></Field>
        <Field l="Количество (пусто = без лимита)"><Input inputMode="numeric" value={f.stock} onChange={e => setF({ ...f, stock: num(e.target.value) })} placeholder="∞" /></Field></div>
      <Field l="Начислить бонусы автоматически (необязательно)"><Input inputMode="numeric" value={f.bonus} onChange={e => setF({ ...f, bonus: num(e.target.value) })} placeholder="0 — приз выдаёт ресепшен по коду" /></Field>
      <div className="text-xs text-mute">Если указать бонусы, они сразу зачислятся на баланс клиента. Иначе клиент получит 6-значный код и заберёт приз на ресепшене.</div>
      <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!f.active} onChange={e => setF({ ...f, active: e.target.checked })} />Приз активен</label>
      <Btn disabled={!f.title?.trim() || f.chance === ''} onClick={save}>Сохранить</Btn></Modal>}
    {del && <Confirm title="Удалить приз?" text={`«${del.title}» больше не будет выпадать. Уже выигранные призы сохранятся.`} onClose={() => setDel(null)} onYes={() => act(async () => { await api.deletePrize(del.id); return 'Приз удалён' }, load)} />}
    {all && <Modal title="Выдать карточку всем клиентам" onClose={() => setAll(false)}><Field l="Подпись (необязательно)"><Input value={note} maxLength={120} onChange={e => setNote(e.target.value)} placeholder="Например: Подарок к Новому году" /></Field>
      <div className="text-[13px] text-mute">Каждый клиент получит одну карточку и уведомление.</div>
      <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setAll(false)}>Отмена</Btn><Btn onClick={() => act(async () => `Карточки выданы: ${await api.giveCardAll(note)}`, () => { setAll(false); setNote(''); loadSt() })}>Выдать</Btn></div></Modal>}
  </div>
}
function SettingNum({ k, l, cfg, done, def }: { k: string; l: string; cfg: Record<string, string> | null; done: () => void; def: string }) {
  const [v, setV] = useState<string | null>(null)
  return <Field l={l}><div className="flex gap-2"><Input inputMode="numeric" value={v ?? cfg?.[k] ?? def} onChange={e => setV(num(e.target.value))} />
    <Btn v="secondary" disabled={v === null} onClick={() => act(async () => { await setting(k, v ?? def); return 'Сохранено' }, () => { setV(null); done() })}>Сохранить</Btn></div></Field>
}

/* Выдать приз по 6-значному коду (в разделе «Списание») */
export function PrizeRedeemCard() {
  const [code, setCode] = useState(''), [p, setP] = useState<{ client: string; title: string; expires_at: string } | null>(null), [err, setErr] = useState('')
  const find = (c: string) => { setCode(c); setErr(''); setP(null); if (c.length === 6) api.prizePreview(c).then(setP).catch(e => setErr(e.message)) }
  return <Card title="Приз из подарочной карточки"><div className="space-y-3">
    <Input value={code} onChange={e => find(num(e.target.value).slice(0, 6))} inputMode="numeric" className="!h-12 text-center text-2xl tracking-[0.3em] font-semibold" placeholder="000000" />
    {err && <div className="text-red-400 text-[13px]">{err}</div>}
    {p && <div className="border border-line rounded-lg divide-y divide-line">{[['Клиент', p.client], ['Приз', p.title], ['Действует до', dmy(p.expires_at)]].map(([a, b]) => <div key={a} className="flex justify-between px-3 py-2"><span className="text-mute">{a}</span><b className="font-medium">{b}</b></div>)}</div>}
    {p && <Btn className="w-full !h-10" onClick={() => act(async () => `Выдано: ${await api.redeemPrize(code)}`, () => { setP(null); setCode('') })}>Выдать приз</Btn>}</div></Card>
}

/* Действия в карточке клиента: заморозка, подарочная карточка, сообщение */
export function ClientActions({ c, done }: { c: { id: string; full_name: string }; done: () => void }) {
  const [fz, loadFz] = useAsync(() => api.clientFreezes(c.id), 0, [c.id]), [msg, setMsg] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const today = new Date().toISOString().slice(0, 10), active = (fz ?? []).find(x => !x.ended_on && x.planned_end > today)
  return <>
    {active && <div className="rounded-lg border border-sky-300/25 bg-sky-400/5 px-3 py-2.5 flex items-center justify-between gap-2 text-[13px]"><span>❄️ Абонемент заморожен до <b>{dmy(active.planned_end)}</b> ({active.days} дн.)</span>
      <Btn v="secondary" onClick={() => act(async () => { const r = await api.staffUnfreeze(c.id); return `Разморожено, возвращено ${r.returned} дн.` }, () => { loadFz(); done() })}>Разморозить</Btn></div>}
    <Card title="Написать клиенту"><div className="space-y-2"><textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} maxLength={2000} className={TA} placeholder={`Сообщение для ${c.full_name}…`} />
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-mute">Придёт в приложение и push-уведомлением. Клиент сможет ответить в «Поддержке».</span>
        <Btn disabled={busy || !msg.trim()} onClick={() => { setBusy(true); act(async () => { await api.staffMessage(c.id, msg); return 'Сообщение отправлено' }, () => setMsg('')).finally(() => setBusy(false)) }}>Отправить</Btn></div></div></Card>
    <Card title="Подарочная карточка"><div className="flex gap-2"><Input value={note} maxLength={120} onChange={e => setNote(e.target.value)} placeholder="Подпись: «За отзыв», «С днём рождения»…" />
      <Btn onClick={() => act(async () => { await api.giveCard(c.id, note); return 'Карточка выдана' }, () => setNote(''))}>Выдать</Btn></div></Card>
    {!!fz?.length && <div className="text-xs text-mute">Заморозки: {fz.map(x => `${fmt(x.starts_on)}–${fmt(x.ended_on ?? x.planned_end)}`).join(', ')}</div>}
  </>
}

/* Настройки заморозки по умолчанию (в «Магазине», рядом с тарифами) */
export function FreezeSettings() {
  const [cfg, load] = useAsync(api.setting)
  return <div className="mt-8"><h2 className="text-lg font-semibold mb-3">Заморозка абонемента</h2><Card><div className="grid sm:grid-cols-2 gap-3">
    <SettingNum k="freeze_max_days" l="Дней заморозки на абонемент (по умолчанию)" cfg={cfg} done={load} def="30" />
    <SettingNum k="freeze_min_days" l="Минимальная заморозка, дней" cfg={cfg} done={load} def="3" /></div>
    <div className="text-xs text-mute mt-2">Для отдельного тарифа можно задать своё количество дней (Тарифы → Изменить). Для «безлимитной» заморозки поставьте, например, 365.</div></Card></div>
}

/* ======================= Объявления ======================= */
export function NewsAdmin() {
  const [l, load] = useAsync(api.announcements), [ed, setEd] = useState<Partial<Announcement> | null>(null), [f, setF] = useState<any>({}), [del, setDel] = useState<Announcement | null>(null), [notify, setNotify] = useState(true)
  const open = (x: Announcement | null) => { setEd(x ?? {}); setF({ title: x?.title ?? '', body: x?.body ?? '', pinned: x?.pinned ?? false, active: x?.active ?? true }) }
  const save = () => act(async () => {
    const v = { title: f.title.trim(), body: f.body.trim(), pinned: !!f.pinned, active: !!f.active }
    if (ed?.id) { await api.updateAnnouncement(ed.id, v); return 'Объявление сохранено' }
    const { id } = await api.addAnnouncement(v); if (!notify || !v.active) return 'Объявление опубликовано'
    return `Опубликовано, уведомлено клиентов: ${await api.notifyAnnouncement(id)}` }, () => { setEd(null); setNotify(true); load() })
  return <div className="space-y-4">
    <PageHead title="Объявления"><Btn onClick={() => open(null)}><Plus size={14} />Новое объявление</Btn></PageHead>
    <div className="text-[13px] text-mute">Объявления видят все клиенты на главной и в разделе «Объявления». Закреплённые показываются первыми.</div>
    {l === null ? <Empty>Загрузка…</Empty> : !l.length ? <Card><Empty>Объявлений пока нет</Empty></Card> : <Card pad={false}><Table rows={l} cols={[
      { h: 'Объявление', r: x => <div className="min-w-0"><b className="font-medium">{x.pinned ? '📌 ' : ''}{x.title}</b>{x.body && <div className="text-xs text-mute truncate max-w-[360px]">{x.body}</div>}</div> },
      { h: 'Дата', r: x => fmt(x.created_at), cls: 'hidden md:table-cell' }, { h: 'Статус', r: x => x.active ? <Badge t="green">Опубликовано</Badge> : <Badge>Скрыто</Badge> },
      { h: '', cls: 'text-right', r: x => <span className="inline-flex gap-1"><Btn v="secondary" onClick={() => open(x)}>Изменить</Btn>
        {x.active && <Btn v="ghost" onClick={() => act(async () => `Уведомлено клиентов: ${await api.notifyAnnouncement(x.id)}`)}>Уведомить</Btn>}
        <Btn v="ghost" onClick={() => act(async () => { await api.updateAnnouncement(x.id, { active: !x.active }); return 'Готово' }, load)}>{x.active ? 'Скрыть' : 'Показать'}</Btn><Btn v="danger" onClick={() => setDel(x)}>Удалить</Btn></span> }]} /></Card>}
    {ed && <Modal title={ed.id ? 'Изменить объявление' : 'Новое объявление'} onClose={() => setEd(null)}>
      <Field l="Заголовок"><Input value={f.title} maxLength={120} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Например: 16 декабря зал работает до 18:00" /></Field>
      <Field l="Текст"><textarea value={f.body} maxLength={3000} rows={6} onChange={e => setF({ ...f, body: e.target.value })} className={TA} placeholder="Подробности для клиентов…" /></Field>
      <div className="flex flex-wrap gap-4 text-[13px]"><label className="flex items-center gap-2"><input type="checkbox" checked={!!f.pinned} onChange={e => setF({ ...f, pinned: e.target.checked })} />Закрепить</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.active} onChange={e => setF({ ...f, active: e.target.checked })} />Опубликовано</label>
        {!ed.id && <label className="flex items-center gap-2"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />Отправить уведомление клиентам 📢</label>}</div>
      <Btn disabled={!f.title?.trim()} onClick={save}>{ed.id ? 'Сохранить' : 'Опубликовать'}</Btn></Modal>}
    {del && <Confirm title="Удалить объявление?" text={`«${del.title}» будет удалено навсегда.`} onClose={() => setDel(null)} onYes={() => act(async () => { await api.deleteAnnouncement(del.id); return 'Удалено' }, load)} />}
  </div>
}

/* Колокольчик админа: заморозки клиентов и другие уведомления (push тоже можно включить отсюда) */
export function AdminBell({ go }: { go: (k: string) => void }) {
  const [n, setN] = useState(0), load = () => { api.unread().then(setN).catch(() => {}) }
  useEffect(() => { load(); const f = () => { if (document.visibilityState === 'visible') load() }; document.addEventListener('visibilitychange', f); const t = setInterval(load, 120000); return () => { document.removeEventListener('visibilitychange', f); clearInterval(t) } }, [])
  return <Bell2 count={n} reload={load} go={go} map={{ freeze: 'clients', support_reply: 'support', support_closed: 'support' }} />
}
