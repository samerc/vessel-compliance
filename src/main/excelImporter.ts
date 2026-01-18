import XLSX from 'xlsx'
import { db } from './mysql/adapter'
import { DocumentType, VesselDocument } from '../shared/types'

export class ExcelImporter {
    private documentTypeMapping: { [excelColumn: string]: string } = {
        'Hull App': 'Hull Application',
        'P&I App': 'P&I Application',
        'COR': 'Certificate of Registry',
        'Class': 'Class Certificate',
        'SMC': 'Safety Management Certificate',
        'DOC': 'Document of Compliance',
        'Crew List': 'Crew List',
        'Crew Salaries': 'Crew Salaries',
        'Crew Contracts': 'Crew Contracts',
        'Salaries Letter': 'Salaries Letter',
        'Medical Letter': 'Medical Letter'
    }

    async importFromExcel(filePath: string): Promise<{ success: boolean; message: string; stats?: any }> {
        try {
            const workbook = XLSX.readFile(filePath)
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

            if (rawData.length < 2) {
                return { success: false, message: 'Excel file is empty or has no data rows' }
            }

            const headers = rawData[0].map((h: any) => h?.toString().trim() || '')
            const dataRows = rawData.slice(1)

            // Find column indices (case-insensitive, trimmed)
            const vesselCol = headers.findIndex((h: string) => h.toLowerCase() === 'vessel')
            const imoCol = headers.findIndex((h: string) => h.toLowerCase() === 'imo')

            if (vesselCol === -1) {
                return { success: false, message: `Could not find "Vessel" column in Excel. Found columns: ${headers.filter((h: string) => h).join(', ')}` }
            }

            const stats = {
                vesselsCreated: 0,
                vesselsUpdated: 0,
                documentsImported: 0,
                entitiesCreated: 0,
                assuredsLinked: 0
            }

            // Get or create document types
            const existingDocTypes = await db.getDocumentTypes()
            const docTypeMap = new Map<string, DocumentType>()

            for (const [excelName, dbName] of Object.entries(this.documentTypeMapping)) {
                let docType = existingDocTypes.find(dt => dt.name === dbName)
                if (!docType) {
                    docType = await db.addDocumentType({
                        name: dbName,
                        required: false,
                        order: existingDocTypes.length + docTypeMap.size + 1
                    })
                    stats.entitiesCreated++
                }
                docTypeMap.set(excelName, docType)
            }

            // Process each vessel row
            for (const row of dataRows) {
                const vesselName = row[vesselCol]?.toString().trim()
                if (!vesselName || vesselName === '') continue

                const imoNumber = imoCol !== -1 ? row[imoCol]?.toString().trim() : ''

                // Check if vessel exists
                const existingVessels = await db.getVessels()
                let vessel = existingVessels.find(v => v.name === vesselName || (imoNumber && v.imoNumber === imoNumber))

                if (!vessel) {
                    vessel = await db.addVessel({
                        name: vesselName,
                        imoNumber: imoNumber || 'N/A',
                        fleetId: undefined
                    })
                    stats.vesselsCreated++
                } else {
                    stats.vesselsUpdated++
                }

                // Import documents
                for (const [excelName, docType] of docTypeMap.entries()) {
                    const colIndex = headers.findIndex((h: string) => h === excelName)
                    if (colIndex === -1) continue

                    const cellValue = row[colIndex]?.toString().trim().toUpperCase()

                    // Handle Yes/No/E/N/A
                    let hasFile = false
                    let expiryDate: string | undefined = undefined

                    if (cellValue === 'YES' || cellValue === 'E') {
                        hasFile = true
                        if (cellValue === 'E') {
                            // Mark as expired - set expiry to yesterday
                            const yesterday = new Date()
                            yesterday.setDate(yesterday.getDate() - 1)
                            expiryDate = yesterday.toISOString().split('T')[0]
                        }
                    }

                    if (hasFile || cellValue === 'NO') {
                        const vesselDoc: VesselDocument = {
                            vesselId: vessel.id,
                            documentTypeId: docType.id,
                            filePath: hasFile ? `[Imported - ${excelName}]` : '',
                            sent: false,
                            required: docType.required,
                            uploadedDate: new Date().toISOString(),
                            uploadedBy: 'Excel Import',
                            expiryDate: expiryDate
                        }
                        await db.upsertVesselDocument(vesselDoc)
                        stats.documentsImported++
                    }
                }

                // Import Registered Owner
                const ownerNameCol = headers.findIndex((h: string, i: number) =>
                    h === 'Registered Owners' || (i > 0 && headers[i - 1] === 'Medical Letter')
                )

                if (ownerNameCol !== -1 && row[ownerNameCol]) {
                    const ownerName = row[ownerNameCol]?.toString().trim()
                    if (ownerName && ownerName !== 'N/A' && ownerName !== '') {
                        await this.importEntity(vessel.id, ownerName, 'Registered Owner', 'company', stats)
                    }
                }

                // Import Managers
                const managerCol = headers.findIndex((h: string) => h === 'Managers')
                if (managerCol !== -1 && row[managerCol]) {
                    const managerName = row[managerCol]?.toString().trim()
                    if (managerName && managerName !== 'N/A' && managerName !== '') {
                        await this.importEntity(vessel.id, managerName, 'Manager', 'company', stats)
                    }
                }
            }

            return {
                success: true,
                message: `Import completed successfully!`,
                stats
            }
        } catch (error: any) {
            return {
                success: false,
                message: `Import failed: ${error.message}`
            }
        }
    }

    private async importEntity(
        vesselId: string,
        name: string,
        role: string,
        type: 'company' | 'person',
        stats: any
    ) {
        const entities = await db.getEntities()
        let entity = entities.find(e => e.name === name)

        if (!entity) {
            entity = await db.addEntity({ name, type })
            stats.entitiesCreated++
        }

        // Link to vessel
        const vesselAssureds = await db.getVesselAssureds(vesselId)
        const existingLink = vesselAssureds.find(va => va.entityId === entity!.id)
        if (!existingLink) {
            await db.addVesselAssured({
                vesselId,
                entityId: entity.id,
                role
            })
            stats.assuredsLinked++
        }
    }
}
