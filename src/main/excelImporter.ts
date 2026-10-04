import XLSX from 'xlsx-js-style'
import { db } from './mysql/adapter'
import type { Entity } from '../shared/types'

type ExcelCell = string | number | boolean | Date | null | undefined

interface ImportStats {
  vesselsCreated: number
  vesselsUpdated: number
  entitiesCreated: number
  assuredsLinked: number
  customersAssigned: number
}

export class ExcelImporter {
  async importFromExcel(
    filePath: string
  ): Promise<{ success: boolean; message: string; stats?: ImportStats }> {
    try {
      const workbook = XLSX.readFile(filePath)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rawData: ExcelCell[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })

      if (rawData.length < 2) {
        return { success: false, message: 'Excel file is empty or has no data rows' }
      }

      const headers = rawData[0].map((h) => h?.toString().trim() || '')
      const dataRows = rawData.slice(1)

      // Find column indices (case-insensitive, trimmed)
      const findCol = (name: string): number =>
        headers.findIndex(
          (h: string) => h.toLowerCase().replace(/[#]/g, '').trim() === name.toLowerCase()
        )

      const vesselCol = findCol('vessel')
      const customerNameCol = findCol('customer name')
      const customerTypeCol = findCol('customer type')
      const imoCol = headers.findIndex(
        (h: string) => h.toLowerCase().replace(/[#]/g, '').trim() === 'imo'
      )
      const ownersCol = findCol('registered owners')
      const managersCol = findCol('managers')

      if (vesselCol === -1) {
        return {
          success: false,
          message: `Could not find "Vessel" column in Excel. Found columns: ${headers.filter((h: string) => h).join(', ')}`
        }
      }

      const stats: ImportStats = {
        vesselsCreated: 0,
        vesselsUpdated: 0,
        entitiesCreated: 0,
        assuredsLinked: 0,
        customersAssigned: 0
      }

      for (const row of dataRows) {
        const vesselName = row[vesselCol]?.toString().trim()
        if (!vesselName || vesselName === '') continue

        // IMO: use from Excel or generate random 7-digit number starting with 9
        let imoNumber = imoCol !== -1 ? row[imoCol]?.toString().trim() : ''
        if (!imoNumber || imoNumber === '' || imoNumber === 'N/A') {
          imoNumber = '9' + Math.floor(100000 + Math.random() * 900000).toString()
        }

        // Customer: find or create entity
        const customerName = customerNameCol !== -1 ? row[customerNameCol]?.toString().trim() : ''
        const customerTypeRaw =
          customerTypeCol !== -1 ? row[customerTypeCol]?.toString().trim().toLowerCase() : ''
        let customerId: string | undefined
        let customerType: 'broker' | 'direct' | undefined

        if (customerName && customerName !== '' && customerName !== 'N/A') {
          const customerEntity = await this.findOrCreateEntity(customerName, 'company', stats)
          customerId = customerEntity.id

          if (customerTypeRaw === 'broker' || customerTypeRaw === 'b') {
            customerType = 'broker'
          } else if (
            customerTypeRaw === 'direct' ||
            customerTypeRaw === 'client' ||
            customerTypeRaw === 'd' ||
            customerTypeRaw === 'c'
          ) {
            customerType = 'direct'
          }
        }

        // Find or create vessel
        const existingVessels = await db.getVessels()
        let vessel = existingVessels.find(
          (v) => v.name.toUpperCase() === vesselName.toUpperCase() || v.imoNumber === imoNumber
        )

        if (!vessel) {
          vessel = await db.addVessel({
            name: vesselName.toUpperCase(),
            imoNumber,
            fleetId: undefined,
            isActive: true,
            customerId,
            customerType
          })
          stats.vesselsCreated++
        } else {
          // Update customer if provided
          if (customerId) {
            await db.updateVessel(vessel.id, { customerId, customerType })
            stats.customersAssigned++
          }
          stats.vesselsUpdated++
        }

        // Assign customer to newly created vessel
        if (customerId && !vessel.customerId) {
          stats.customersAssigned++
        }

        // Import Registered Owners
        if (ownersCol !== -1 && row[ownersCol]) {
          const ownerName = row[ownersCol]?.toString().trim()
          if (ownerName && ownerName !== 'N/A' && ownerName !== '') {
            await this.importAssured(vessel.id, ownerName, 'Registered Owner', 'company', stats)
          }
        }

        // Import Managers
        if (managersCol !== -1 && row[managersCol]) {
          const managerName = row[managersCol]?.toString().trim()
          if (managerName && managerName !== 'N/A' && managerName !== '') {
            await this.importAssured(vessel.id, managerName, 'Manager', 'company', stats)
          }
        }
      }

      return {
        success: true,
        message: 'Import completed successfully!',
        stats
      }
    } catch (error) {
      return {
        success: false,
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  private async findOrCreateEntity(
    name: string,
    type: 'company' | 'person',
    stats: ImportStats
  ): Promise<Entity> {
    const entities = await db.getEntities()
    let entity = entities.find((e) => e.name.toLowerCase() === name.toLowerCase())

    if (!entity) {
      entity = await db.addEntity({ name, type })
      stats.entitiesCreated++
    }

    return entity
  }

  private async importAssured(
    vesselId: string,
    name: string,
    role: string,
    type: 'company' | 'person',
    stats: ImportStats
  ): Promise<void> {
    const entity = await this.findOrCreateEntity(name, type, stats)

    const vesselAssureds = await db.getVesselAssureds(vesselId)
    const existingLink = vesselAssureds.find((va) => va.entityId === entity.id)
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
