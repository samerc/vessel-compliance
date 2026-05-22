import XLSX from 'xlsx-js-style'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, Fleet, VesselDocument, DocumentType, VesselDynamicPolicy, ConditionSurvey, SurveyDefect, Surveyor } from '../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'
import { formatDate } from '../utils/dateUtils'

// Guard against IPC error objects (safeHandle returns { error:true } on failure)
const safeArray = (v: unknown): any[] => Array.isArray(v) ? v : []

// Dynamic entity document helpers
async function loadEntityDocData() {
  const [edTypes, edDocs] = await Promise.all([
    window.api.getEntityDocumentTypes(),
    window.api.getEntityDocuments()
  ])
  return {
    edTypes: safeArray(edTypes).filter((t: any) => t.isActive && t.isRequired),
    edDocs: safeArray(edDocs)
  }
}

function entityDocStatus(entity: any, edTypes: any[], edDocs: any[]): { name: string; onFile: boolean }[] {
  return edTypes
    .filter((t: any) => t.entityScope === 'both' || t.entityScope === entity.type)
    .map((t: any) => ({
      name: t.name,
      onFile: edDocs.some((d: any) => d.entityId === entity.id && d.documentTypeId === t.id && d.filePath)
    }))
}

const isExpired = (expiryDate: string | null | undefined): boolean => {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return expiry < today
}

const isExpiringSoon = (expiryDate: string | null | undefined, days = 60): boolean => {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const threshold = new Date(today)
  threshold.setDate(today.getDate() + days)
  return expiry >= today && expiry <= threshold
}

const annualShortCycle = (expiryDate: string | null | undefined, receivedDate: string | null | undefined): boolean => {
  if (!expiryDate || !receivedDate) return false
  const span = (new Date(expiryDate).getTime() - new Date(receivedDate).getTime()) / (1000 * 60 * 60 * 24)
  return span < 60
}

const getDocStatus = (hasFile: boolean, expiryDate: string | null | undefined, annualRenewal = false, receivedDate?: string): string => {
  if (!hasFile) return 'Missing'
  if (isExpired(expiryDate)) return 'Expired'
  if (isExpiringSoon(expiryDate)) {
    if (annualRenewal && annualShortCycle(expiryDate, receivedDate)) return 'Compliant'
    return 'Expiring Soon'
  }
  return 'Compliant'
}

const getExcelDocStatus = (hasFile: boolean, expiryDate: string | null | undefined, annualRenewal = false, receivedDate?: string): string => {
  if (!hasFile) return 'MISSING'
  if (isExpired(expiryDate)) return 'EXPIRED'
  if (isExpiringSoon(expiryDate)) {
    if (annualRenewal && annualShortCycle(expiryDate, receivedDate)) return 'COMPLIANT'
    return 'EXPIRING SOON'
  }
  return 'COMPLIANT'
}

const dateOnly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return ''
  return dateStr.split('T')[0]
}

export const ReportService = {
  exportVesselToExcel: async (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const complianceData: any[] = []
    let compliantCount = 0
    let requiredCount = 0

    const dynamicPolicies = await window.api.getVesselDynamicPolicies(vessel.id)
    const effectiveExpiry = resolveEffectivePolicyExpiry(dynamicPolicies)

    for (const type of docTypes) {
      const doc = docs.find(d => d.documentTypeId === type.id)
      const isRequired = doc ? doc.required : type.required

      if (isRequired || !!doc?.filePath) {
        if (isRequired) {
          requiredCount++
          if (doc?.filePath) compliantCount++
        }

        const resolvedExpiry = type.annualRenewal ? (effectiveExpiry || doc?.expiryDate) : doc?.expiryDate
        const expiryToShow = (!!doc?.filePath && resolvedExpiry) ? dateOnly(resolvedExpiry) : 'N/A'

        complianceData.push({
          'Document Name': type.name + (!isRequired ? ' (Optional)' : ''),
          'Description': type.description || '',
          'Status': getExcelDocStatus(!!doc?.filePath, resolvedExpiry, type.annualRenewal, doc?.receivedDate),
          'Date of Receipt': doc?.receivedDate || 'N/A',
          'Expiry Date': expiryToShow,
          'Uploaded Date': doc?.uploadedDate ? formatDate(doc.uploadedDate) : 'N/A'
        })
      }
    }

    // Custom document types
    const customDocTypes = await window.api.getVesselCustomDocTypes(vessel.id)
    customDocTypes.forEach(customType => {
      const vDoc = docs.find(d => d.documentTypeId === customType.id)
      requiredCount++
      if (vDoc?.filePath) compliantCount++
      complianceData.push({
        'Document Name': `${customType.name} (Custom)`,
        'Description': customType.description || '',
        'Status': getExcelDocStatus(!!vDoc?.filePath, vDoc?.expiryDate),
        'Date of Receipt': vDoc?.receivedDate || 'N/A',
        'Expiry Date': vDoc?.expiryDate || 'N/A',
        'Uploaded Date': vDoc?.uploadedDate ? formatDate(vDoc.uploadedDate) : 'N/A'
      })
    })

    // Fetch entity documents
    const vesselAssureds = await window.api.getVesselAssureds(vessel.id)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const assuredRoles = safeArray(await window.api.getAssuredRoles())
    const roleOrderMap = new Map(assuredRoles.map((r, i) => [r.name, i]))
    vesselAssureds.sort((a, b) => (roleOrderMap.get(a.role) ?? 999) - (roleOrderMap.get(b.role) ?? 999))
    const { edTypes, edDocs } = await loadEntityDocData()

    const entityDocsData: any[] = []
    if (vesselAssureds.length > 0) {
      entityDocsData.push({ 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
      entityDocsData.push({ 'Document Name': 'ASSURED ENTITIES & DOCUMENTS', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
      entityDocsData.push({ 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })

      vesselAssureds.forEach((va, index) => {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) return

        entityDocsData.push({ 'Document Name': `Assured ${index + 1}: ${entity.name}`, 'Description': `Role: ${va.role}`, 'Status': entity.type.toUpperCase(), 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })

        for (const ds of entityDocStatus(entity, edTypes, edDocs)) {
          requiredCount++
          if (ds.onFile) compliantCount++
          entityDocsData.push({
            'Document Name': `  - ${ds.name}`,
            'Description': '',
            'Status': ds.onFile ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': '',
            'Uploaded Date': ''
          })
        }

        // UBOs
        const ubos = allEntityUBOs
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => allEntities.find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        if (ubos.length > 0) {
          entityDocsData.push({ 'Document Name': '  UBOs:', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
          ubos.forEach((ubo, uboIndex) => {
            if (!ubo) return
            entityDocsData.push({ 'Document Name': `    ${uboIndex + 1}. ${ubo.name}`, 'Description': ubo.identifier || '', 'Status': ubo.type.toUpperCase(), 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })


            for (const ds of entityDocStatus(ubo, edTypes, edDocs)) {
              requiredCount++
              if (ds.onFile) compliantCount++
              entityDocsData.push({
                'Document Name': `       - ${ds.name}`,
                'Description': '',
                'Status': ds.onFile ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': '',
                'Uploaded Date': ''
              })
            }
          })
        } else {
          entityDocsData.push({ 'Document Name': '  No Ultimate Beneficial Owner on record', 'Description': '', 'Status': 'WARNING', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
        }

        entityDocsData.push({ 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
      })
    }

    // Calculate compliance rate including entity documents
    const complianceRate = requiredCount > 0 ? ((compliantCount / requiredCount) * 100).toFixed(1) : '100'
    const missingCount = requiredCount - compliantCount

    const summaryHeader = [
      { 'Document Name': 'VESSEL COMPLIANCE SUMMARY', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Vessel Name', 'Description': vessel.name, 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'IMO Number', 'Description': vessel.imoNumber, 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Compliance Rate', 'Description': `${complianceRate}%`, 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Compliant / Missing', 'Description': `${compliantCount} / ${missingCount}`, 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' }
    ]

    const ws = XLSX.utils.json_to_sheet([...summaryHeader, ...complianceData, ...entityDocsData])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vessel Compliance')
    XLSX.writeFile(wb, `${vessel.name}_Compliance_Report.xlsx`)
  },

  exportVesselToPDF: async (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[], options?: { returnBytes?: boolean }): Promise<Uint8Array | void> => {
    const doc = new jsPDF()
    const tableData: any[] = []
    let compliantCount = 0
    let requiredCount = 0

    const dynamicPolicies = await window.api.getVesselDynamicPolicies(vessel.id)
    const effectiveExpiry = resolveEffectivePolicyExpiry(dynamicPolicies)

    for (const type of docTypes) {
      const vDoc = docs.find(d => d.documentTypeId === type.id)
      const isRequired = vDoc ? vDoc.required : type.required

      if (isRequired || !!vDoc?.filePath) {
        if (isRequired) {
          requiredCount++
          if (vDoc?.filePath) compliantCount++
        }

        const resolvedExpiry = type.annualRenewal ? (effectiveExpiry || vDoc?.expiryDate) : vDoc?.expiryDate
        const pdfExpiryToShow = (!!vDoc?.filePath && resolvedExpiry) ? dateOnly(resolvedExpiry) : '-'

        tableData.push([
          type.name + (!isRequired ? ' (Optional)' : ''),
          type.description || '',
          getDocStatus(!!vDoc?.filePath, resolvedExpiry, type.annualRenewal, vDoc?.receivedDate),
          pdfExpiryToShow
        ])
      }
    }

    // Custom document types for PDF
    const pdfCustomDocTypes = await window.api.getVesselCustomDocTypes(vessel.id)
    pdfCustomDocTypes.forEach(customType => {
      const vDoc = docs.find(d => d.documentTypeId === customType.id)
      requiredCount++
      if (vDoc?.filePath) compliantCount++
      tableData.push([
        `${customType.name} (Custom)`,
        customType.description || '',
        getDocStatus(!!vDoc?.filePath, vDoc?.expiryDate),
        vDoc?.expiryDate || '-'
      ])
    })

    // Fetch entity documents for counting
    const vesselAssureds = await window.api.getVesselAssureds(vessel.id)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const pdfAssuredRoles = safeArray(await window.api.getAssuredRoles())
    const pdfRoleOrderMap = new Map(pdfAssuredRoles.map((r, i) => [r.name, i]))
    vesselAssureds.sort((a, b) => (pdfRoleOrderMap.get(a.role) ?? 999) - (pdfRoleOrderMap.get(b.role) ?? 999))
    const { edTypes, edDocs } = await loadEntityDocData()

    // Count entity documents
    if (vesselAssureds.length > 0) {
      vesselAssureds.forEach((va) => {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) return

        for (const ds of entityDocStatus(entity, edTypes, edDocs)) {
          requiredCount++
          if (ds.onFile) compliantCount++
        }

        // Count UBO documents
        const ubos = allEntityUBOs
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => allEntities.find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        ubos.forEach((ubo) => {
          if (!ubo) return
          for (const ds of entityDocStatus(ubo, edTypes, edDocs)) {
            requiredCount++
            if (ds.onFile) compliantCount++
          }
        })
      })
    }

    const complianceRate = requiredCount > 0 ? ((compliantCount / requiredCount) * 100).toFixed(1) : '100'

    // Header
    doc.setFillColor(15, 18, 24)
    doc.rect(0, 0, 210, 45, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Al Bahriah Insurance & Reinsurance SAL', 14, 15)

    doc.setFontSize(20)
    doc.text('Compliance Report', 14, 28)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(150, 150, 150)
    doc.text(`Date Issued: ${formatDate(new Date())}`, 14, 37)

    // Vessel Info Section
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(vessel.name, 14, 58)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`IMO Number: ${vessel.imoNumber}`, 14, 65)

    // Summary Box
    doc.setDrawColor(200, 200, 200)
    doc.setFillColor(245, 247, 249)
    doc.roundedRect(140, 52, 56, 25, 3, 3, 'FD')

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('Compliance Rate', 145, 59)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(parseFloat(complianceRate) > 80 ? 0 : 200, parseFloat(complianceRate) > 80 ? 150 : 0, 0)
    doc.text(`${complianceRate}%`, 145, 69)

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`${compliantCount} / ${requiredCount} Docs`, 145, 74)

    let finalY = 85
    autoTable(doc, {
      startY: finalY,
      head: [['Document Name', 'Description', 'Status', 'Expires']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [58, 123, 213], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 60 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const status = data.cell.raw
          if (status === 'Missing') {
            data.cell.styles.textColor = [255, 0, 0]
            data.cell.styles.fontStyle = 'bold'
          } else if (status === 'Expired') {
            data.cell.styles.textColor = [255, 100, 0]
            data.cell.styles.fontStyle = 'bold'
          } else if (status === 'Expiring Soon') {
            data.cell.styles.textColor = [200, 150, 0]
            data.cell.styles.fontStyle = 'bold'
          } else {
            data.cell.styles.textColor = [0, 150, 0]
          }
        }
      },
      styles: { fontSize: 10, cellPadding: 5 },
      didDrawPage: (data) => {
        if (data.cursor) {
          finalY = data.cursor.y
        }
      }
    })

    // Display entity documents
    if (vesselAssureds.length > 0) {
      // Add page break if needed
      if (finalY > 240) {
        doc.addPage()
        finalY = 20
      } else {
        finalY += 15
      }

      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('Assured Entities & Documents', 14, finalY)
      finalY += 10

      vesselAssureds.forEach((va, index) => {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) return

        // Check if we need a new page
        if (finalY > 260) {
          doc.addPage()
          finalY = 20
        }

        // Assured entity header
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text(`Assured ${index + 1}: ${entity.name}`, 14, finalY)
        finalY += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Role: ${va.role} | Type: ${entity.type.toUpperCase()}`, 14, finalY)
        finalY += 8

        // Entity documents
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        for (const ds of entityDocStatus(entity, edTypes, edDocs)) {
          doc.text(`\u2022 ${ds.name}:`, 20, finalY)
          doc.setTextColor(ds.onFile ? 0 : 255, ds.onFile ? 150 : 0, 0)
          doc.text(ds.onFile ? 'ON FILE' : 'MISSING', 85, finalY)
          finalY += 5
          doc.setTextColor(0, 0, 0)
        }

        // UBOs
        const ubos = allEntityUBOs
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => allEntities.find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        if (ubos.length > 0) {
          finalY += 3
          doc.setFontSize(9)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text('UBOs:', 20, finalY)
          doc.setFont('helvetica', 'normal')
          finalY += 5

          ubos.forEach((ubo, uboIndex) => {
            if (!ubo) return

            // Check if we need a new page
            if (finalY > 270) {
              doc.addPage()
              finalY = 20
            }

            doc.setFontSize(9)
            doc.setTextColor(0, 0, 0)
            doc.text(`   ${uboIndex + 1}. ${ubo.name}`, 25, finalY)
            doc.setTextColor(100, 100, 100)
            doc.text(`(${ubo.type.toUpperCase()})`, 90, finalY)
            finalY += 5

            for (const ds of entityDocStatus(ubo, edTypes, edDocs)) {
              doc.setTextColor(0, 0, 0)
              doc.text(`      - ${ds.name}:`, 30, finalY)
              doc.setTextColor(ds.onFile ? 0 : 255, ds.onFile ? 150 : 0, 0)
              doc.text(ds.onFile ? 'ON FILE' : 'MISSING', 105, finalY)
              finalY += 4
            }
          })
        } else {
          finalY += 3
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(255, 0, 0)
          doc.text('No Ultimate Beneficial Owner on record', 20, finalY)
          finalY += 5
        }

        finalY += 8
      })
    }

    if (options?.returnBytes) return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
    doc.save(`${vessel.name}_Compliance_Report.pdf`)
  },

  exportFleetToExcel: async (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const data: any[] = []
    let totalCompliant = 0
    let totalRequired = 0
    const activeVessels = vessels.filter(v => v.isActive)
    const allDynamicPolicies = await window.api.getAllVesselDynamicPolicies()
    
    // Group policies by vesselId
    const policyMap = new Map<string, VesselDynamicPolicy[]>()
    for (const p of allDynamicPolicies) {
      if (!policyMap.has(p.vesselId)) policyMap.set(p.vesselId, [])
      policyMap.get(p.vesselId)!.push(p)
    }

    // Section 1: Vessel Documents
    for (const v of activeVessels) {
      const vesselPolicies = policyMap.get(v.id) || []
      const effectiveExpiry = resolveEffectivePolicyExpiry(vesselPolicies)

      for (const type of docTypes) {
        const doc = allDocs.find(d => d.vesselId === v.id && d.documentTypeId === type.id)
        const isRequired = doc ? doc.required : type.required

        if (isRequired) {
          totalRequired++
          if (doc?.filePath) totalCompliant++

          const resolvedExpiry = type.annualRenewal ? (effectiveExpiry || doc?.expiryDate) : doc?.expiryDate
          const expiryToShow = (!!doc?.filePath && resolvedExpiry) ? dateOnly(resolvedExpiry) : 'N/A'

          data.push({
            'Vessel': v.name,
            'IMO': v.imoNumber,
            'Document Name': type.name,
            'Description': type.description || '',
            'Status': getExcelDocStatus(!!doc?.filePath, resolvedExpiry, type.annualRenewal, doc?.receivedDate),
            'Date of Receipt': doc?.receivedDate || 'N/A',
            'Expiry Date': expiryToShow
          })
        }
      }
    }

    // Section 2: Fleet Assureds (Deduplicated)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const excelAssuredRoles = safeArray(await window.api.getAssuredRoles())
    const excelRoleOrderMap = new Map(excelAssuredRoles.map((r, i) => [r.name, i]))
    const { edTypes: excelEdTypes, edDocs: excelEdDocs } = await loadEntityDocData()

    // Collect all unique assureds across the fleet with their vessel associations
    const assuredMap = new Map<string, { entity: any; vessels: string[]; role: string }>()

    for (const vessel of activeVessels) {
      const vesselAssureds = await window.api.getVesselAssureds(vessel.id)
      for (const va of vesselAssureds) {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) continue

        if (assuredMap.has(entity.id)) {
          const existing = assuredMap.get(entity.id)!
          if (!existing.vessels.includes(vessel.name)) {
            existing.vessels.push(vessel.name)
          }
        } else {
          assuredMap.set(entity.id, { entity, vessels: [vessel.name], role: va.role })
        }
      }
    }

    // Sort assureds by role order
    const sortedExcelAssureds = [...assuredMap.entries()].sort((a, b) => (excelRoleOrderMap.get(a[1].role) ?? 999) - (excelRoleOrderMap.get(b[1].role) ?? 999))

    // Add assured entities section
    const assuredData: any[] = []
    if (sortedExcelAssureds.length > 0) {
      assuredData.push({ 'Vessel': '', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' })
      assuredData.push({ 'Vessel': 'FLEET ASSUREDS', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' })
      assuredData.push({ 'Vessel': '', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' })

      for (const [, { entity, vessels: vesselNames, role }] of sortedExcelAssureds) {
        const vesselList = vesselNames.join(', ')
        assuredData.push({
          'Vessel': entity.name,
          'IMO': entity.type.toUpperCase(),
          'Document Name': `Role: ${role}`,
          'Description': `Vessels: ${vesselList}`,
          'Status': '',
          'Date of Receipt': '',
          'Expiry Date': ''
        })

        // Entity documents
        for (const ds of entityDocStatus(entity, excelEdTypes, excelEdDocs)) {
          totalRequired++
          if (ds.onFile) totalCompliant++
          assuredData.push({
            'Vessel': '',
            'IMO': '',
            'Document Name': `  - ${ds.name}`,
            'Description': '',
            'Status': ds.onFile ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': ''
          })
        }

        // UBOs for this entity
        const ubos = allEntityUBOs
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => allEntities.find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        if (ubos.length > 0) {
          assuredData.push({ 'Vessel': '', 'IMO': '', 'Document Name': '  UBOs:', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' })

          ubos.forEach((ubo, uboIndex) => {
            if (!ubo) return
            assuredData.push({
              'Vessel': '',
              'IMO': '',
              'Document Name': `    ${uboIndex + 1}. ${ubo.name}`,
              'Description': ubo.identifier || '',
              'Status': ubo.type.toUpperCase(),
              'Date of Receipt': '',
              'Expiry Date': ''
            })

            for (const ds of entityDocStatus(ubo, excelEdTypes, excelEdDocs)) {
              totalRequired++
              if (ds.onFile) totalCompliant++
              assuredData.push({
                'Vessel': '',
                'IMO': '',
                'Document Name': `       - ${ds.name}`,
                'Description': '',
                'Status': ds.onFile ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': ''
              })
            }
          })
        } else {
          assuredData.push({ 'Vessel': '', 'IMO': '', 'Document Name': '  No Ultimate Beneficial Owner on record', 'Description': '', 'Status': 'WARNING', 'Date of Receipt': '', 'Expiry Date': '' })
        }

        assuredData.push({ 'Vessel': '', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' })
      }
    }

    const complianceRate = totalRequired > 0 ? ((totalCompliant / totalRequired) * 100).toFixed(1) : '100'
    const missingCount = totalRequired - totalCompliant

    const summaryHeader = [
      { 'Vessel': 'FLEET COMPLIANCE SUMMARY', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Fleet Name', 'IMO': fleet.name, 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Total Vessels', 'IMO': activeVessels.length.toString(), 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Total Assureds', 'IMO': assuredMap.size.toString(), 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Fleet Compliance Rate', 'IMO': `${complianceRate}%`, 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Compliant / Missing', 'IMO': `${totalCompliant} / ${missingCount}`, 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': '', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'VESSEL DOCUMENTS', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': '', 'IMO': '', 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' }
    ]

    const ws = XLSX.utils.json_to_sheet([...summaryHeader, ...data, ...assuredData])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Compliance')
    XLSX.writeFile(wb, `${fleet.name}_Fleet_Compliance_Report.xlsx`)
  },

  exportFleetToPDF: async (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const doc = new jsPDF()
    const tableData: any[] = []
    let totalCompliant = 0
    let totalRequired = 0
    const activeVessels = vessels.filter(v => v.isActive)

    const allDynamicPolicies = await window.api.getAllVesselDynamicPolicies()
    const policyMap = new Map<string, VesselDynamicPolicy[]>()
    for (const p of allDynamicPolicies) {
      if (!policyMap.has(p.vesselId)) policyMap.set(p.vesselId, [])
      policyMap.get(p.vesselId)!.push(p)
    }

    // Section 1: Vessel Documents
    for (const v of activeVessels) {
      const vesselPolicies = policyMap.get(v.id) || []
      const effectiveExpiry = resolveEffectivePolicyExpiry(vesselPolicies)

      for (const type of docTypes) {
        const vDoc = allDocs.find(d => d.vesselId === v.id && d.documentTypeId === type.id)
        const isRequired = vDoc ? vDoc.required : type.required

        if (isRequired) {
          totalRequired++
          if (vDoc?.filePath) totalCompliant++

          const resolvedExpiry = type.annualRenewal ? (effectiveExpiry || vDoc?.expiryDate) : vDoc?.expiryDate
          const fleetPdfExpiry = (!!vDoc?.filePath && resolvedExpiry) ? dateOnly(resolvedExpiry) : '-'

          tableData.push([
            v.name,
            type.name,
            getDocStatus(!!vDoc?.filePath, resolvedExpiry, type.annualRenewal, vDoc?.receivedDate),
            fleetPdfExpiry
          ])
        }
      }
    }

    // Section 2: Fleet Assureds (Deduplicated)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const fleetAssuredRoles = safeArray(await window.api.getAssuredRoles())
    const fleetRoleOrderMap = new Map(fleetAssuredRoles.map((r, i) => [r.name, i]))
    const { edTypes: fleetEdTypes, edDocs: fleetEdDocs } = await loadEntityDocData()

    // Collect all unique assureds across the fleet with their vessel associations
    const assuredMap = new Map<string, { entity: any; vessels: string[]; roles: string[] }>()

    for (const vessel of activeVessels) {
      const vesselAssureds = await window.api.getVesselAssureds(vessel.id)
      for (const va of vesselAssureds) {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) continue

        if (assuredMap.has(entity.id)) {
          const existing = assuredMap.get(entity.id)!
          if (!existing.vessels.includes(vessel.name)) existing.vessels.push(vessel.name)
          if (!existing.roles.includes(va.role)) existing.roles.push(va.role)
        } else {
          assuredMap.set(entity.id, { entity, vessels: [vessel.name], roles: [va.role] })
        }
      }
    }

    // Sort assureds by first role order
    const sortedAssureds = [...assuredMap.entries()].sort((a, b) => {
      const aMin = Math.min(...a[1].roles.map(r => fleetRoleOrderMap.get(r) ?? 999))
      const bMin = Math.min(...b[1].roles.map(r => fleetRoleOrderMap.get(r) ?? 999))
      return aMin - bMin
    })

    // Count entity documents for compliance rate
    for (const [, { entity }] of sortedAssureds) {
      for (const ds of entityDocStatus(entity, fleetEdTypes, fleetEdDocs)) {
        totalRequired++
        if (ds.onFile) totalCompliant++
      }

      const ubos = allEntityUBOs
        .filter(u => u.assuredEntityId === entity.id)
        .map(u => allEntities.find(e => e.id === u.uboEntityId))
        .filter(Boolean)

      ubos.forEach((ubo) => {
        if (!ubo) return
        for (const ds of entityDocStatus(ubo, fleetEdTypes, fleetEdDocs)) {
          totalRequired++
          if (ds.onFile) totalCompliant++
        }
      })
    }

    const complianceRate = totalRequired > 0 ? ((totalCompliant / totalRequired) * 100).toFixed(1) : '100'

    // Header
    doc.setFillColor(15, 18, 24)
    doc.rect(0, 0, 210, 45, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Al Bahriah Insurance & Reinsurance SAL', 14, 15)

    doc.setFontSize(20)
    doc.text('Fleet Compliance Report', 14, 28)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(150, 150, 150)
    doc.text(`Date Issued: ${formatDate(new Date())}`, 14, 37)

    // Fleet Info Section
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(fleet.name, 14, 58)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`Total Vessels: ${vessels.length}  |  Total Assureds: ${assuredMap.size}`, 14, 65)

    // Summary Box
    doc.setDrawColor(200, 200, 200)
    doc.setFillColor(245, 247, 249)
    doc.roundedRect(140, 52, 56, 25, 3, 3, 'FD')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Fleet Compliance Rate', 142, 59)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(parseFloat(complianceRate) > 80 ? 0 : 200, parseFloat(complianceRate) > 80 ? 150 : 0, 0)
    doc.text(`${complianceRate}%`, 142, 69)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`${totalCompliant} / ${totalRequired} Docs`, 142, 74)

    let finalY = 85
    autoTable(doc, {
      startY: finalY,
      head: [['Vessel', 'Document', 'Status', 'Expires']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [58, 123, 213], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 50 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const status = data.cell.raw
          if (status === 'Missing') {
            data.cell.styles.textColor = [255, 0, 0]
            data.cell.styles.fontStyle = 'bold'
          } else if (status === 'Expired') {
            data.cell.styles.textColor = [255, 100, 0]
            data.cell.styles.fontStyle = 'bold'
          } else if (status === 'Expiring Soon') {
            data.cell.styles.textColor = [200, 150, 0]
            data.cell.styles.fontStyle = 'bold'
          } else {
            data.cell.styles.textColor = [0, 150, 0]
          }
        }
      },
      styles: { fontSize: 10, cellPadding: 5 },
      didDrawPage: (data) => {
        if (data.cursor) {
          finalY = data.cursor.y
        }
      }
    })

    // Section 2: Fleet Assureds
    if (sortedAssureds.length > 0) {
      // Add page break if needed
      if (finalY > 240) {
        doc.addPage()
        finalY = 20
      } else {
        finalY += 15
      }

      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('Fleet Assureds & Documents', 14, finalY)
      finalY += 10

      let assuredIndex = 0
      for (const [, { entity, vessels: vesselNames, roles }] of sortedAssureds) {
        assuredIndex++

        // Check if we need a new page
        if (finalY > 260) {
          doc.addPage()
          finalY = 20
        }

        // Assured entity header
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text(`Assured ${assuredIndex}: ${entity.name}`, 14, finalY)
        finalY += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Role: ${roles.join(', ')} | Type: ${entity.type.toUpperCase()} | Vessels: ${vesselNames.join(', ')}`, 14, finalY)
        finalY += 8

        // Entity documents
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 0)
        for (const ds of entityDocStatus(entity, fleetEdTypes, fleetEdDocs)) {
          doc.text(`\u2022 ${ds.name}:`, 20, finalY)
          doc.setTextColor(ds.onFile ? 0 : 255, ds.onFile ? 150 : 0, 0)
          doc.text(ds.onFile ? 'ON FILE' : 'MISSING', 85, finalY)
          finalY += 5
          doc.setTextColor(0, 0, 0)
        }

        // UBOs for this entity
        const ubos = allEntityUBOs
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => allEntities.find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        if (ubos.length > 0) {
          finalY += 3
          doc.setFontSize(9)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text('UBOs:', 20, finalY)
          doc.setFont('helvetica', 'normal')
          finalY += 5

          ubos.forEach((ubo, uboIndex) => {
            if (!ubo) return

            // Check if we need a new page
            if (finalY > 270) {
              doc.addPage()
              finalY = 20
            }

            doc.setFontSize(9)
            doc.setTextColor(0, 0, 0)
            doc.text(`   ${uboIndex + 1}. ${ubo.name}`, 25, finalY)
            doc.setTextColor(100, 100, 100)
            doc.text(`(${ubo.type.toUpperCase()})`, 90, finalY)
            finalY += 5

            for (const ds of entityDocStatus(ubo, fleetEdTypes, fleetEdDocs)) {
              doc.setTextColor(0, 0, 0)
              doc.text(`      - ${ds.name}:`, 30, finalY)
              doc.setTextColor(ds.onFile ? 0 : 255, ds.onFile ? 150 : 0, 0)
              doc.text(ds.onFile ? 'ON FILE' : 'MISSING', 105, finalY)
              finalY += 4
            }
          })
        } else {
          finalY += 3
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(255, 0, 0)
          doc.text('No Ultimate Beneficial Owner on record', 20, finalY)
          finalY += 5
        }

        finalY += 8
      }
    }

    doc.save(`${fleet.name}_Fleet_Report.pdf`)
  },

  exportSurveyToPDF: async (vessel: Vessel, survey: ConditionSurvey, defects: SurveyDefect[], includeNoteIds?: Set<string>) => {
    const doc = new jsPDF()

    // Fetch supplementary data
    const [surveyors, flagStatesRaw] = await Promise.all([
      window.api.getSurveyors(),
      window.api.getFlagStates()
    ])
    const surveyor: Surveyor | undefined = surveyors.find((s: Surveyor) => s.id === survey.surveyorId)
    const flagState = flagStatesRaw.find((f: any) => f.id === vessel.flagStateId)

    const openCount = defects.filter(d => d.status === 'OPEN').length
    const closedCount = defects.filter(d => d.status === 'CLOSED').length
    const criticalCount = defects.filter(d => d.severity === 'Critical').length

    // Sort: OPEN first, then CLOSED; within each group sort numerically by defect number
    const sortedDefects = [...defects].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'OPEN' ? -1 : 1
      return a.defectNumber.localeCompare(b.defectNumber, undefined, { numeric: true })
    })

    // Determine if survey is closed (all defects closed) and find its closing date
    const isSurveyClosed = defects.length > 0 && defects.every(d => d.status === 'CLOSED')
    const latestCloseTs = isSurveyClosed
      ? defects.filter(d => d.closedAt).map(d => d.closedAt!).sort().pop()
      : undefined
    const surveyClosedDisplay = latestCloseTs ? formatDate(latestCloseTs) : null

    // ── Header band ──────────────────────────────────────────────────
    doc.setFillColor(15, 18, 24)
    doc.rect(0, 5, 210, 46, 'F')   // starts at y=5 so printer margin doesn't clip it

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Al Bahriah Insurance & Reinsurance SAL', 14, 20)

    doc.setFontSize(18)
    doc.text('Condition Survey Status', 14, 34)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(190, 190, 190)
    doc.text(`Date Issued: ${formatDate(new Date())}`, 14, 43)

    // ── Vessel name & IMO ────────────────────────────────────────────
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text(vessel.name, 14, 67)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40, 40, 40)
    const vesselMeta: string[] = [`IMO: ${vessel.imoNumber}`]
    if (vessel.vesselType) vesselMeta.push(`Type: ${vessel.vesselType}`)
    if (flagState) vesselMeta.push(`Flag: ${flagState.name}`)
    doc.text(vesselMeta.join('   •   '), 14, 74)

    // ── Summary stats box (top-right) ────────────────────────────────
    const boxX = 140
    const boxY = 58
    const boxW = 56
    const boxH = 42
    doc.setDrawColor(220, 220, 220)
    doc.setFillColor(245, 247, 249)
    doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'FD')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.text('Total Defects', boxX + 4, boxY + 9)

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(String(defects.length), boxX + 4, boxY + 22)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(200, 0, 0)
    doc.text(`${openCount} Open`, boxX + 4, boxY + 32)
    doc.setTextColor(0, 150, 0)
    doc.text(`${closedCount} Closed`, boxX + 4, boxY + 39)

    if (criticalCount > 0) {
      doc.setTextColor(200, 0, 0)
      doc.setFontSize(8)
      doc.text(`${criticalCount} Critical`, boxX + 30, boxY + 32)
    }

    // ── Survey detail fields (single left column, max X ~128 to avoid overlap with box) ──
    let y = 84
    const lc: [number, number, number] = [55, 55, 55]
    const vc: [number, number, number] = [0, 0, 0]

    const drawField = (label: string, value: string) => {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...lc)
      doc.text(label + ':', 14, y)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...vc)
      // Truncate value to stay left of the stats box
      const safeValue = doc.splitTextToSize(value, 115)[0]
      doc.text(safeValue, 52, y)
      y += 7
    }

    drawField('Survey Type', survey.surveyType)
    drawField('Survey Date', survey.surveyDate)
    if (surveyor) {
      drawField('Surveyor', surveyor.companyName)
      if (surveyor.country) drawField('Country', surveyor.country)
    }
    if (survey.reference) drawField('Reference', survey.reference)
    if (survey.location) drawField('Location', survey.location)
    if (isSurveyClosed && surveyClosedDisplay) drawField('Survey Closed', surveyClosedDisplay)

    // ── Divider ──────────────────────────────────────────────────────
    y = Math.max(y, boxY + boxH + 4)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.5)
    doc.line(14, y, 196, y)
    y += 6

    // ── Defects table ────────────────────────────────────────────────
    if (defects.length === 0) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(150, 150, 150)
      doc.text('No defects recorded for this survey.', 14, y + 8)
    } else {
      const tableBody = sortedDefects.map(d => [
        d.defectNumber,
        d.description,
        d.severity || '—',
        d.status,
        d.closedAt ? formatDate(d.closedAt) : '—',
      ])

      autoTable(doc, {
        startY: y,
        margin: { top: 14, right: 14, bottom: 42, left: 14 },
        head: [['#', 'Description', 'Severity', 'Status', 'Closed']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [28, 52, 95],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
          lineColor: [28, 52, 95],
        },
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' },
          1: { cellWidth: 90 },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 24 },
        },
        styles: {
          fontSize: 9,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          lineColor: [200, 200, 200],
          lineWidth: 0.3,
          textColor: [20, 20, 20],
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return
          if (data.column.index === 2) {
            const sev = String(data.cell.raw)
            if (sev === 'Critical') {
              data.cell.styles.fillColor = [255, 228, 228]
              data.cell.styles.textColor = [150, 0, 0]
              data.cell.styles.fontStyle = 'bold'
            } else if (sev === 'Major') {
              data.cell.styles.fillColor = [255, 240, 220]
              data.cell.styles.textColor = [130, 55, 0]
              data.cell.styles.fontStyle = 'bold'
            } else if (sev === 'Minor') {
              data.cell.styles.fillColor = [255, 252, 210]
              data.cell.styles.textColor = [100, 80, 0]
              data.cell.styles.fontStyle = 'bold'
            } else if (sev === 'Observation') {
              data.cell.styles.fillColor = [220, 238, 255]
              data.cell.styles.textColor = [0, 70, 140]
              data.cell.styles.fontStyle = 'bold'
            }
          }
          if (data.column.index === 3) {
            const st = String(data.cell.raw)
            if (st === 'OPEN') {
              data.cell.styles.fillColor = [255, 228, 228]
              data.cell.styles.textColor = [150, 0, 0]
              data.cell.styles.fontStyle = 'bold'
            } else if (st === 'CLOSED') {
              data.cell.styles.fillColor = [225, 255, 230]
              data.cell.styles.textColor = [0, 110, 45]
              data.cell.styles.fontStyle = 'bold'
            }
          }
        },
      })
    }

    // ── Selected defect notes ─────────────────────────────────────────
    const notesToShow = includeNoteIds && includeNoteIds.size > 0
      ? sortedDefects.filter(d => (d.notes || d.closureNotes) && includeNoteIds.has(d.id))
      : []

    let ny = ((doc as any).lastAutoTable?.finalY ?? y + 10)
    if (notesToShow.length > 0) {
      ny += 10

      if (ny > 265) { doc.addPage(); ny = 20 }

      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('Defect Notes', 14, ny)
      ny += 5

      doc.setDrawColor(220, 220, 220)
      doc.line(14, ny, 196, ny)
      ny += 6

      for (const d of notesToShow) {
        if (ny > 265) { doc.addPage(); ny = 20 }
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text(`#${d.defectNumber} — ${d.description.substring(0, 90)}`, 14, ny)
        ny += 5
        if (d.notes) {
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(20, 20, 20)
          const lines = doc.splitTextToSize(d.notes, 175)
          doc.text(lines, 20, ny)
          ny += lines.length * 4.5 + 2
        }
        if (d.closureNotes) {
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(0, 120, 0)
          const lines = doc.splitTextToSize(`Closure: ${d.closureNotes}`, 175)
          doc.text(lines, 20, ny)
          ny += lines.length * 4.5 + 2
        }
        ny += 4
      }
    }

    // ── Closing sentence ─────────────────────────────────────────────
    let closingY = ny + 12
    if (closingY > 255) { doc.addPage(); closingY = 25 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(40, 40, 40)
    doc.text('Subject to the terms, conditions and warranties of the policy.', 14, closingY)

    // ── Page footers (y=274 keeps footer within printable area) ──────
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(14, 270, 196, 270)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      doc.text('Al Bahriah Insurance & Reinsurance SAL — Confidential', 14, 274)
      doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
    }

    doc.save(`${vessel.name}_Survey_${survey.surveyDate}.pdf`)
  },

  exportOpenDefectsToExcel: async () => {
    const data = await window.api.getOpenDefectsByVessel()
    const rows = data.map(d => ({
      'Vessel': d.vesselName,
      'IMO': d.imoNumber,
      'Survey Date': d.surveyDate,
      'Surveyor': d.surveyorName,
      'Defect #': d.defectNumber,
      'Description': d.description,
      'Severity': d.severity,
      'Due Date': d.dueDate || 'N/A',
      'Days Open': Math.floor((new Date().getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Open Defects')
    XLSX.writeFile(wb, `Open_Defects_Report_${new Date().toISOString().split('T')[0]}.xlsx`)
  }
}
