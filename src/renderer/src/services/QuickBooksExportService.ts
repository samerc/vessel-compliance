import XLSX from 'xlsx-js-style'

// ── Column descriptions (Row 1) ─────────────────────────────────────────────
const HEADER_DESCRIPTIONS = [
  'Serial Number', 'Sales Order No', 'End', 'PO Number', 'Sales Order Date',
  'Customer', 'Billing Address Line 1', 'Billing Address Line 2', 'Billing Address Line 3',
  'Billing Address Line 4', 'Billing Address City', 'Billing Address State',
  'Billing Address Country', 'FOB', 'P_Date', 'Due Date', 'Ship Date',
  'No. of Days', 'Product/Service Class', 'Memo', 'Class', 'Shipping Address Line 1',
  'Shipping Address Line 2', 'Shipping Address Line 3', 'Shipping Address City',
  'Shipping Address State', 'Shipping Address Zip', 'Shipping Address Country',
  'IMO', 'IMO #', 'M/V Type', 'Flag', 'Built', 'GT', 'M/V Class',
  'Ex.Com', 'Terms', 'Product/Service Amount', 'Shipping Method', 'Currency',
  'Exchange Rate', 'Amount Received', 'Total Amount', 'Value', 'Order',
  'Sum Insured', 'AGR/Rate', 'Tech Prem', 'NCB', 'G A Prem', 'Conditions',
  'Deductible', 'Condition Survey', 'Interest', 'Remarks', 'Subjectivities',
  'Matter Insured', 'Voyage Fm', 'Voyage To', 'Product/Service',
  'Product/Service Description', 'Template', 'Is Closed', 'Sales Rep'
]

// ── Column names (Row 2) ────────────────────────────────────────────────────
const HEADER_NAMES = [
  'S.No', 'Sales Order No', 'End', 'PO Number', 'Sales Order Date',
  'Customer', 'Billing Address Line 1', 'Billing Address Line 2', 'Billing Address Line 3',
  'Billing Address Line 4', 'Billing Address City', 'Billing Address State',
  'Billing Address Country', 'FOB', 'P_Date', 'Due Date', 'Ship Date',
  'No. of Days', 'Product/Service Class', 'Memo', 'Class', 'Shipping Address Line 1',
  'Shipping Address Line 2', 'Shipping Address Line 3', 'Shipping Address City',
  'Shipping Address State', 'Shipping Address Zip', 'Shipping Address Country',
  'IMO', 'IMO #', 'M/V Type', 'Flag', 'Built', 'GT', 'M/V Class',
  'Ex.Com', 'Terms', 'Product/Service Amount', 'Shipping Method', 'Currency',
  'Exchange Rate', 'Amount Received', 'Total Amount', 'Value', 'Order',
  'Sum Insured', 'AGR/Rate', 'Tech Prem', 'NCB', 'G A Prem', 'Conditions',
  'Deductible', 'Condition Survey', 'Interest', 'Remarks', 'Subjectivities',
  'Matter Insured', 'Voyage Fm', 'Voyage To', 'Product/Service',
  'Product/Service Description', 'Template', 'Is Closed', 'Sales Rep'
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateMDY(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '--'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}-${dd}-${yyyy}`
}

function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '--'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
}

function formatWithCommas(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '--'
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function encodeDeductibles(deductibles: any[], allDeductibleDefs: any[]): string {
  if (!deductibles.length) return '--'
  return deductibles.map(d => {
    const def = allDeductibleDefs.find((dd: any) => dd.id === d.piDeductibleId)
    const code = def?.letterCode || '?'
    const amount = (d.amount || 0) / 1000
    const amtStr = amount === Math.floor(amount) ? String(amount) : amount.toFixed(1)
    return code + amtStr
  }).join('')
}

function getConditionsSummary(quotation: any, clauses: any[]): string {
  if (!quotation) return '--'
  if (quotation.quotationTypeCode === 'H') {
    return clauses[0]?.name || clauses[0]?.code || '--'
  }
  const codes = clauses.map((c: any) => c.code || c.name).filter(Boolean)
  return codes.length > 0 ? codes.join(', ') : '--'
}

function getInterestLabel(typeCode: string, typeName: string): string {
  const codeMap: Record<string, string> = { P: 'P&I', H: 'H&M', W: 'WAR', C: 'CARGO' }
  return codeMap[typeCode] || typeName || '--'
}

// ── Main export function ────────────────────────────────────────────────────

export async function exportPolicyToQuickBooks(policyId: string): Promise<void> {
  // 1. Load policy data
  const policy = await window.api.policyGetById(policyId)
  if (!policy || (policy as any).error) throw new Error('Policy not found')

  const [instalments, addresses] = await Promise.all([
    window.api.policyGetInstalments(policyId),
    window.api.policyGetAddresses(policyId),
  ])
  const safeInstalments = Array.isArray(instalments) ? instalments : []
  const safeAddresses = Array.isArray(addresses) ? addresses : []

  // 2. Load quotation data if linked
  let quotation: any = null
  let qDeductibles: any[] = []
  let qWarranties: any[] = []
  let qSubjectivities: any[] = []
  let qClauses: any[] = []
  let deductibleDefs: any[] = []

  if (policy.quotationId) {
    try {
      const [q, deds, wars, subs, cls, dedDefs] = await Promise.all([
        window.api.getQuotation(policy.quotationId),
        window.api.getQuotationDeductibles(policy.quotationId),
        window.api.getQuotationWarranties(policy.quotationId),
        window.api.getQuotationSubjectivities(policy.quotationId),
        window.api.piGetClauses(),
        window.api.piGetDeductibles()
      ])
      quotation = q
      qDeductibles = Array.isArray(deds) ? deds : []
      qWarranties = Array.isArray(wars) ? wars : []
      qSubjectivities = Array.isArray(subs) ? subs : []
      qClauses = Array.isArray(cls) ? cls : []
      deductibleDefs = Array.isArray(dedDefs) ? dedDefs : []
    } catch { /* ignore — quotation data is supplementary */ }
  }

  // 4. Resolve entity addresses
  const ownerAddr = safeAddresses.find((a: any) => a.role?.toLowerCase().includes('owner'))
  const managerAddr = safeAddresses.find((a: any) => a.role?.toLowerCase().includes('manager'))
  const otherAddrs = safeAddresses.filter((a: any) =>
    !a.role?.toLowerCase().includes('owner') && !a.role?.toLowerCase().includes('manager')
  )

  // 5. Compute fields
  const premium = policy.premiumAmount || 0
  const exchangeRate = policy.exchangeRate || 1
  const amountReceived = Math.round(premium * exchangeRate * 100) / 100
  const commPct = policy.commissionPercent ? `${policy.commissionPercent}%` : '--'
  const numDays = policy.inceptionDate && policy.expiryDate
    ? daysBetween(policy.inceptionDate, policy.expiryDate)
    : 0

  // Value / insured value from quotation
  const insuredValue = quotation?.agreedValue || quotation?.limitOfLiabilityAmount || 0
  const technicalPremium = quotation?.premiumAmount || premium
  const ncbPct = quotation?.ncbEnabled && quotation?.ncbDiscountPercent
    ? `${quotation.ncbDiscountPercent}%` : '--'

  // Gross adjusted premium
  let grossPremium = technicalPremium
  if (quotation?.ncbEnabled && quotation?.ncbDiscountPercent) {
    grossPremium = grossPremium * (1 - quotation.ncbDiscountPercent / 100)
  }
  if (quotation?.upccEnabled && quotation?.upccDiscountPercent) {
    grossPremium = grossPremium * (1 - quotation.upccDiscountPercent / 100)
  }

  // Rate
  const rate = insuredValue > 0
    ? ((premium / insuredValue) * 100).toFixed(4) + '%'
    : '--'

  // Flag format: "ISO3  FlagName"
  const flagStr = policy.flagIso3Code && policy.flagStateName
    ? `${policy.flagIso3Code}  ${policy.flagStateName}`
    : policy.flagStateName || '--'

  // Shipping method
  const shippingMethod = policy.customerType === 'broker' ? 'Indirect' : 'Direct'

  // Conditions summary
  const conditionsSummary = getConditionsSummary(quotation, qClauses)

  // Deductible encoded
  const deductibleStr = encodeDeductibles(qDeductibles, deductibleDefs)

  // Survey warranty text
  const surveyWarranty = qWarranties.length > 0 ? 'Yes' : '--'

  // Subjectivities
  const hasSubjectivities = qSubjectivities.length > 0 ? 'Yes' : 'No'

  // Currency from quotation or default
  const currency = quotation?.premiumCurrency || 'USD'

  // 6. Build data row
  const dataRow = [
    1, // S.No
    policy.policyNumber || '', // Sales Order No
    '--', // End
    policy.policyNumber || '', // PO Number
    formatDateMDY(policy.createdAt), // Sales Order Date
    policy.customerName || '', // Customer
    ownerAddr?.addressText || '', // Billing Address Line 1
    '', '', '', '', '', '', // Billing Address Lines 2-Country
    policy.fleetName || '', // FOB
    formatDateDMY(policy.inceptionDate), // P_Date
    formatDateMDY(policy.inceptionDate), // Due Date
    formatDateMDY(policy.expiryDate), // Ship Date
    numDays, // No. of Days
    policy.vesselName || '', // Product/Service Class
    policy.vesselName || '', // Memo
    policy.vesselName || '', // Class
    ownerAddr?.entityName || '', // Shipping Address Line 1 — owners
    managerAddr?.entityName || '', // Shipping Address Line 2 — managers
    otherAddrs.map((a: any) => a.entityName).join(', ') || '', // Shipping Address Line 3
    '', '', '', '', // Shipping Address City-Country
    policy.imoNumber || '', // IMO
    policy.imoNumber || '', // IMO #
    policy.vesselType || '', // M/V Type
    flagStr, // Flag
    policy.builtYear ? (policy.rebuiltYear ? `${policy.builtYear}/${policy.rebuiltYear}` : policy.builtYear) : '', // Built
    policy.grossTonnage || '', // GT
    policy.classificationSociety || '', // M/V Class
    commPct, // Ex.Com
    safeInstalments.length || 1, // Terms
    premium, // Product/Service Amount
    shippingMethod, // Shipping Method
    currency, // Currency
    exchangeRate, // Exchange Rate
    amountReceived, // Amount Received
    premium, // Total Amount
    insuredValue || '', // Value
    '100.00%', // Order
    insuredValue || '', // Sum Insured
    rate, // AGR/Rate
    formatWithCommas(technicalPremium), // Tech Prem
    ncbPct, // NCB
    formatWithCommas(grossPremium), // G A Prem
    conditionsSummary, // Conditions
    deductibleStr, // Deductible
    surveyWarranty, // Condition Survey
    getInterestLabel(policy.quotationTypeCode, policy.quotationTypeName), // Interest
    '--', // Remarks
    hasSubjectivities, // Subjectivities
    '--', // Matter Insured
    '--', // Voyage Fm
    '--', // Voyage To
    'BGP', // Product/Service
    'Gross Premium', // Product/Service Description
    'Policy/Slip/End', // Template
    'false', // Is Closed
    policy.createdByName || '', // Sales Rep
  ]

  // 7. Build workbook
  const ws = XLSX.utils.aoa_to_sheet([HEADER_DESCRIPTIONS, HEADER_NAMES, dataRow])

  // Set column widths
  ws['!cols'] = HEADER_NAMES.map((_name, i) => {
    if (i <= 1) return { wch: 16 }
    if (i === 5) return { wch: 30 } // Customer
    if (i === 6) return { wch: 30 } // Address
    if (i === 18 || i === 19 || i === 20) return { wch: 24 } // Vessel name cols
    if (i === 31) return { wch: 22 } // Flag
    return { wch: 14 }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'QuickBooks')

  // 8. Export
  const fileName = `QB - ${policy.policyNumber || 'export'}.xlsx`
  XLSX.writeFile(wb, fileName)
}
