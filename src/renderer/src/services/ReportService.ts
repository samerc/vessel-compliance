import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, Fleet, VesselDocument, DocumentType } from '../../../shared/types'

export const ReportService = {
  exportVesselToExcel: (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
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
          'Status': doc?.filePath ? 'COMPLIANT' : 'MISSING',
          'Date of Receipt': doc?.receivedDate || 'N/A',
          'Expiry Date': doc?.expiryDate || 'N/A',
          'Uploaded Date': doc?.uploadedDate ? new Date(doc.uploadedDate).toLocaleDateString() : 'N/A'
        })
      }
    })

    const complianceRate = requiredCount > 0 ? ((compliantCount / requiredCount) * 100).toFixed(1) : '100'
    const missingCount = requiredCount - compliantCount

    const summaryHeader = [
      { 'Document Name': 'VESSEL COMPLIANCE SUMMARY', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Vessel Name', 'Status': vessel.name, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'IMO Number', 'Status': vessel.imoNumber, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Compliance Rate', 'Status': `${complianceRate}%`, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Compliant / Missing', 'Status': `${compliantCount} / ${missingCount}`, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' }
    ]

    const ws = XLSX.utils.json_to_sheet([...summaryHeader, ...complianceData])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vessel Compliance')
    XLSX.writeFile(wb, `${vessel.name}_Compliance_Report.xlsx`)
  },

  exportVesselToPDF: (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
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
          vDoc?.filePath ? 'Compliant' : 'Missing',
          vDoc?.receivedDate || '-',
          vDoc?.expiryDate || '-'
        ])
      }
    })

    const complianceRate = requiredCount > 0 ? ((compliantCount / requiredCount) * 100).toFixed(1) : '100'

    // Header
    doc.setFillColor(15, 18, 24)
    doc.rect(0, 0, 210, 40, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.text('Compliance Report', 14, 25)

    doc.setFontSize(10)
    doc.setTextColor(150, 150, 150)
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 32)

    // Vessel Info Section
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(vessel.name, 14, 55)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`IMO Number: ${vessel.imoNumber}`, 14, 62)

    // Summary Box
    doc.setDrawColor(200, 200, 200)
    doc.setFillColor(245, 247, 249)
    doc.roundedRect(140, 48, 56, 25, 3, 3, 'FD')

    doc.setFontSize(9)
    doc.text('Compliance Rate', 145, 55)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(parseFloat(complianceRate) > 80 ? 0 : 200, parseFloat(complianceRate) > 80 ? 150 : 0, 0)
    doc.text(`${complianceRate}%`, 145, 65)

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`${compliantCount} / ${requiredCount} Docs`, 145, 70)

    autoTable(doc, {
      startY: 80,
      head: [['Document Name', 'Status', 'Received', 'Expires']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [58, 123, 213], textColor: 255 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const status = data.cell.raw
          if (status === 'Missing') {
            data.cell.styles.textColor = [255, 0, 0]
            data.cell.styles.fontStyle = 'bold'
          } else {
            data.cell.styles.textColor = [0, 150, 0]
          }
        }
      },
      styles: { fontSize: 10, cellPadding: 5 }
    })

    doc.save(`${vessel.name}_Compliance_Report.pdf`)
  },

  exportFleetToExcel: (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const data: any[] = []
    let totalCompliant = 0
    let totalRequired = 0

    vessels.forEach(v => {
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
            'Status': doc?.filePath ? 'COMPLIANT' : 'MISSING',
            'Date of Receipt': doc?.receivedDate || 'N/A',
            'Expiry Date': doc?.expiryDate || 'N/A'
          })
        }
      })
    })

    const complianceRate = totalRequired > 0 ? ((totalCompliant / totalRequired) * 100).toFixed(1) : '100'

    const summaryHeader = [
      { 'Vessel': 'FLEET COMPLIANCE SUMMARY', 'IMO': '', 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Fleet Name', 'IMO': fleet.name, 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Total Vessels', 'IMO': vessels.length.toString(), 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Fleet Compliance Rate', 'IMO': `${complianceRate}%`, 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Compliant / Missing', 'IMO': `${totalCompliant} / ${totalRequired}`, 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': '', 'IMO': '', 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' }
    ]

    const ws = XLSX.utils.json_to_sheet([...summaryHeader, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Compliance')
    XLSX.writeFile(wb, `${fleet.name}_Fleet_Compliance_Report.xlsx`)
  },

  exportFleetToPDF: (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const doc = new jsPDF()
    const tableData: any[] = []
    let totalCompliant = 0
    let totalRequired = 0

    vessels.forEach(v => {
      docTypes.forEach(type => {
        const vDoc = allDocs.find(d => d.vesselId === v.id && d.documentTypeId === type.id)
        const isRequired = vDoc ? vDoc.required : type.required

        if (isRequired) {
          totalRequired++
          if (vDoc?.filePath) totalCompliant++

          tableData.push([
            v.name,
            type.name,
            vDoc?.filePath ? 'Compliant' : 'Missing',
            vDoc?.receivedDate || '-',
            vDoc?.expiryDate || '-'
          ])
        }
      })
    })

    const complianceRate = totalRequired > 0 ? ((totalCompliant / totalRequired) * 100).toFixed(1) : '100'

    // Header
    doc.setFillColor(15, 18, 24)
    doc.rect(0, 0, 210, 40, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.text('Fleet Compliance Report', 14, 25)

    doc.setFontSize(10)
    doc.setTextColor(150, 150, 150)
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 32)

    // Fleet Info Section
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(fleet.name, 14, 55)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`Total Vessels: ${vessels.length}`, 14, 62)

    // Summary Box
    doc.setDrawColor(200, 200, 200)
    doc.setFillColor(245, 247, 249)
    doc.roundedRect(140, 48, 56, 25, 3, 3, 'FD')

    doc.setFontSize(9)
    doc.text('Fleet Compliance Rate', 142, 55)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(parseFloat(complianceRate) > 80 ? 0 : 200, parseFloat(complianceRate) > 80 ? 150 : 0, 0)
    doc.text(`${complianceRate}%`, 142, 65)

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`${totalCompliant} / ${totalRequired} Docs`, 142, 70)

    autoTable(doc, {
      startY: 80,
      head: [['Vessel', 'Document', 'Status', 'Received', 'Expires']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [58, 123, 213], textColor: 255 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const status = data.cell.raw
          if (status === 'Missing') {
            data.cell.styles.textColor = [255, 0, 0]
            data.cell.styles.fontStyle = 'bold'
          } else {
            data.cell.styles.textColor = [0, 150, 0]
          }
        }
      },
      styles: { fontSize: 9, cellPadding: 3 }
    })

    doc.save(`${fleet.name}_Fleet_Report.pdf`)
  }
}
