import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, Fleet, VesselDocument, DocumentType } from '../../../shared/types'

export const ReportService = {
  exportVesselToExcel: (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const mandatoryDocs = docs.filter(d => d.required)
    const compliantCount = mandatoryDocs.filter(d => d.filePath).length
    const missingCount = mandatoryDocs.length - compliantCount
    const complianceRate = mandatoryDocs.length > 0 ? ((compliantCount / mandatoryDocs.length) * 100).toFixed(1) : '0'

    const data = mandatoryDocs.map(d => {
      const docType = docTypes.find(t => t.id === d.documentTypeId)
      return {
        'Document Name': docType?.name || 'Unknown',
        'Status': d.filePath ? 'COMPLIANT' : 'MISSING',
        'Date of Receipt': d.receivedDate || 'N/A',
        'Expiry Date': d.expiryDate || 'N/A',
        'Uploaded Date': d.uploadedDate ? new Date(d.uploadedDate).toLocaleDateString() : 'N/A'
      }
    })

    // Add summary rows at the beginning
    const summaryHeader = [
      { 'Document Name': 'VESSEL COMPLIANCE SUMMARY', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Vessel Name', 'Status': vessel.name, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'IMO Number', 'Status': vessel.imoNumber, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Compliance Rate', 'Status': `${complianceRate}%`, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': 'Compliant / Missing', 'Status': `${compliantCount} / ${missingCount}`, 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' },
      { 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '', 'Uploaded Date': '' } // Spacer
    ]

    const ws = XLSX.utils.json_to_sheet([...summaryHeader, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vessel Compliance')
    XLSX.writeFile(wb, `${vessel.name}_Compliance_Report.xlsx`)
  },

  exportVesselToPDF: (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const doc = new jsPDF()
    const mandatoryDocs = docs.filter(d => d.required)
    const compliantCount = mandatoryDocs.filter(d => d.filePath).length
    const complianceRate = mandatoryDocs.length > 0 ? ((compliantCount / mandatoryDocs.length) * 100).toFixed(1) : '0'

    // Header
    doc.setFillColor(15, 18, 24) // Dark BG matching app
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
    doc.setTextColor(parseInt(complianceRate) > 80 ? 0 : 200, parseInt(complianceRate) > 80 ? 150 : 0, 0)
    doc.text(`${complianceRate}%`, 145, 65)

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`${compliantCount} / ${mandatoryDocs.length} Docs`, 145, 70)

    const tableData = mandatoryDocs.map(d => {
      const docType = docTypes.find(t => t.id === d.documentTypeId)
      return [
        docType?.name || 'Unknown',
        d.filePath ? 'Compliant' : 'Missing',
        d.receivedDate || '-',
        d.expiryDate || '-'
      ]
    })

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

    // Overall Stats
    const fleetMandatoryDocs = allDocs.filter(d => d.required)
    const compliantCount = fleetMandatoryDocs.filter(d => d.filePath).length
    const missingCount = fleetMandatoryDocs.length - compliantCount
    const complianceRate = fleetMandatoryDocs.length > 0 ? ((compliantCount / fleetMandatoryDocs.length) * 100).toFixed(1) : '0'

    const summaryHeader = [
      { 'Vessel': 'FLEET COMPLIANCE SUMMARY', 'IMO': '', 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Fleet Name', 'IMO': fleet.name, 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Total Vessels', 'IMO': vessels.length.toString(), 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Fleet Compliance Rate', 'IMO': `${complianceRate}%`, 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': 'Compliant / Missing', 'IMO': `${compliantCount} / ${fleetMandatoryDocs.length}`, 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' },
      { 'Vessel': '', 'IMO': '', 'Document Name': '', 'Status': '', 'Date of Receipt': '', 'Expiry Date': '' } // Spacer
    ]

    vessels.forEach(v => {
      const vDocs = allDocs.filter(d => d.vesselId === v.id && d.required)
      vDocs.forEach(d => {
        const docType = docTypes.find(t => t.id === d.documentTypeId)
        data.push({
          'Vessel': v.name,
          'IMO': v.imoNumber,
          'Document Name': docType?.name || 'Unknown',
          'Status': d.filePath ? 'COMPLIANT' : 'MISSING',
          'Date of Receipt': d.receivedDate || 'N/A',
          'Expiry Date': d.expiryDate || 'N/A'
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet([...summaryHeader, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Compliance')
    XLSX.writeFile(wb, `${fleet.name}_Fleet_Compliance_Report.xlsx`)
  },

  exportFleetToPDF: (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const doc = new jsPDF()
    const fleetMandatoryDocs = allDocs.filter(d => d.required)
    const compliantCount = fleetMandatoryDocs.filter(d => d.filePath).length
    const complianceRate = fleetMandatoryDocs.length > 0 ? ((compliantCount / fleetMandatoryDocs.length) * 100).toFixed(1) : '0'

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
    doc.setTextColor(parseInt(complianceRate) > 80 ? 0 : 200, parseInt(complianceRate) > 80 ? 150 : 0, 0)
    doc.text(`${complianceRate}%`, 142, 65)

    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`${compliantCount} / ${fleetMandatoryDocs.length} Docs`, 142, 70)

    const tableData: any[] = []
    vessels.forEach(v => {
      const vDocs = allDocs.filter(d => d.vesselId === v.id && d.required)
      vDocs.forEach(d => {
        const docType = docTypes.find(t => t.id === d.documentTypeId)
        tableData.push([
          v.name,
          docType?.name || 'Unknown',
          d.filePath ? 'Compliant' : 'Missing',
          d.receivedDate || '-',
          d.expiryDate || '-'
        ])
      })
    })

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
