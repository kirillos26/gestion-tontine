import { FormEvent, useMemo, useState } from 'react'
import { beneficiariesFor, buildSchedule, fisherYates, orderedBeneficiaries, recommendedPayment } from './finance'
import { configured, createTontine, generateAccessCode, openTontine, updateTontine } from './supabase'
import type { Member, OrderMode, PastOperation, TontineData } from './types'

const uid = () => crypto.randomUUID()
const emptyData = (): TontineData => ({
  name: '', startMonth: new Date().toISOString().slice(0, 7), duration: 12, contribution: 10000,
  members: [{ id: uid(), name: '', shares: 1 }], orderMode: 'alphabetique', beneficiaryOrder: [],
  paymentMode: 'recommande', manualPayment: 0, history: [],
})
const money = (value: number) => `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`
const monthLabel = (value: string) => new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
const normalizedName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR')

export default function App() {
  const [screen, setScreen] = useState<'home' | 'edit' | 'access-code' | 'print'>('home')
  const [data, setData] = useState<TontineData>(emptyData)
  const [code, setCode] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const beneficiaries = useMemo(() => beneficiariesFor(data), [data.members])
  const schedule = useMemo(() => buildSchedule(data), [data])
  const duplicateMemberIds = useMemo(() => {
    const groups = new Map<string, string[]>()
    data.members.forEach((member) => {
      const name = normalizedName(member.name)
      if (name) groups.set(name, [...(groups.get(name) ?? []), member.id])
    })
    return new Set([...groups.values()].filter((ids) => ids.length > 1).flat())
  }, [data.members])

  const setField = <K extends keyof TontineData>(key: K, value: TontineData[K]) => setData((old) => ({ ...old, [key]: value }))
  const financialSignature = (item: TontineData) => JSON.stringify({ startMonth: item.startMonth, duration: item.duration, contribution: item.contribution, members: item.members, paymentMode: item.paymentMode, manualPayment: item.manualPayment, history: item.history, orderMode: item.orderMode, beneficiaryOrder: item.beneficiaryOrder })

  function validate(): string {
    if (!data.name.trim()) return 'Indiquez le nom de la tontine.'
    if (!/^\d{4}-\d{2}$/.test(data.startMonth)) return 'Indiquez un mois de début valide.'
    if (!Number.isInteger(data.duration) || data.duration < 1 || data.duration > 120) return 'La durée doit être comprise entre 1 et 120 mois.'
    if (!Number.isInteger(data.contribution) || data.contribution < 1) return 'La cotisation doit être un entier positif.'
    if (!data.members.length || data.members.some((m) => !m.name.trim() || !Number.isInteger(m.shares) || m.shares < 1)) return 'Chaque membre doit avoir un nom et au moins une part.'
    if (duplicateMemberIds.size > 0) return 'Deux membres ne peuvent pas porter le même nom, même avec une casse ou des espaces différents.'
    if (data.paymentMode === 'manuel' && (!Number.isInteger(data.manualPayment) || data.manualPayment < 1)) return 'Le montant manuel doit être un entier positif.'
    const historyIds = data.history.map((h) => h.beneficiaryId)
    if (new Set(historyIds).size !== historyIds.length) return 'Un bénéficiaire ne peut apparaître qu’une fois dans l’historique.'
    if (data.history.some((h) => !/^\d{4}-\d{2}$/.test(h.month) || !Number.isInteger(h.amount) || h.amount < 0 || !Number.isInteger(h.carry) || h.carry < 0)) return 'Les montants et reports de l’historique doivent être des entiers positifs ou nuls.'
    for (const row of buildSchedule(data).rows.filter((item) => item.status === 'réalisé')) {
      const declared = data.history.filter((h) => h.month === row.month)
      const total = declared.reduce((sum, h) => sum + h.amount, 0)
      const carry = declared.at(-1)?.carry ?? 0
      if (total > row.available) return `Les versements de ${monthLabel(row.month)} dépassent les fonds disponibles.`
      if (carry !== row.available - total) return `Le report de ${monthLabel(row.month)} doit être de ${money(row.available - total)}.`
    }
    return ''
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    const validation = validate(); if (validation) { setError(validation); return }
    if (data.id && savedSnapshot && savedSnapshot !== financialSignature(data) && !confirm('Cette modification recalculera l’échéancier. Continuer ?')) return
    setBusy(true)
    try {
      if (data.id) {
        await updateTontine(data, code)
        setSavedSnapshot(financialSignature(data)); setMessage('Modifications enregistrées.')
      } else {
        const newCode = generateAccessCode()
        const created = await createTontine(data, newCode)
        setData(created); setCode(newCode); setSavedSnapshot(financialSignature(created))
        setMessage(''); setCodeCopied(false); setScreen('access-code')
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Une erreur est survenue.') }
    finally { setBusy(false) }
  }

  async function open(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const loaded = await openTontine(code)
      setData(loaded); setSavedSnapshot(financialSignature(loaded)); setScreen('edit')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible d’ouvrir cette tontine.') }
    finally { setBusy(false) }
  }

  function updateMember(id: string, patch: Partial<Member>) { setField('members', data.members.map((member) => member.id === id ? { ...member, ...patch } : member)) }
  function removeMember(id: string) { setField('members', data.members.filter((member) => member.id !== id)) }
  function changeOrderMode(mode: OrderMode) {
    let order = orderedBeneficiaries({ ...data, orderMode: 'manuel' }).map((b) => b.id)
    if (mode === 'alphabetique') order = [...beneficiaries].sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })).map((b) => b.id)
    if (mode === 'aleatoire') order = fisherYates(beneficiaries).map((b) => b.id)
    setData((old) => ({ ...old, orderMode: mode, beneficiaryOrder: order }))
  }
  function moveBeneficiary(index: number, direction: -1 | 1) {
    const order = orderedBeneficiaries(data).map((b) => b.id); const next = index + direction
    if (next < 0 || next >= order.length) return
    ;[order[index], order[next]] = [order[next], order[index]]
    setData((old) => ({ ...old, orderMode: 'manuel', beneficiaryOrder: order }))
  }
  function addHistory() {
    const served = new Set(data.history.map((h) => h.beneficiaryId)); const beneficiary = beneficiaries.find((b) => !served.has(b.id))
    if (!beneficiary) { setError('Tous les bénéficiaires ont déjà été servis.'); return }
    const operation: PastOperation = { id: uid(), month: data.startMonth, beneficiaryId: beneficiary.id, amount: data.paymentMode === 'recommande' ? recommendedPayment(data.contribution, data.duration) : data.manualPayment, carry: 0 }
    setField('history', [...data.history, operation])
  }

  async function copyAccessCode() {
    await navigator.clipboard.writeText(code)
    setCodeCopied(true)
  }

  if (screen === 'home') return <main className="shell home">
    <header><span className="eyebrow">Gestion solidaire</span><h1>Ma Tontine</h1><p>Créez un échéancier clair et retrouvez-le partout grâce à votre code privé.</p></header>
    {!configured && <div className="notice warning">Supabase n’est pas encore configuré. Renseignez le fichier <code>.env</code> pour sauvegarder.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="home-grid">
      <section className="card"><div className="step">01</div><h2>Créer une tontine</h2><p>Ajoutez les membres, les parts et choisissez l’ordre de passage.</p><button onClick={() => { setData(emptyData()); setCode(''); setScreen('edit') }}>Commencer</button></section>
      <section className="card"><div className="step">02</div><h2>Ouvrir une tontine</h2><form onSubmit={open}><label>Code d’accès<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Collez votre code privé" required autoCapitalize="none" /></label><button disabled={busy}>{busy ? 'Ouverture…' : 'Ouvrir'}</button></form></section>
    </div>
  </main>

  if (screen === 'access-code') return <main className="shell access-screen">
    <section className="access-card">
      <span className="success-mark" aria-hidden="true">✓</span>
      <span className="eyebrow">Tontine créée</span>
      <h1>Conservez votre code</h1>
      <p>Ce code est la seule clé permettant d’ouvrir et modifier <strong>{data.name}</strong> depuis un autre appareil. Il ne pourra pas être récupéré.</p>
      <div className="access-code" aria-label="Code d’accès">{code}</div>
      <button type="button" onClick={copyAccessCode}>{codeCopied ? 'Code copié ✓' : 'Copier le code'}</button>
      <button type="button" className="secondary continue-button" onClick={() => setScreen('edit')} disabled={!codeCopied}>J’ai copié le code — continuer</button>
      {!codeCopied && <small>Copiez le code pour pouvoir continuer.</small>}
    </section>
  </main>

  if (screen === 'print') {
    const periodEnd = schedule.rows.at(-1)?.month ?? data.startMonth
    const payments = schedule.rows.flatMap((row) => row.payments.map((payment) => ({ ...payment, month: row.month, status: row.status })))
    return <main className="print-page">
      <div className="print-actions no-print"><button className="secondary" onClick={() => setScreen('edit')}>← Revenir</button><button onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button></div>
      <section className="print-sheet beneficiaries-sheet">
        <header className="print-header"><p>ÉCHÉANCIER DES BÉNÉFICIAIRES</p><h1>{data.name.toLocaleUpperCase('fr-FR')}</h1><div>{monthLabel(data.startMonth)} — {monthLabel(periodEnd)}</div></header>
        <table className="print-beneficiaries"><thead><tr><th>N°</th><th>NOMS &amp; PRÉNOMS</th><th>MOIS</th></tr></thead><tbody>{payments.map((payment, index) => <tr key={payment.beneficiaryId}><td>{index + 1}</td><td>{payment.label.toLocaleUpperCase('fr-FR')}</td><td>{monthLabel(payment.month)}</td></tr>)}</tbody></table>
        {schedule.unserved.length > 0 && <div className="print-warning"><strong>Attention :</strong> bénéficiaires non servis avant la fin : {schedule.unserved.map((b) => b.label).join(', ')}.</div>}
      </section>
      <section className="print-sheet details-sheet">
        <header className="print-header small-title"><p>SYNTHÈSE FINANCIÈRE</p><h2>{data.name.toLocaleUpperCase('fr-FR')}</h2></header>
        <div className="print-summary"><div><span>Cotisation par part</span><strong>{money(data.contribution)}</strong></div><div><span>Nombre total de parts</span><strong>{beneficiaries.length}</strong></div><div><span>Collecte mensuelle</span><strong>{money(data.contribution * beneficiaries.length)}</strong></div><div><span>Montant par bénéficiaire</span><strong>{money(data.paymentMode === 'recommande' ? recommendedPayment(data.contribution, data.duration) : data.manualPayment)}</strong></div></div>
        <table className="print-details"><thead><tr><th>Mois</th><th>Fonds disponibles</th><th>Bénéficiaires et montants</th><th>Report</th><th>Statut</th></tr></thead><tbody>{schedule.rows.map((row) => <tr key={row.month}><td>{monthLabel(row.month)}</td><td>{money(row.available)}</td><td>{row.payments.length ? row.payments.map((p) => <div key={p.beneficiaryId}>{p.label} — {money(p.amount)}</div>) : 'Aucun versement'}</td><td>{money(row.carry)}</td><td>{row.status}</td></tr>)}</tbody></table>
        <footer>Document généré par Ma Tontine</footer>
      </section>
    </main>
  }

  return <main className="shell">
    <nav><button className="link" onClick={() => setScreen('home')}>← Accueil</button><span>Ma Tontine</span></nav>
    <header className="editor-head"><div><span className="eyebrow">{data.id ? 'Modification' : 'Création'}</span><h1>{data.name || 'Nouvelle tontine'}</h1></div>{data.id && <button className="secondary" onClick={() => setScreen('print')}>Version imprimable</button>}</header>
    {message && <div className="notice success" role="status">{message}</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <form onSubmit={save}>
      <section className="card form-section"><h2>Informations</h2><div className="form-grid">
        <label>Nom de la tontine<input value={data.name} onChange={(e) => setField('name', e.target.value)} required /></label>
        <label>Mois de début<input type="month" value={data.startMonth} onChange={(e) => setField('startMonth', e.target.value)} required /></label>
        <label>Durée (mois)<input type="number" min="1" max="120" value={data.duration} onChange={(e) => setField('duration', Number(e.target.value))} required /></label>
        <label>Cotisation mensuelle d’une part (FCFA)<input type="number" min="1" step="1" value={data.contribution} onChange={(e) => setField('contribution', Number(e.target.value))} required /></label>
      </div></section>

      <section className="card form-section"><div className="section-title"><div><h2>Membres et parts</h2><p>{beneficiaries.length} bénéficiaire{beneficiaries.length > 1 ? 's' : ''} au total</p></div></div>
        <div className="member-list">{data.members.map((member, index) => <div className="member-row" key={member.id}><label><span>Nom {index + 1}</span><input className={duplicateMemberIds.has(member.id) ? 'input-error' : ''} aria-invalid={duplicateMemberIds.has(member.id)} value={member.name} onChange={(e) => updateMember(member.id, { name: e.target.value })} required />{duplicateMemberIds.has(member.id) && <small className="field-error">Ce nom est déjà utilisé.</small>}</label><label className="shares"><span>Parts</span><input type="number" min="1" step="1" value={member.shares} onChange={(e) => updateMember(member.id, { shares: Number(e.target.value) })} required /></label><button type="button" className="danger icon" aria-label={`Supprimer ${member.name || 'ce membre'}`} onClick={() => removeMember(member.id)} disabled={data.members.length === 1}>×</button></div>)}</div>
        <button type="button" className="secondary add-member" onClick={() => setField('members', [...data.members, { id: uid(), name: '', shares: 1 }])}>+ Ajouter un membre</button>
      </section>

      <section className="card form-section"><h2>Versement et ordre</h2><fieldset><legend>Montant versé par bénéficiaire</legend><label className="radio"><input type="radio" checked={data.paymentMode === 'recommande'} onChange={() => setField('paymentMode', 'recommande')} /> Recommandé — {money(recommendedPayment(data.contribution, data.duration))}</label><label className="radio"><input type="radio" checked={data.paymentMode === 'manuel'} onChange={() => setField('paymentMode', 'manuel')} /> Montant manuel</label>{data.paymentMode === 'manuel' && <label>Montant (FCFA)<input type="number" min="1" step="1" value={data.manualPayment} onChange={(e) => setField('manualPayment', Number(e.target.value))} required /></label>}</fieldset>
        <fieldset><legend>Ordre des bénéficiaires</legend><div className="segmented">{(['alphabetique', 'aleatoire', 'manuel'] as OrderMode[]).map((mode) => <button type="button" className={data.orderMode === mode ? 'active' : 'secondary'} key={mode} onClick={() => changeOrderMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div><ol className="order-list">{orderedBeneficiaries(data).map((beneficiary, index) => <li key={beneficiary.id}><span>{beneficiary.label}</span><span><button type="button" className="icon secondary" aria-label="Monter" onClick={() => moveBeneficiary(index, -1)} disabled={index === 0}>↑</button><button type="button" className="icon secondary" aria-label="Descendre" onClick={() => moveBeneficiary(index, 1)} disabled={index === beneficiaries.length - 1}>↓</button></span></li>)}</ol></fieldset>
      </section>

      <section className="card form-section"><div className="section-title"><div><h2>Opérations passées</h2><p>Ajoutez les versements déjà réalisés.</p></div><button type="button" className="secondary small" onClick={addHistory}>+ Ajouter</button></div>
        {data.history.length === 0 ? <p className="empty">Aucune opération passée.</p> : <div className="history-list">{data.history.map((operation) => { const used = new Set(data.history.filter((h) => h.id !== operation.id).map((h) => h.beneficiaryId)); return <div className="history-row" key={operation.id}><label>Mois<input type="month" value={operation.month} onChange={(e) => setField('history', data.history.map((h) => h.id === operation.id ? { ...h, month: e.target.value } : h))} /></label><label>Bénéficiaire<select value={operation.beneficiaryId} onChange={(e) => setField('history', data.history.map((h) => h.id === operation.id ? { ...h, beneficiaryId: e.target.value } : h))}>{beneficiaries.filter((b) => !used.has(b.id) || b.id === operation.beneficiaryId).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label><label>Montant reçu<input type="number" min="0" step="1" value={operation.amount} onChange={(e) => setField('history', data.history.map((h) => h.id === operation.id ? { ...h, amount: Number(e.target.value) } : h))} /></label><label>Solde reporté<input type="number" min="0" step="1" value={operation.carry} onChange={(e) => setField('history', data.history.map((h) => h.id === operation.id ? { ...h, carry: Number(e.target.value) } : h))} /></label><button type="button" className="danger icon" aria-label="Supprimer l’opération" onClick={() => setField('history', data.history.filter((h) => h.id !== operation.id))}>×</button></div>})}</div>}
      </section>

      <div className="save-bar"><div><strong>Collecte mensuelle : {money(data.contribution * beneficiaries.length)}</strong><span>{data.id ? 'Les changements seront sauvegardés en ligne.' : 'Un code privé sera créé à l’enregistrement.'}</span></div><button disabled={busy}>{busy ? 'Enregistrement…' : data.id ? 'Enregistrer les modifications' : 'Créer et sauvegarder'}</button></div>
    </form>

    <section className="schedule"><div className="section-title"><div><span className="eyebrow">Projection</span><h2>Échéancier</h2></div>{schedule.unserved.length > 0 && <div className="badge warning">⚠ {schedule.unserved.length} non servi{schedule.unserved.length > 1 ? 's' : ''}</div>}</div>
      {schedule.unserved.length > 0 && <div className="notice warning">Tous les bénéficiaires ne pourront pas être servis avant la fin : {schedule.unserved.map((b) => b.label).join(', ')}.</div>}
      <div className="table-wrap"><table><thead><tr><th>Mois</th><th>Fonds disponibles</th><th>Bénéficiaires</th><th>Montants</th><th>Report</th><th>Statut</th></tr></thead><tbody>{schedule.rows.map((row) => <tr key={row.month}><td>{monthLabel(row.month)}</td><td>{money(row.available)}</td><td>{row.payments.map((p) => p.label).join(', ') || '—'}</td><td>{row.payments.map((p) => money(p.amount)).join(', ') || '—'}</td><td>{money(row.carry)}</td><td><span className={`badge ${row.status === 'réalisé' ? 'done' : ''}`}>{row.status}</span></td></tr>)}</tbody></table></div>
    </section>
  </main>
}
