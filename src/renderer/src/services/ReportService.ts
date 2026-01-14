import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Vessel, Fleet, VesselDocument, DocumentType } from '../../../shared/types'

export const ReportService = {
  exportVesselToExcel: (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const mandatoryDocs = docs.filter(d => d.required)
    const data = mandatoryDocs.map(d => {
      const docType = docTypes.find(t => t.id === d.documentTypeId)
      return {
        'Document Name': docType?.name || 'Unknown',
        'Status': d.filePath ? 'Linked' : 'Missing',
        'Date of Receipt': d.receivedDate || 'N/A',
        'Expiry Date': d.expiryDate || 'N/A',
        'Uploaded Date': d.uploadedDate ? new Date(d.uploadedDate).toLocaleDateString() : 'N/A'
      }
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Vessel Compliance')
    XLSX.writeFile(wb, `${vessel.name}_Compliance_Report.xlsx`)
  },

  exportVesselToPDF: (vessel: Vessel, docTypes: DocumentType[], docs: VesselDocument[]) => {
    const doc = new jsPDF()
    const mandatoryDocs = docs.filter(d => d.required)

    doc.setFontSize(18)
    doc.text(`Vessel Compliance Report: ${vessel.name}`, 14, 22)
    doc.setFontSize(12)
    doc.text(`IMO Number: ${vessel.imoNumber}`, 14, 30)
    doc.text(`Report date: ${new Date().toLocaleDateString()}`, 14, 38)

    const tableData = mandatoryDocs.map(d => {
      const docType = docTypes.find(t => t.id === d.documentTypeId)
      return [
        docType?.name || 'Unknown',
        d.filePath ? 'Linked' : 'Missing',
        d.receivedDate || 'N/A',
        d.expiryDate || 'N/A'
      ]
    })

    autoTable(doc, {
      startY: 45,
      head: [['Document Name', 'Status', 'Date of Receipt', 'Expiry Date']],
      body: tableData,
    })

    doc.save(`${vessel.name}_Compliance_Report.pdf`)
  },

  exportFleetToExcel: (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const data: any[] = []

    vessels.forEach(v => {
      const vDocs = allDocs.filter(d => d.vesselId === v.id && d.required)
      vDocs.forEach(d => {
        const docType = docTypes.find(t => t.id === d.documentTypeId)
        data.push({
          'Vessel': v.name,
          'IMO': v.imoNumber,
          'Document Name': docType?.name || 'Unknown',
          'Status': d.filePath ? 'Linked' : 'Missing',
          'Date of Receipt': d.receivedDate || 'N/A',
          'Expiry Date': d.expiryDate || 'N/A'
        })
      })
    })

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fleet Compliance')
    XLSX.writeFile(wb, `${fleet.name}_Fleet_Compliance_Report.xlsx`)
  },

  exportFleetToPDF: (fleet: Fleet, vessels: Vessel[], docTypes: DocumentType[], allDocs: VesselDocument[]) => {
    const doc = new jsPDF()
    
    doc.setFontSize(18)
    doc.text(`Fleet Compliance Report: ${fleet.name}`, 14, 22)
    doc.setFontSize(12)
    doc.text(`Report date: ${new Date().toLocaleDateString()}`, 14, 30)

    const tableData: any[] = []
    vessels.forEach(v => {
      const vDocs = allDocs.filter(d => d.vesselId === v.id && d.required)
      vDocs.forEach(d => {
        const docType = docTypes.find(t => t.id === d.documentTypeId)
        tableData.push([
          v.name,
          docType?.name || 'Unknown',
          d.filePath ? 'Linked' : 'Missing',
          d.receivedDate || 'N/A',
          d.expiryDate || 'N/A'
        ])
      })
    })

    autoTable(doc, {
      startY: 40,
      head: [['Vessel', 'Document Name', 'Status', 'Date of Receipt', 'Expiry Date']],
      body: tableData,
    })

    doc.save(`${fleet.name}_Fleet_Report.pdf`)
  }
}
