import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, Fleet, VesselDocument, DocumentType } from '../../../shared/types'

const isExpired = (expiryDate: string | null | undefined): boolean => {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return expiry < today
}

export const ReportService = {
  exportVesselToExcel: async (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const complianceData: any[] = []
    let compliantCount = 0
    let requiredCount = 0

    docTypes.forEach(type => {
      const doc = docs.find(d => d.documentTypeId === type.id)
      const isRequired = doc ? doc.required : type.required

      if (isRequired) {
        requiredCount++
        if (doc?.filePath) compliantCount++

        complianceData.push({
          'Document Name': type.name,
          'Description': type.description || '',
          'Status': doc?.filePath ? 'COMPLIANT' : 'MISSING',
          'Date of Receipt': doc?.receivedDate || 'N/A',
          'Expiry Date': doc?.expiryDate || 'N/A',
          'Uploaded Date': doc?.uploadedDate ? new Date(doc.uploadedDate).toLocaleDateString() : 'N/A'
        })
      }
    })

    // Fetch entity documents
    const vesselAssureds = await window.api.getVesselAssureds(vessel.id)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const assuredRoles = await window.api.getAssuredRoles()
    const roleOrderMap = new Map(assuredRoles.map((r, i) => [r.name, i]))
    vesselAssureds.sort((a, b) => (roleOrderMap.get(a.role) ?? 999) - (roleOrderMap.get(b.role) ?? 999))

    const entityDocsData: any[] = []
    if (vesselAssureds.length > 0) {
      entityDocsData.push({ 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
      entityDocsData.push({ 'Document Name': 'ASSURED ENTITIES & DOCUMENTS', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
      entityDocsData.push({ 'Document Name': '', 'Description': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })

      vesselAssureds.forEach((va, index) => {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) return

        entityDocsData.push({ 'Document Name': `Assured ${index + 1}: ${entity.name}`, 'Description': `Role: ${va.role}`, 'Status': entity.type.toUpperCase(), 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })

        // Company documents
        if (entity.type === 'company') {
          requiredCount++
          if (entity.certificateOfIncorporationPath) compliantCount++
          entityDocsData.push({
            'Document Name': '  - Certificate of Incorporation',
            'Description': '',
            'Status': entity.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': '',
            'Uploaded Date': ''
          })

          requiredCount++
          if (entity.articlesOfAssociationPath) compliantCount++
          entityDocsData.push({
            'Document Name': '  - Articles of Association',
            'Description': '',
            'Status': entity.articlesOfAssociationPath ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': '',
            'Uploaded Date': ''
          })

          requiredCount++
          if (entity.kycFilePath) compliantCount++
          entityDocsData.push({
            'Document Name': '  - KYC',
            'Description': '',
            'Status': entity.kycFilePath ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': '',
            'Uploaded Date': ''
          })
        }

        // Person passport
        if (entity.type === 'person') {
          requiredCount++
          if (entity.passportFilePath) compliantCount++
          entityDocsData.push({
            'Document Name': '  - ID/Passport',
            'Description': '',
            'Status': entity.passportFilePath ? 'ON FILE' : 'MISSING',
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


            if (ubo.type === 'company') {
              requiredCount++
              if (ubo.certificateOfIncorporationPath) compliantCount++
              entityDocsData.push({
                'Document Name': '       - Certificate of Incorporation',
                'Description': '',
                'Status': ubo.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': '',
                'Uploaded Date': ''
              })

              requiredCount++
              if (ubo.articlesOfAssociationPath) compliantCount++
              entityDocsData.push({
                'Document Name': '       - Articles of Association',
                'Description': '',
                'Status': ubo.articlesOfAssociationPath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': '',
                'Uploaded Date': ''
              })

              requiredCount++
              if (ubo.kycFilePath) compliantCount++
              entityDocsData.push({
                'Document Name': '       - KYC',
                'Description': '',
                'Status': ubo.kycFilePath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': '',
                'Uploaded Date': ''
              })
            }

            if (ubo.type === 'person') {
              requiredCount++
              if (ubo.passportFilePath) compliantCount++
              entityDocsData.push({
                'Document Name': '       - ID/Passport',
                'Description': '',
                'Status': ubo.passportFilePath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': '',
                'Uploaded Date': ''
              })
            }
          })
        } else {
          entityDocsData.push({ 'Document Name': '  ⚠ Missing UBO', 'Description': '', 'Status': 'WARNING', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' })
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

  exportVesselToPDF: async (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const doc = new jsPDF()
    const tableData: any[] = []
    let compliantCount = 0
    let requiredCount = 0

    docTypes.forEach(type => {
      const vDoc = docs.find(d => d.documentTypeId === type.id)
      const isRequired = vDoc ? vDoc.required : type.required

      if (isRequired) {
        requiredCount++
        if (vDoc?.filePath) compliantCount++

        tableData.push([
          type.name,
          type.description || '',
          vDoc?.filePath ? (isExpired(vDoc.expiryDate) ? 'File Expired (Warning)' : 'Compliant') : 'Missing',
          vDoc?.expiryDate || '-'
        ])
      }
    })

    // Fetch entity documents for counting
    const vesselAssureds = await window.api.getVesselAssureds(vessel.id)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const pdfAssuredRoles = await window.api.getAssuredRoles()
    const pdfRoleOrderMap = new Map(pdfAssuredRoles.map((r, i) => [r.name, i]))
    vesselAssureds.sort((a, b) => (pdfRoleOrderMap.get(a.role) ?? 999) - (pdfRoleOrderMap.get(b.role) ?? 999))

    // Count entity documents
    if (vesselAssureds.length > 0) {
      vesselAssureds.forEach((va) => {
        const entity = allEntities.find(e => e.id === va.entityId)
        if (!entity) return

        if (entity.type === 'company') {
          requiredCount += 3 // COI, AOA, KYC
          if (entity.certificateOfIncorporationPath) compliantCount++
          if (entity.articlesOfAssociationPath) compliantCount++
          if (entity.kycFilePath) compliantCount++
        }

        if (entity.type === 'person') {
          requiredCount += 1 // Passport only
          if (entity.passportFilePath) compliantCount++
        }

        // Count UBO documents
        const ubos = allEntityUBOs
          .filter(u => u.assuredEntityId === entity.id)
          .map(u => allEntities.find(e => e.id === u.uboEntityId))
          .filter(Boolean)

        ubos.forEach((ubo) => {
          if (!ubo) return
          if (ubo.type === 'company') {
            requiredCount += 3 // COI, AOA, KYC
            if (ubo.certificateOfIncorporationPath) compliantCount++
            if (ubo.articlesOfAssociationPath) compliantCount++
            if (ubo.kycFilePath) compliantCount++
          }
          if (ubo.type === 'person') {
            requiredCount += 1 // Passport only
            if (ubo.passportFilePath) compliantCount++
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
    doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 14, 37)

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
          } else if (status === 'File Expired (Warning)') {
            data.cell.styles.textColor = [255, 100, 0]
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
        if (entity.type === 'company') {
          doc.text('• Certificate of Incorporation:', 20, finalY)
          doc.setTextColor(entity.certificateOfIncorporationPath ? 0 : 255, entity.certificateOfIncorporationPath ? 150 : 0, 0)
          doc.text(entity.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING', 85, finalY)
          finalY += 5

          doc.setTextColor(0, 0, 0)
          doc.text('• Articles of Association:', 20, finalY)
          doc.setTextColor(entity.articlesOfAssociationPath ? 0 : 255, entity.articlesOfAssociationPath ? 150 : 0, 0)
          doc.text(entity.articlesOfAssociationPath ? 'ON FILE' : 'MISSING', 85, finalY)
          finalY += 5

          doc.setTextColor(0, 0, 0)
          doc.text('• KYC:', 20, finalY)
          doc.setTextColor(entity.kycFilePath ? 0 : 255, entity.kycFilePath ? 150 : 0, 0)
          doc.text(entity.kycFilePath ? 'ON FILE' : 'MISSING', 85, finalY)
          finalY += 5
        }

        if (entity.type === 'person') {
          doc.text('• ID/Passport:', 20, finalY)
          doc.setTextColor(entity.passportFilePath ? 0 : 255, entity.passportFilePath ? 150 : 0, 0)
          doc.text(entity.passportFilePath ? 'ON FILE' : 'MISSING', 85, finalY)
          finalY += 5
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

            if (ubo.type === 'company') {
              doc.setTextColor(0, 0, 0)
              doc.text('      - Certificate of Incorporation:', 30, finalY)
              doc.setTextColor(ubo.certificateOfIncorporationPath ? 0 : 255, ubo.certificateOfIncorporationPath ? 150 : 0, 0)
              doc.text(ubo.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING', 105, finalY)
              finalY += 4

              doc.setTextColor(0, 0, 0)
              doc.text('      - Articles of Association:', 30, finalY)
              doc.setTextColor(ubo.articlesOfAssociationPath ? 0 : 255, ubo.articlesOfAssociationPath ? 150 : 0, 0)
              doc.text(ubo.articlesOfAssociationPath ? 'ON FILE' : 'MISSING', 105, finalY)
              finalY += 4

              doc.setTextColor(0, 0, 0)
              doc.text('      - KYC:', 30, finalY)
              doc.setTextColor(ubo.kycFilePath ? 0 : 255, ubo.kycFilePath ? 150 : 0, 0)
              doc.text(ubo.kycFilePath ? 'ON FILE' : 'MISSING', 105, finalY)
              finalY += 4
            }

            if (ubo.type === 'person') {
              doc.setTextColor(0, 0, 0)
              doc.text('      - ID/Passport:', 30, finalY)
              doc.setTextColor(ubo.passportFilePath ? 0 : 255, ubo.passportFilePath ? 150 : 0, 0)
              doc.text(ubo.passportFilePath ? 'ON FILE' : 'MISSING', 105, finalY)
              finalY += 4
            }
          })
        } else {
          finalY += 3
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(255, 0, 0)
          doc.text('⚠ Missing UBO', 20, finalY)
          finalY += 5
        }

        finalY += 8
      })
    }

    doc.save(`${vessel.name}_Compliance_Report.pdf`)
  },

  exportFleetToExcel: async (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const data: any[] = []
    let totalCompliant = 0
    let totalRequired = 0
    const activeVessels = vessels.filter(v => v.isActive)

    // Section 1: Vessel Documents
    activeVessels.forEach(v => {
      docTypes.forEach(type => {
        const doc = allDocs.find(d => d.vesselId === v.id && d.documentTypeId === type.id)
        const isRequired = doc ? doc.required : type.required

        if (isRequired) {
          totalRequired++
          if (doc?.filePath) totalCompliant++

          data.push({
            'Vessel': v.name,
            'IMO': v.imoNumber,
            'Document Name': type.name,
            'Description': type.description || '',
            'Status': doc?.filePath ? 'COMPLIANT' : 'MISSING',
            'Date of Receipt': doc?.receivedDate || 'N/A',
            'Expiry Date': doc?.expiryDate || 'N/A'
          })
        }
      })
    })

    // Section 2: Fleet Assureds (Deduplicated)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const excelAssuredRoles = await window.api.getAssuredRoles()
    const excelRoleOrderMap = new Map(excelAssuredRoles.map((r, i) => [r.name, i]))

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

        // Company documents
        if (entity.type === 'company') {
          totalRequired++
          if (entity.certificateOfIncorporationPath) totalCompliant++
          assuredData.push({
            'Vessel': '',
            'IMO': '',
            'Document Name': '  - Certificate of Incorporation',
            'Description': '',
            'Status': entity.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': ''
          })

          totalRequired++
          if (entity.articlesOfAssociationPath) totalCompliant++
          assuredData.push({
            'Vessel': '',
            'IMO': '',
            'Document Name': '  - Articles of Association',
            'Description': '',
            'Status': entity.articlesOfAssociationPath ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': ''
          })

          totalRequired++
          if (entity.kycFilePath) totalCompliant++
          assuredData.push({
            'Vessel': '',
            'IMO': '',
            'Document Name': '  - KYC',
            'Description': '',
            'Status': entity.kycFilePath ? 'ON FILE' : 'MISSING',
            'Date of Receipt': '',
            'Expiry Date': ''
          })
        }

        // Person passport
        if (entity.type === 'person') {
          totalRequired++
          if (entity.passportFilePath) totalCompliant++
          assuredData.push({
            'Vessel': '',
            'IMO': '',
            'Document Name': '  - ID/Passport',
            'Description': '',
            'Status': entity.passportFilePath ? 'ON FILE' : 'MISSING',
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

            if (ubo.type === 'company') {
              totalRequired++
              if (ubo.certificateOfIncorporationPath) totalCompliant++
              assuredData.push({
                'Vessel': '',
                'IMO': '',
                'Document Name': '       - Certificate of Incorporation',
                'Description': '',
                'Status': ubo.certificateOfIncorporationPath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': ''
              })

              totalRequired++
              if (ubo.articlesOfAssociationPath) totalCompliant++
              assuredData.push({
                'Vessel': '',
                'IMO': '',
                'Document Name': '       - Articles of Association',
                'Description': '',
                'Status': ubo.articlesOfAssociationPath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': ''
              })

              totalRequired++
              if (ubo.kycFilePath) totalCompliant++
              assuredData.push({
                'Vessel': '',
                'IMO': '',
                'Document Name': '       - KYC',
                'Description': '',
                'Status': ubo.kycFilePath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': ''
              })
            }

            if (ubo.type === 'person') {
              totalRequired++
              if (ubo.passportFilePath) totalCompliant++
              assuredData.push({
                'Vessel': '',
                'IMO': '',
                'Document Name': '       - ID/Passport',
                'Description': '',
                'Status': ubo.passportFilePath ? 'ON FILE' : 'MISSING',
                'Date of Receipt': '',
                'Expiry Date': ''
              })
            }
          })
        } else {
          assuredData.push({ 'Vessel': '', 'IMO': '', 'Document Name': '  ⚠ Missing UBO', 'Description': '', 'Status': 'WARNING', 'Date of Receipt': '', 'Expiry Date': '' })
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

    // Section 1: Vessel Documents
    activeVessels.forEach(v => {
      docTypes.forEach(type => {
        const vDoc = allDocs.find(d => d.vesselId === v.id && d.documentTypeId === type.id)
        const isRequired = vDoc ? vDoc.required : type.required

        if (isRequired) {
          totalRequired++
          if (vDoc?.filePath) totalCompliant++

          tableData.push([
            v.name,
            type.name,
            vDoc?.filePath ? (isExpired(vDoc.expiryDate) ? 'File Expired (Warning)' : 'Compliant') : 'Missing',
            vDoc?.expiryDate || '-'
          ])
        }
      })
    })

    // Section 2: Fleet Assureds (Deduplicated)
    const allEntities = await window.api.getEntities()
    const allEntityUBOs = await window.api.getEntityUBOs()
    const fleetAssuredRoles = await window.api.getAssuredRoles()
    const fleetRoleOrderMap = new Map(fleetAssuredRoles.map((r, i) => [r.name, i]))

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
    const sortedAssureds = [...assuredMap.entries()].sort((a, b) => (fleetRoleOrderMap.get(a[1].role) ?? 999) - (fleetRoleOrderMap.get(b[1].role) ?? 999))

    // Build assured data for PDF
    const assuredTableData: any[] = []
    for (const [, { entity, vessels: vesselNames, role }] of sortedAssureds) {
      const vesselList = vesselNames.length > 2 ? `${vesselNames.slice(0, 2).join(', ')}...` : vesselNames.join(', ')

      // Entity header row
      assuredTableData.push([
        entity.name,
        entity.type.toUpperCase(),
        role,
        vesselList,
        ''
      ])

      // Company documents
      if (entity.type === 'company') {
        totalRequired++
        if (entity.certificateOfIncorporationPath) totalCompliant++
        assuredTableData.push(['', '', '  Certificate of Incorporation', '', entity.certificateOfIncorporationPath ? 'On File' : 'Missing'])

        totalRequired++
        if (entity.articlesOfAssociationPath) totalCompliant++
        assuredTableData.push(['', '', '  Articles of Association', '', entity.articlesOfAssociationPath ? 'On File' : 'Missing'])

        totalRequired++
        if (entity.kycFilePath) totalCompliant++
        assuredTableData.push(['', '', '  KYC', '', entity.kycFilePath ? 'On File' : 'Missing'])
      }

      // Person passport
      if (entity.type === 'person') {
        totalRequired++
        if (entity.passportFilePath) totalCompliant++
        assuredTableData.push(['', '', '  ID/Passport', '', entity.passportFilePath ? 'On File' : 'Missing'])
      }

      // UBOs for this entity
      const ubos = allEntityUBOs
        .filter(u => u.assuredEntityId === entity.id)
        .map(u => allEntities.find(e => e.id === u.uboEntityId))
        .filter(Boolean)

      if (ubos.length > 0) {
        ubos.forEach((ubo) => {
          if (!ubo) return
          assuredTableData.push([`  UBO: ${ubo.name}`, ubo.type.toUpperCase(), '', '', ''])

          if (ubo.type === 'company') {
            totalRequired++
            if (ubo.certificateOfIncorporationPath) totalCompliant++
            assuredTableData.push(['', '', '    Certificate of Incorporation', '', ubo.certificateOfIncorporationPath ? 'On File' : 'Missing'])

            totalRequired++
            if (ubo.articlesOfAssociationPath) totalCompliant++
            assuredTableData.push(['', '', '    Articles of Association', '', ubo.articlesOfAssociationPath ? 'On File' : 'Missing'])

            totalRequired++
            if (ubo.kycFilePath) totalCompliant++
            assuredTableData.push(['', '', '    KYC', '', ubo.kycFilePath ? 'On File' : 'Missing'])
          }

          if (ubo.type === 'person') {
            totalRequired++
            if (ubo.passportFilePath) totalCompliant++
            assuredTableData.push(['', '', '    ID/Passport', '', ubo.passportFilePath ? 'On File' : 'Missing'])
          }
        })
      } else {
        assuredTableData.push(['', '', '  ⚠ Missing UBO', '', 'Warning'])
      }
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
    doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 14, 37)

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

    // Section 1: Vessel Documents Table
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Vessel Documents', 14, 83)

    let finalY = 85

    autoTable(doc, {
      startY: 87,
      head: [['Vessel', 'Document', 'Status', 'Expires']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [58, 123, 213], textColor: 255 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const status = data.cell.raw
          if (status === 'Missing') {
            data.cell.styles.textColor = [255, 0, 0]
            data.cell.styles.fontStyle = 'bold'
          } else if (status === 'File Expired (Warning)') {
            data.cell.styles.textColor = [255, 100, 0]
            data.cell.styles.fontStyle = 'bold'
          } else {
            data.cell.styles.textColor = [0, 150, 0]
          }
        }
      },
      styles: { fontSize: 9, cellPadding: 3 },
      didDrawPage: (data) => {
        if (data.cursor) {
          finalY = data.cursor.y
        }
      }
    })

    // Section 2: Fleet Assureds Table
    if (assuredTableData.length > 0) {
      // Check if we need a new page
      if (finalY > 240) {
        doc.addPage()
        finalY = 20
      } else {
        finalY += 10
      }

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Fleet Assureds (Deduplicated)', 14, finalY)

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Entity', 'Type', 'Document/Role', 'Vessels', 'Status']],
        body: assuredTableData,
        theme: 'striped',
        headStyles: { fillColor: [100, 100, 100], textColor: 255 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            const status = data.cell.raw
            if (status === 'Missing') {
              data.cell.styles.textColor = [255, 0, 0]
              data.cell.styles.fontStyle = 'bold'
            } else if (status === 'On File') {
              data.cell.styles.textColor = [0, 150, 0]
            }
          }
          // Bold entity name rows
          if (data.section === 'body' && data.column.index === 0 && data.cell.raw && !String(data.cell.raw).startsWith(' ')) {
            data.cell.styles.fontStyle = 'bold'
          }
        },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 20 },
          2: { cellWidth: 50 },
          3: { cellWidth: 40 },
          4: { cellWidth: 25 }
        }
      })
    }

    doc.save(`${fleet.name}_Fleet_Report.pdf`)
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
