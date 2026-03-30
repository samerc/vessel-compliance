import XLSX from 'xlsx-js-style'

interface ParsedRow {
  shipName: string
  broker: string
  imo: string
  year: number | null
  flag: string
  classification: string
  grossTonnage: number | null
  vesselType: string
  fleetName: string
  status: string
  notes: string
  hull: PolicyRecord | null
  pi: PolicyRecord | null
  war: PolicyRecord | null
  conditionSurvey: string
  surveyDone: string
  surveyDate: string
  surveyReference: string
}

interface PolicyRecord {
  policyCategory: 'hull' | 'pi' | 'war'
  policyNumber: string
  coverageCode: string
  inceptionDate: string
  endDate: string
  currency: string
  hmValue?: number
  ivValue?: number
  hmPremium?: number
  ivPremium?: number
  deductible?: number
  amd?: number
  generalAverage?: number
  limitOfLiability?: number
  premium?: number
  warRate?: string
  upcc?: string
  ncb?: string
  ourShare?: string
  notes?: string
  conditionSurvey?: string
  surveyDone?: string
  surveyDate?: string
  surveyReference?: string
  broker?: string
  fleetName?: string
}

export interface ImportResult {
  imported: number
  skippedCancelled: number
  totalRows: number
  unmatched: { ship: string; imo: string; broker: string; fleet: string }[]
}

function cleanCurrency(val: any): { amount: number | null; currency: string } {
  if (val == null || val === '' || val === '-') return { amount: null, currency: 'USD' }
  const str = String(val).trim()
  const currency = str.includes('€') ? 'EUR' : 'USD'
  const cleaned = str.replace(/[^0-9.,]/g, '').replace(/,/g, '')
  const num = parseFloat(cleaned)
  return { amount: isNaN(num) ? null : num, currency }
}

function cleanNumber(val: any): number | null {
  if (val == null || val === '' || val === '-') return null
  const str = String(val).trim().replace(/[^0-9.,]/g, '').replace(/,/g, '')
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

function cleanStr(val: any): string {
  if (val == null) return ''
  return String(val).trim()
}

function isBlankOrDash(val: any): boolean {
  if (val == null) return true
  const s = String(val).trim()
  return s === '' || s === '-'
}

function excelDateToISO(val: any): string {
  if (val == null || val === '' || val === '-') return ''
  if (typeof val === 'number' && val > 0) {
    // Manual Excel serial date conversion (days since 1899-12-30)
    let serial = Math.floor(val)
    // Excel has a bug where it thinks 1900 is a leap year (Lotus 123 compatibility)
    if (serial > 60) serial--
    const epoch = new Date(1899, 11, 30) // Dec 30, 1899
    const date = new Date(epoch.getTime() + serial * 86400000)
    if (!isNaN(date.getTime())) {
      // Store as ISO format YYYY-MM-DD for proper MySQL date comparisons
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }
  // Try to parse DD-Mon-YY or other text date formats to ISO
  const str = String(val).trim()
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime()) && str.length > 3) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return str
}

export function parseVesselExcel(filePath: string): ParsedRow[] {
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })

  const parsed: ParsedRow[] = []

  for (const row of rows) {
    const shipName = cleanStr(row['Ship'] || row['\uFEFFShip'])
    if (!shipName) continue

    const status = cleanStr(row['Status'])
    if (status.toLowerCase() === 'cancelled') continue

    const imo = cleanStr(row['IMO'])
    const year = cleanNumber(row['Year'])
    const flag = cleanStr(row['Flag'])
    const classification = cleanStr(row['Class'])
    const gt = cleanNumber(row['GT'] || row[' GT '])
    const vesselType = cleanStr(row['Type'])
    const broker = cleanStr(row['C/O'])
    const fleetName = cleanStr(row['Fleet'])
    const ourShare = cleanStr(row['Our Share'])
    const rowNotes = cleanStr(row['Notes'])
    const condSurvey = cleanStr(row['Condition Survey'])
    const surveyDone = cleanStr(row['Survey Done'])
    const surveyDate = excelDateToISO(row['Date of Last Survey'])
    const surveyRef = cleanStr(row['Survey Reference'])

    // Hull policy
    let hull: PolicyRecord | null = null
    const hullPolicyNum = cleanStr(row['Hull Policy Number'])
    if (!isBlankOrDash(hullPolicyNum)) {
      const hmVal = cleanCurrency(row['H&M Value'] || row[' H&M Value '])
      const ivVal = cleanCurrency(row['IV Value'] || row[' IV Value '])
      const hmPrem = cleanCurrency(row['H&M Premium'] || row[' H&M Premium '])
      const ivPrem = cleanCurrency(row['IV Premium'] || row[' IV Premium '])
      const ded = cleanCurrency(row['Deductible'] || row[' Deductible '])
      const amdVal = cleanCurrency(row['AMD'] || row[' AMD '])
      const gaVal = cleanCurrency(row['General Average'] || row[' General Average '])
      // Determine currency from the first non-null value
      const currency = hmVal.currency !== 'USD' ? hmVal.currency : hmPrem.currency !== 'USD' ? hmPrem.currency : 'USD'
      hull = {
        policyCategory: 'hull',
        policyNumber: hullPolicyNum,
        coverageCode: cleanStr(row['H&M']),
        inceptionDate: excelDateToISO(row['Inception']),
        endDate: excelDateToISO(row['End']),
        currency,
        hmValue: hmVal.amount ?? undefined,
        ivValue: ivVal.amount ?? undefined,
        hmPremium: hmPrem.amount ?? undefined,
        ivPremium: ivPrem.amount ?? undefined,
        deductible: ded.amount ?? undefined,
        amd: amdVal.amount ?? undefined,
        generalAverage: gaVal.amount ?? undefined,
        upcc: cleanStr(row['UPCC']) || undefined,
        ncb: cleanStr(row['NCB']) || undefined,
        ourShare: ourShare || undefined,
        broker: broker || undefined,
        fleetName: fleetName || undefined
      }
    }

    // P&I policy
    let pi: PolicyRecord | null = null
    const piPolicyNum = cleanStr(row['P&I Policy Number'] || row[' P&I Policy Number '])
    if (!isBlankOrDash(piPolicyNum)) {
      const lol = cleanCurrency(row['Limit of Liability'] || row[' Limit of Liability '])
      const prem = cleanCurrency(row['Premium'] || row[' Premium '])
      const currency = lol.currency !== 'USD' ? lol.currency : prem.currency !== 'USD' ? prem.currency : 'USD'
      pi = {
        policyCategory: 'pi',
        policyNumber: piPolicyNum,
        coverageCode: cleanStr(row['P&I']),
        inceptionDate: excelDateToISO(row['Inception2']),
        endDate: excelDateToISO(row['End3']),
        currency,
        limitOfLiability: lol.amount ?? undefined,
        premium: prem.amount ?? undefined,
        upcc: cleanStr(row['UPCC4']) || undefined,
        ncb: cleanStr(row['NCB5']) || undefined,
        ourShare: ourShare || undefined,
        conditionSurvey: condSurvey || undefined,
        surveyDone: surveyDone || undefined,
        surveyDate: surveyDate || undefined,
        surveyReference: surveyRef || undefined,
        broker: broker || undefined,
        fleetName: fleetName || undefined,
        notes: rowNotes || undefined
      }
    }

    // War policy
    let war: PolicyRecord | null = null
    const warFlag = cleanStr(row['War'])
    if (warFlag.toLowerCase() === 'yes') {
      war = {
        policyCategory: 'war',
        policyNumber: cleanStr(row['War Policy Number']),
        coverageCode: '',
        inceptionDate: '',
        endDate: '',
        currency: 'USD',
        warRate: cleanStr(row['Rate']) || undefined,
        ourShare: ourShare || undefined,
        broker: broker || undefined,
        fleetName: fleetName || undefined,
        notes: rowNotes || undefined
      }
    }

    parsed.push({
      shipName,
      broker,
      imo,
      year,
      flag,
      classification,
      grossTonnage: gt,
      vesselType,
      fleetName,
      status,
      notes: rowNotes,
      hull,
      pi,
      war,
      conditionSurvey: condSurvey,
      surveyDone,
      surveyDate,
      surveyReference: surveyRef
    })
  }

  return parsed
}
