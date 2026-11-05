import { useState } from 'react'
import type { RowInput, Styles } from 'jspdf-autotable'
import { FileText, X, AlertCircle } from 'lucide-react'
import { FileDrop } from './ui'
import { getReportSettings, tintColor } from '../services/ReportSettingsService'
import { formatDateShort, formatDate } from '../utils/dateUtils'
import type { ReportSettings, Vessel, VesselAssured } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { asArray } from '../utils/ipc'

// ── Data model ────────────────────────────────────────────────────────────────

interface LossPayment {
  paymentType: string
  paidDate: string
  paidAmount: number
  reserves: number
  totalIncurred: number
}

interface LossClaim {
  claimId: string
  dateOfLoss: string
  policyId: string
  damageType: string // col H — same for all payments in this claim
  payments: LossPayment[]
  totalPaid: number
  totalReserves: number
  totalIncurred: number
}

interface LossVessel {
  vesselName: string
  policyId: string
  claims: LossClaim[]
  totalPaid: number
  totalReserves: number
  totalIncurred: number
}

interface LossUWY {
  year: number
  vessels: LossVessel[]
  totalPaid: number
  totalReserves: number
  totalIncurred: number
}

/** A vessel of the Excel with its particulars from the app (found = false when no vessel matched) */
interface VesselParticulars {
  /** One row per vessel + policy: another policy can have other assureds */
  key: string
  vesselName: string
  policyId: string
  found: boolean
  /** Why the assureds are blank, or who the vessel is now */
  note?: string
  imo: string
  owners: string[]
  managers: string[]
  others: string[]
}

/** Typed on the report screen for what the app does not have; used for this report only */
interface ManualParticulars {
  imo?: string
  owners?: string
  managers?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const vesselKey = (name: string): string =>
  name
    .toUpperCase()
    .replace(/^(M\/[VTY]|MV|MT|MY)[\s.]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

/** The c/o broker is left out (user 2026-11-02) */
const notCareOf = (role: string | null | undefined): boolean =>
  (role || '').toLowerCase().replace(/[^a-z]/g, '') !== 'co'

/** Owners, managers and the other parties; a plain role prints the name only, any other adds it */
function splitParties(
  parties: { entityName?: string | null; role?: string | null }[]
): Pick<VesselParticulars, 'owners' | 'managers' | 'others'> {
  const named = (re: RegExp, plain: RegExp): string[] => [
    ...new Set(
      parties
        .filter((a) => a.entityName && notCareOf(a.role) && re.test(a.role || ''))
        .map((a) =>
          plain.test((a.role || '').trim()) ? a.entityName! : `${a.entityName} (${a.role})`
        )
    )
  ]
  return {
    owners: named(/owner/i, /^registered owners?$/i),
    managers: named(/manag/i, /^managers?$/i),
    // Every other party (Co-Assured, Operators, Mortgagee, ...) with its role
    others: named(/^(?![\s\S]*(owner|manag))/i, /^$/)
  }
}

/**
 * IMO and parties for each vessel + policy of the Excel. The policy's own assureds come first.
 * A vessel found only by a former name or a policy with no assured leaves them blank to type:
 * today's owners may not have been the assured then.
 */
async function loadParticulars(data: LossUWY[]): Promise<VesselParticulars[]> {
  const wanted = new Map<string, { vesselName: string; policyId: string }>()
  for (const u of data)
    for (const v of u.vessels)
      wanted.set(`${v.vesselName}|${v.policyId}`, {
        vesselName: v.vesselName,
        policyId: v.policyId
      })
  const [vessels, assureds, lookup] = await Promise.all([
    window.api.getVessels().then((r) => asArray<Vessel>(r)),
    window.api.getVesselAssureds().then((r) => asArray<VesselAssured>(r)),
    window.api.getLossRecordLookup([...new Set([...wanted.values()].map((w) => w.policyId))])
  ])
  const blank = { owners: [], managers: [], others: [] }
  const imoOf = (id: string): string => vessels.find((v) => v.id === id)?.imoNumber || ''
  return [...wanted.entries()].map(([key, { vesselName, policyId }]) => {
    const base = { key, vesselName, policyId }
    const policy = lookup.policies?.find((p) => p.policyNumber === policyId)
    if (policy) {
      const parties = splitParties(policy.assureds)
      return {
        ...base,
        found: true,
        imo: imoOf(policy.vesselId),
        ...parties,
        note: policy.assureds.length ? undefined : `No assured recorded on policy ${policyId}.`
      }
    }
    // The same name can belong to an old record: the active vessel wins
    const matches = vessels.filter((v) => vesselKey(v.name) === vesselKey(vesselName))
    const vessel = matches.find((v) => v.isActive) || matches[0]
    if (vessel)
      return {
        ...base,
        found: true,
        imo: vessel.imoNumber || '',
        ...splitParties(assureds.filter((a) => a.vesselId === vessel.id))
      }
    const former = lookup.formerNames?.find(
      (f) => vesselKey(f.previousName) === vesselKey(vesselName)
    )
    const now = former && vessels.find((v) => v.id === former.vesselId)
    if (now)
      return {
        ...base,
        found: true,
        imo: now.imoNumber || '',
        ...blank,
        note: `Former name of ${now.name}. Policy ${policyId || '(none)'} is not in the app, so enter who was assured then.`
      }
    return {
      ...base,
      found: false,
      imo: '',
      ...blank,
      note: 'Not in the app. Check the name in the Excel.'
    }
  })
}

/** What the app has wins; a typed value only fills a blank. One name per line */
function withManual(p: VesselParticulars, m?: ManualParticulars): VesselParticulars {
  const names = (text?: string): string[] =>
    (text || '')
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
  return {
    ...p,
    imo: p.imo || m?.imo?.trim() || '',
    owners: p.owners.length ? p.owners : names(m?.owners),
    managers: p.managers.length ? p.managers : names(m?.managers)
  }
}

function excelSerialToDate(serial: number): string {
  // Excel date serial: days since 1900-01-01, with Lotus 123 leap-year bug correction
  const date = new Date((serial - 25569) * 86400 * 1000)
  return formatDateShort(date)
}

function fmt(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Preview table uses plain number formatting, labelled with the chosen currency

/** Damage type "No Claim Record": a claim was opened but nothing was paid, so its amounts are 0 */
const isNoClaimRecord = (damageType: string): boolean =>
  /^no\s*claims?\s*records?$/i.test(damageType.trim())

// ── Excel parser ──────────────────────────────────────────────────────────────

async function parseExcel(buffer: ArrayBuffer): Promise<LossUWY[]> {
  const XLSX = (await import('xlsx-js-style')).default
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Columns are found by their heading, wherever they are. A missing one stops the report: read by
  // position, a shifted file printed its amounts under the wrong headings without any warning
  const norm = (v: unknown): string =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  const COLUMNS: Record<string, { re: RegExp; label: string; optional?: boolean }> = {
    vessel: { re: /^vessel( name)?$/, label: 'Vessel' },
    dateOfLoss: { re: /^(date of loss|loss date)$/, label: 'Date of Loss' },
    claimId: { re: /^claim( id| no\.?| number| #)?$/, label: 'Claim ID' },
    policyId: { re: /^policy( id| no\.?| number| #)?$/, label: 'Policy ID' },
    uwy: { re: /^(uwy|underwriting year)$/, label: 'UWY' },
    damageType: { re: /^damage( type)?$/, label: 'Damage Type' },
    details: { re: /^(details?|payment type)$/, label: 'Details', optional: true },
    paidDate: { re: /^(paid date|date paid)$/, label: 'Paid Date', optional: true },
    paidAmount: { re: /^paid( amount)?$/, label: 'Paid Amount' },
    reserves: { re: /^reserves?$/, label: 'Reserves' },
    totalIncurred: { re: /^total incurred( claims)?$/, label: 'Total Incurred' }
  }
  const headerIdx = rows.findIndex((r) => r.some((c) => COLUMNS.vessel.re.test(norm(c))))
  if (headerIdx < 0)
    throw new Error('No heading row found: one row must have a column called Vessel.')
  const col: Record<string, number> = {}
  for (const [k, c] of Object.entries(COLUMNS))
    col[k] = rows[headerIdx].findIndex((h) => c.re.test(norm(h)))
  const missing = Object.entries(COLUMNS)
    .filter(([k, c]) => col[k] < 0 && !c.optional)
    .map(([, c]) => c.label)
  if (missing.length) throw new Error(`Columns not found in the Excel: ${missing.join(', ')}.`)

  // Empty rows and repeated heading rows are not data
  const dataRows = rows.slice(headerIdx + 1).filter((r) => {
    const v = norm(r[col.vessel])
    return v !== '' && !COLUMNS.vessel.re.test(v)
  })

  const uwyMap = new Map<
    number,
    Map<string, { policyId: string; claims: Map<string, LossClaim> }>
  >()

  for (const row of dataRows) {
    const vesselName = String(row[col.vessel] || '').trim()
    if (!vesselName) continue

    const rawDate = row[col.dateOfLoss]
    const dateOfLoss =
      typeof rawDate === 'number' ? excelSerialToDate(rawDate) : String(rawDate || '').trim()
    const claimId = String(row[col.claimId] || '').trim()
    const policyId = String(row[col.policyId] || '').trim()
    const uwy = Number(row[col.uwy]) || 0

    const damageType = String(row[col.damageType] || '').trim()
    const paymentType = col.details >= 0 ? String(row[col.details] || '').trim() : ''

    const rawPaidDate = col.paidDate >= 0 ? row[col.paidDate] : ''
    const paidDate =
      typeof rawPaidDate === 'number'
        ? excelSerialToDate(rawPaidDate)
        : String(rawPaidDate || '').trim()

    if (!uwyMap.has(uwy)) uwyMap.set(uwy, new Map())
    const vesselMap = uwyMap.get(uwy)!

    if (!vesselMap.has(vesselName)) vesselMap.set(vesselName, { policyId, claims: new Map() })
    const vesselData = vesselMap.get(vesselName)!

    if (!vesselData.claims.has(claimId)) {
      vesselData.claims.set(claimId, {
        claimId,
        dateOfLoss,
        policyId,
        damageType,
        payments: [],
        totalPaid: 0,
        totalReserves: 0,
        totalIncurred: 0
      })
    }

    const claim = vesselData.claims.get(claimId)!
    // The damage type may be filled on the claim's first row only
    const noClaim = isNoClaimRecord(damageType || claim.damageType)
    const paidAmount = noClaim ? 0 : Number(row[col.paidAmount]) || 0
    const reserves = noClaim ? 0 : Number(row[col.reserves]) || 0
    const totalIncurred = noClaim ? 0 : Number(row[col.totalIncurred]) || 0
    claim.payments.push({ paymentType, paidDate, paidAmount, reserves, totalIncurred })
    claim.totalPaid += paidAmount
    claim.totalReserves += reserves
    claim.totalIncurred += totalIncurred
  }

  const result: LossUWY[] = []
  for (const [year, vesselMap] of [...uwyMap.entries()].sort((a, b) => a[0] - b[0])) {
    let uwyTotalPaid = 0,
      uwyTotalReserves = 0,
      uwyTotalIncurred = 0
    const vessels: LossVessel[] = []

    for (const [vesselName, { policyId, claims }] of vesselMap.entries()) {
      const claimList = [...claims.values()]
      const vPaid = claimList.reduce((s, c) => s + c.totalPaid, 0)
      const vRes = claimList.reduce((s, c) => s + c.totalReserves, 0)
      const vInc = claimList.reduce((s, c) => s + c.totalIncurred, 0)
      vessels.push({
        vesselName,
        policyId,
        claims: claimList,
        totalPaid: vPaid,
        totalReserves: vRes,
        totalIncurred: vInc
      })
      uwyTotalPaid += vPaid
      uwyTotalReserves += vRes
      uwyTotalIncurred += vInc
    }

    result.push({
      year,
      vessels,
      totalPaid: uwyTotalPaid,
      totalReserves: uwyTotalReserves,
      totalIncurred: uwyTotalIncurred
    })
  }

  return result
}

// ── PDF export ────────────────────────────────────────────────────────────────

interface LossReportOpts {
  currency: string
  showReserves: boolean
  showClaimSubtotals: boolean
}

async function exportToPDF(
  data: LossUWY[],
  particulars: VesselParticulars[],
  s: ReportSettings,
  opts: LossReportOpts
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const primary = s.primaryColor
  const vesselBg = tintColor(primary, 0.82)
  const vesselText: [number, number, number] = [
    Math.round(primary[0] * 0.4),
    Math.round(primary[1] * 0.4),
    Math.round(primary[2] * 0.4)
  ]
  const claimBg = tintColor(primary, 0.95)
  const vesselTotalBg = tintColor(primary, 0.7)
  const cur = opts.currency

  const doc = new jsPDF()

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(15, 18, 24)
  doc.rect(0, 5, 210, s.companySubtitle ? 50 : 46, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(s.companyName, 14, 20)

  if (s.companySubtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(190, 190, 190)
    doc.text(s.companySubtitle, 14, 28)
  }

  const titleY = s.companySubtitle ? 40 : 34
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Loss Record', 14, titleY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 190, 190)
  doc.text(`Date Issued: ${formatDate(new Date())}`, 14, titleY + 9)

  // ── Column layout ────────────────────────────────────────────────────────
  // With reserves: Claim# | Date | Damage Type | Payment Type | Paid | Reserves | Total = 182mm
  //   22 | 22 | 36 | 30 | 24 | 24 | 24 = 182
  // Without reserves: Claim# | Date | Damage Type | Payment Type | Paid | Total = 182mm
  //   22 | 22 | 44 | 36 | 28 | 30 = 182

  const showRes = opts.showReserves
  const colCount = showRes ? 7 : 6

  const colWidths = showRes
    ? { claimId: 22, date: 22, dmg: 36, payType: 30, paid: 24, res: 24, total: 24 }
    : { claimId: 22, date: 22, dmg: 44, payType: 36, paid: 28, total: 30 }

  const headRow = showRes
    ? [
        'Claim #',
        'Date of Loss',
        'Damage Type',
        'Payment Type',
        `Paid (${cur})`,
        `Reserves (${cur})`,
        `Total Incurred (${cur})`
      ]
    : [
        'Claim #',
        'Date of Loss',
        'Damage Type',
        'Payment Type',
        `Paid (${cur})`,
        `Total Incurred (${cur})`
      ]

  const R: Partial<Styles> = { halign: 'right' }

  const S = {
    uwyHeader: {
      fillColor: primary,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 10
    },
    vesselHeader: {
      fillColor: vesselBg,
      textColor: vesselText,
      fontStyle: 'bold' as const,
      fontSize: 9
    },
    claimTotal: {
      fillColor: claimBg,
      textColor: [40, 40, 40] as [number, number, number],
      fontStyle: 'italic' as const,
      fontSize: 9
    },
    vesselTotal: {
      fillColor: vesselTotalBg,
      textColor: vesselText,
      fontStyle: 'bold' as const,
      fontSize: 9
    },
    uwyTotal: {
      fillColor: primary,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 9
    },
    grandTotal: {
      fillColor: [15, 18, 24] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      fontSize: 9
    }
  }

  // ── Build table body ─────────────────────────────────────────────────────
  const bodyRows: RowInput[] = []
  let grandPaid = 0,
    grandReserves = 0,
    grandIncurred = 0

  const fmtCur = (v: number): string =>
    `${cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$'}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  for (const uwy of data) {
    bodyRows.push([
      {
        content: uwy.year ? `UNDERWRITING YEAR ${uwy.year}` : 'UNDERWRITING YEAR NOT GIVEN',
        colSpan: colCount,
        styles: S.uwyHeader
      }
    ])

    for (const vessel of uwy.vessels) {
      bodyRows.push([
        {
          content: `${vessel.vesselName}   ·   Policy: ${vessel.policyId}`,
          colSpan: colCount,
          styles: S.vesselHeader
        }
      ])

      for (const claim of vessel.claims) {
        const multi = claim.payments.length > 1

        if (showRes) {
          // First payment row: show claimId, date, damageType, then per-payment cols
          for (let i = 0; i < claim.payments.length; i++) {
            const p = claim.payments[i]
            bodyRows.push([
              i === 0 ? claim.claimId : '',
              i === 0 ? claim.dateOfLoss : '',
              i === 0 ? claim.damageType : '',
              p.paymentType,
              { content: fmtCur(p.paidAmount), styles: R },
              { content: fmtCur(p.reserves), styles: R },
              { content: fmtCur(p.totalIncurred), styles: R }
            ])
          }
          if (multi && opts.showClaimSubtotals) {
            bodyRows.push([
              '',
              '',
              {
                content: `Claim ${claim.claimId} Total`,
                colSpan: 2,
                styles: { ...S.claimTotal, halign: 'right' as const }
              },
              { content: fmtCur(claim.totalPaid), styles: { ...S.claimTotal, ...R } },
              { content: fmtCur(claim.totalReserves), styles: { ...S.claimTotal, ...R } },
              { content: fmtCur(claim.totalIncurred), styles: { ...S.claimTotal, ...R } }
            ])
          }
        } else {
          for (let i = 0; i < claim.payments.length; i++) {
            const p = claim.payments[i]
            bodyRows.push([
              i === 0 ? claim.claimId : '',
              i === 0 ? claim.dateOfLoss : '',
              i === 0 ? claim.damageType : '',
              p.paymentType,
              { content: fmtCur(p.paidAmount), styles: R },
              { content: fmtCur(p.totalIncurred), styles: R }
            ])
          }
          if (multi && opts.showClaimSubtotals) {
            bodyRows.push([
              '',
              '',
              {
                content: `Claim ${claim.claimId} Total`,
                colSpan: 2,
                styles: { ...S.claimTotal, halign: 'right' as const }
              },
              { content: fmtCur(claim.totalPaid), styles: { ...S.claimTotal, ...R } },
              { content: fmtCur(claim.totalIncurred), styles: { ...S.claimTotal, ...R } }
            ])
          }
        }
      }

      // colCount = 7 (with res) or 6 (without). Totals: span all except last 2 or 3
      // With res: span 4 cols, then paid, res, total
      // Without res: span 4 cols, then paid, total
      bodyRows.push([
        {
          content: `${vessel.vesselName} Total`,
          colSpan: colCount - (showRes ? 3 : 2),
          styles: { ...S.vesselTotal, halign: 'right' as const }
        },
        { content: fmtCur(vessel.totalPaid), styles: { ...S.vesselTotal, ...R } },
        ...(showRes
          ? [{ content: fmtCur(vessel.totalReserves), styles: { ...S.vesselTotal, ...R } }]
          : []),
        { content: fmtCur(vessel.totalIncurred), styles: { ...S.vesselTotal, ...R } }
      ])
    }

    bodyRows.push([
      {
        content: uwy.year ? `Underwriting Year ${uwy.year} Total` : 'Total',
        colSpan: colCount - (showRes ? 3 : 2),
        styles: { ...S.uwyTotal, halign: 'right' as const }
      },
      { content: fmtCur(uwy.totalPaid), styles: { ...S.uwyTotal, ...R } },
      ...(showRes ? [{ content: fmtCur(uwy.totalReserves), styles: { ...S.uwyTotal, ...R } }] : []),
      { content: fmtCur(uwy.totalIncurred), styles: { ...S.uwyTotal, ...R } }
    ])

    grandPaid += uwy.totalPaid
    grandReserves += uwy.totalReserves
    grandIncurred += uwy.totalIncurred
  }

  bodyRows.push([
    {
      content: 'Grand Total',
      colSpan: colCount - (showRes ? 3 : 2),
      styles: { ...S.grandTotal, halign: 'right' as const }
    },
    { content: fmtCur(grandPaid), styles: { ...S.grandTotal, ...R } },
    ...(showRes ? [{ content: fmtCur(grandReserves), styles: { ...S.grandTotal, ...R } }] : []),
    { content: fmtCur(grandIncurred), styles: { ...S.grandTotal, ...R } }
  ])

  // ── Vessel particulars (always, even for one vessel) ──────────────────────
  const margin = { top: 14, right: 14, bottom: 42, left: 14 }
  autoTable(doc, {
    startY: s.companySubtitle ? 64 : 60,
    margin,
    head: [['Vessel', 'IMO', 'Owners', 'Managers', 'Other Parties']],
    body: particulars.map((p) => [
      // The same vessel on two policies: the policy tells the rows apart
      particulars.filter((x) => x.vesselName === p.vesselName).length > 1
        ? `${p.vesselName}\n${p.policyId}`
        : p.vesselName,
      p.imo || '-',
      p.owners.join('\n') || '-',
      p.managers.join('\n') || '-',
      p.others.join('\n') || '-'
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      lineColor: primary
    },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: 'bold' },
      1: { cellWidth: 18 },
      2: { cellWidth: 44 },
      3: { cellWidth: 44 },
      4: { cellWidth: 44 }
    },
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      lineColor: [210, 215, 220],
      lineWidth: 0.3,
      textColor: [20, 20, 20],
      overflow: 'linebreak'
    }
  })

  // ── Render table ─────────────────────────────────────────────────────────
  const startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  const numCol = { halign: 'right' as const, overflow: 'ellipsize' as const }
  const w: Partial<
    Record<'claimId' | 'date' | 'dmg' | 'payType' | 'paid' | 'res' | 'total', number>
  > = colWidths
  const columnStyles: Record<number, Partial<Styles>> = showRes
    ? {
        0: { cellWidth: w.claimId, halign: 'center' },
        1: { cellWidth: w.date, overflow: 'ellipsize' },
        2: { cellWidth: w.dmg },
        3: { cellWidth: w.payType },
        4: { cellWidth: w.paid, ...numCol },
        5: { cellWidth: w.res, ...numCol },
        6: { cellWidth: w.total, ...numCol }
      }
    : {
        0: { cellWidth: w.claimId, halign: 'center' },
        1: { cellWidth: w.date, overflow: 'ellipsize' },
        2: { cellWidth: w.dmg },
        3: { cellWidth: w.payType },
        4: { cellWidth: w.paid, ...numCol },
        5: { cellWidth: w.total, ...numCol }
      }

  autoTable(doc, {
    startY,
    margin,
    head: [headRow],
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      lineColor: primary
    },
    columnStyles,
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      lineColor: [210, 215, 220],
      lineWidth: 0.3,
      textColor: [20, 20, 20],
      overflow: 'linebreak'
    },
    alternateRowStyles: { fillColor: [250, 251, 252] }
  })

  // ── Page footers ─────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(14, 270, 196, 270)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(s.footerText, 14, 274)
    doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
  }

  doc.save(`Loss_Record_${new Date().toISOString().split('T')[0]}.pdf`)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LossRecordReport(): React.JSX.Element {
  const [data, setData] = useState<LossUWY[] | null>(null)
  const [particulars, setParticulars] = useState<VesselParticulars[]>([])
  const [manual, setManual] = useState<Record<string, ManualParticulars>>({})
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Report-specific options (not shared with other reports)
  const [currency, setCurrency] = useState('USD')
  const { showSuccess, showError } = useToast()
  const [showReserves, setShowReserves] = useState(true)
  const [showClaimSubtotals, setShowClaimSubtotals] = useState(true)

  const handleFile = (file: File): void => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Please select an Excel file (.xlsx or .xls).')
      return
    }
    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = async (e): Promise<void> => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        const parsed = await parseExcel(buffer)
        if (parsed.length === 0) {
          setError('No data found in the file. Make sure the sheet matches the expected format.')
          setData(null)
        } else {
          setData(parsed)
          setParticulars(await loadParticulars(parsed))
        }
      } catch (err) {
        setError(
          (err instanceof Error && err.message) ||
            'Failed to read the file. Make sure it matches the expected format.'
        )
        setData(null)
        setFileName('')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleExport = async (): Promise<void> => {
    if (!data) return
    setExporting(true)
    try {
      const settings = await getReportSettings()
      await exportToPDF(data, merged, settings, {
        currency,
        showReserves,
        showClaimSubtotals
      })
      showSuccess('Loss record exported')
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to export the loss record')
    } finally {
      setExporting(false)
    }
  }

  const clearData = (): void => {
    setData(null)
    setParticulars([])
    setManual({})
    setFileName('')
    setError(null)
  }

  const merged = particulars.map((p) => withManual(p, manual[p.key]))
  const particularsOf = new Map(merged.map((p) => [p.key, p]))
  const noUwy = data
    ? [...new Set(data.filter((u) => !u.year).flatMap((u) => u.vessels.map((v) => v.vesselName)))]
    : []
  // Judged on what the app has, so a row stays on screen while its field is being typed
  const incomplete = particulars.filter((p) => !p.imo || !p.owners.length || !p.managers.length)
  const setManualField = (key: string, field: keyof ManualParticulars, value: string): void =>
    setManual((m) => ({ ...m, [key]: { ...m[key], [field]: value } }))

  // Summary stats derived from parsed data
  const stats = data
    ? {
        uwyCount: data.length,
        vesselCount: data.reduce((s, u) => s + u.vessels.length, 0),
        claimCount: data.reduce((s, u) => u.vessels.reduce((sv, v) => sv + v.claims.length, s), 0),
        totalIncurred: data.reduce((s, u) => s + u.totalIncurred, 0)
      }
    : null

  const border = 'var(--glass-border)'

  return (
    <div>
      {/* Upload zone */}
      {!data ? (
        <FileDrop
          accept=".xlsx,.xls"
          title="Drop your Excel file here"
          hint="or click to browse - .xlsx and .xls files in the standard loss record format"
          onFiles={([f]) => handleFile(f)}
        />
      ) : (
        /* Loaded state */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* File info bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 18px',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              border
            }}
          >
            <FileText size={20} color="var(--accent-primary)" />
            <span
              style={{
                fontWeight: '600',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                flex: 1
              }}
            >
              {fileName}
            </span>
            <button onClick={clearData} className="btn-ghost btn-icon" title="Remove file">
              <X size={16} />
            </button>
          </div>

          {/* Summary stats */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {[
                { label: 'Underwriting Years', value: stats.uwyCount },
                { label: 'Vessels', value: stats.vesselCount },
                { label: 'Claims', value: stats.claimCount },
                { label: `Total Incurred (${currency})`, value: fmt(stats.totalIncurred) }
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: '16px 20px',
                    background: 'var(--bg-card)',
                    borderRadius: '10px',
                    border
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '6px'
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {noUwy.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                color: 'var(--text-primary)'
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.88rem' }}>
                No underwriting year in the Excel for <strong>{noUwy.join(', ')}</strong>. Add it to
                the file and load it again, or it prints as &quot;not given&quot;.
              </span>
            </div>
          )}

          {/* What the app does not have for a vessel can be typed for this report */}
          {incomplete.length > 0 && (
            <div className="table-wrap">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--table-border)'
                }}
              >
                <AlertCircle size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
                <div>
                  <div
                    style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}
                  >
                    Missing vessel details
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Type what is missing, one name per line. It prints on this report only and is
                    not saved to the vessel.
                  </div>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Vessel</th>
                    <th style={{ width: '14%' }}>IMO</th>
                    <th style={{ width: '32%' }}>Owners</th>
                    <th style={{ width: '32%' }}>Managers</th>
                  </tr>
                </thead>
                <tbody>
                  {incomplete.map((p) => {
                    const typed = manual[p.key]
                    const names = (
                      field: 'owners' | 'managers',
                      label: string
                    ): React.JSX.Element =>
                      p[field].length ? (
                        <td className="muted">{p[field].join(', ')}</td>
                      ) : (
                        <td>
                          <textarea
                            rows={2}
                            aria-label={`${label} of ${p.vesselName}`}
                            value={typed?.[field] || ''}
                            onChange={(e) => setManualField(p.key, field, e.target.value)}
                            style={{ width: '100%', resize: 'vertical' }}
                          />
                        </td>
                      )
                    return (
                      <tr key={p.key}>
                        <td style={{ fontWeight: '600', verticalAlign: 'top' }}>
                          {p.vesselName}
                          {p.note && (
                            <div
                              style={{
                                fontWeight: '400',
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary)'
                              }}
                            >
                              {p.note}
                            </div>
                          )}
                        </td>
                        {p.imo ? (
                          <td className="muted">
                            <span className="mono">{p.imo}</span>
                          </td>
                        ) : (
                          <td>
                            <input
                              type="text"
                              aria-label={`IMO of ${p.vesselName}`}
                              value={typed?.imo || ''}
                              onChange={(e) => setManualField(p.key, 'imo', e.target.value)}
                              style={{ width: '100%' }}
                            />
                          </td>
                        )}
                        {names('owners', 'Owners')}
                        {names('managers', 'Managers')}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* UWY breakdown preview */}
          <div className="table-wrap">
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--table-border)',
                fontWeight: '600',
                fontSize: '0.9rem',
                color: 'var(--text-primary)'
              }}
            >
              Preview
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    'UWY',
                    'Vessel',
                    'IMO',
                    'Policy',
                    'Claims',
                    `Total Paid (${currency})`,
                    `Reserves (${currency})`,
                    `Total Incurred (${currency})`
                  ].map((h, i) => (
                    <th key={h} className={i >= 5 ? 'num' : undefined}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.flatMap((uwy) =>
                  uwy.vessels.map((v, vi) => (
                    <tr key={`${uwy.year}-${v.vesselName}`}>
                      <td className="muted">{vi === 0 ? uwy.year || 'Not given' : ''}</td>
                      <td style={{ fontWeight: '600' }}>{v.vesselName}</td>
                      <td className="muted">
                        <span className="mono">
                          {particularsOf.get(`${v.vesselName}|${v.policyId}`)?.imo || '-'}
                        </span>
                      </td>
                      <td className="muted">
                        <span className="mono">{v.policyId}</span>
                      </td>
                      <td>{v.claims.length}</td>
                      <td className="num">{fmt(v.totalPaid)}</td>
                      <td className="num">{fmt(v.totalReserves)}</td>
                      <td className="num" style={{ fontWeight: '600' }}>
                        {fmt(v.totalIncurred)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Report options */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              padding: '14px 18px',
              background: 'var(--bg-card)',
              borderRadius: '10px',
              border,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '500' }}
              >
                Currency
              </label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--text-primary)'
              }}
            >
              <input
                type="checkbox"
                checked={showReserves}
                onChange={(e) => setShowReserves(e.target.checked)}
              />
              Show Reserves column
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--text-primary)'
              }}
            >
              <input
                type="checkbox"
                checked={showClaimSubtotals}
                onChange={(e) => setShowClaimSubtotals(e.target.checked)}
              />
              Show claim subtotals
            </label>
          </div>

          {/* Export button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary"
              style={{
                padding: '10px 28px',
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FileText size={16} />
              {exporting ? 'Generating PDF...' : 'Export PDF Report'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
            color: 'var(--danger)'
          }}
        >
          <AlertCircle size={16} />
          <span style={{ fontSize: '0.88rem' }}>{error}</span>
        </div>
      )}
    </div>
  )
}
