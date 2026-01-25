import { createPool, Pool } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import { readFileSync, existsSync } from 'fs'
import { extname } from 'path'
import { DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO, User, ConditionSurvey, SurveyDefect, SurveyAttachment, Surveyor } from '../../shared/types'
// @ts-ignore
import schemaSql from './schema.sql?raw'

export class MySQLAdapter {
    pool: Pool | null = null
    private configPath: string = ''

    setConfigPath(path: string) {
        this.configPath = path
    }

    isConnected(): boolean {
        return this.pool !== null
    }

    async connect(): Promise<boolean> {
        if (this.pool) return true

        if (!this.configPath || !existsSync(this.configPath)) {
            return false
        }

        try {
            const config = JSON.parse(readFileSync(this.configPath, 'utf-8'))
            this.pool = createPool({
                host: config.host,
                port: config.port,
                user: config.user,
                password: config.password,
                database: config.database,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                dateStrings: true
            })

            await this.pool.getConnection()
            return true
        } catch (error) {
            console.error('Failed to connect to MySQL:', error)
            return false
        }
    }

    async initSchema(): Promise<void> {
        if (!this.pool) throw new Error('Not connected')

        try {
            const statements = schemaSql.split(';').filter((s: string) => s.trim())

            for (const statement of statements) {
                if (statement.trim()) {
                    await this.pool.query(statement)
                }
            }

            // Migration: Add description to document_types if it doesn't exist
            const [cols] = await this.pool.query('SHOW COLUMNS FROM document_types LIKE "description"')
            if ((cols as any[]).length === 0) {
                await this.pool.query('ALTER TABLE document_types ADD COLUMN description TEXT AFTER name')
            }
            // Migration: Add email and phone to entities if they don't exist
            const [entityCols] = await this.pool.query('SHOW COLUMNS FROM entities')
            const entityColNames = (entityCols as any[]).map(c => c.Field)
            if (!entityColNames.includes('email')) {
                await this.pool.query('ALTER TABLE entities ADD COLUMN email VARCHAR(255) AFTER identifier')
            }
            if (!entityColNames.includes('phone')) {
                await this.pool.query('ALTER TABLE entities ADD COLUMN phone VARCHAR(50) AFTER email')
            }
            if (!entityColNames.includes('ofac_checked_at')) {
                await this.pool.query('ALTER TABLE entities ADD COLUMN ofac_checked_at DATETIME AFTER passport_file_path')
            }
            if (!entityColNames.includes('ofac_match_found')) {
                await this.pool.query('ALTER TABLE entities ADD COLUMN ofac_match_found BOOLEAN DEFAULT FALSE AFTER ofac_checked_at')
            }
            if (!entityColNames.includes('ofac_status')) {
                await this.pool.query("ALTER TABLE entities ADD COLUMN ofac_status VARCHAR(20) DEFAULT 'PENDING' AFTER ofac_match_found")
            }

            // Migration: Add OFAC columns to vessels if they don't exist
            const [vesselCols] = await this.pool.query('SHOW COLUMNS FROM vessels')
            const vesselColNames = (vesselCols as any[]).map(c => c.Field)
            if (!vesselColNames.includes('ofac_checked_at')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN ofac_checked_at DATETIME AFTER fleet_id')
            }
            if (!vesselColNames.includes('ofac_match_found')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN ofac_match_found BOOLEAN DEFAULT FALSE AFTER ofac_checked_at')
            }
            if (!vesselColNames.includes('ofac_status')) {
                await this.pool.query("ALTER TABLE vessels ADD COLUMN ofac_status VARCHAR(20) DEFAULT 'PENDING' AFTER ofac_match_found")
            }

            // Migration: Add theme_preference to users if it doesn't exist
            const [userCols] = await this.pool.query('SHOW COLUMNS FROM users')
            const userColNames = (userCols as any[]).map(c => c.Field)
            if (!userColNames.includes('theme_preference')) {
                await this.pool.query("ALTER TABLE users ADD COLUMN theme_preference VARCHAR(10) DEFAULT 'dark' AFTER role")
            }

            // Migration: Add window preferences to users
            if (!userColNames.includes('window_width')) {
                await this.pool.query("ALTER TABLE users ADD COLUMN window_width INT DEFAULT NULL AFTER theme_preference")
            }
            if (!userColNames.includes('window_height')) {
                await this.pool.query("ALTER TABLE users ADD COLUMN window_height INT DEFAULT NULL AFTER window_width")
            }
            if (!userColNames.includes('window_x')) {
                await this.pool.query("ALTER TABLE users ADD COLUMN window_x INT DEFAULT NULL AFTER window_height")
            }
            if (!userColNames.includes('window_y')) {
                await this.pool.query("ALTER TABLE users ADD COLUMN window_y INT DEFAULT NULL AFTER window_x")
            }

            // Migration: Add surveyors table
            const [surveyorsTables] = await this.pool.query("SHOW TABLES LIKE 'surveyors'")
            if ((surveyorsTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS surveyors (
                    id VARCHAR(36) PRIMARY KEY,
                    company_name VARCHAR(255) NOT NULL,
                    country VARCHAR(100) NOT NULL,
                    contact_person VARCHAR(255),
                    contact_details TEXT,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_company_name (company_name),
                    INDEX idx_country (country)
                )`)
            }

            // Migration: Add contact_person column to surveyors
            const [contactPersonCol] = await this.pool.query(
                "SHOW COLUMNS FROM surveyors LIKE 'contact_person'"
            )
            if ((contactPersonCol as any[]).length === 0) {
                await this.pool.query(
                    `ALTER TABLE surveyors ADD COLUMN contact_person VARCHAR(255) AFTER country`
                )
            }

            // Migration: Add corporate document columns to entities
            const [coiCol] = await this.pool.query(
                "SHOW COLUMNS FROM entities LIKE 'certificate_of_incorporation_path'"
            )
            if ((coiCol as any[]).length === 0) {
                await this.pool.query(
                    `ALTER TABLE entities ADD COLUMN certificate_of_incorporation_path TEXT AFTER passport_file_path`
                )
            }

            const [aoaCol] = await this.pool.query(
                "SHOW COLUMNS FROM entities LIKE 'articles_of_association_path'"
            )
            if ((aoaCol as any[]).length === 0) {
                await this.pool.query(
                    `ALTER TABLE entities ADD COLUMN articles_of_association_path TEXT AFTER certificate_of_incorporation_path`
                )
            }

            // Migration: Add kyc_file_path column to entities
            const [kycCol] = await this.pool.query(
                "SHOW COLUMNS FROM entities LIKE 'kyc_file_path'"
            )
            if ((kycCol as any[]).length === 0) {
                await this.pool.query(
                    `ALTER TABLE entities ADD COLUMN kyc_file_path TEXT AFTER articles_of_association_path`
                )
            }

            // Migration: Add condition surveys tables
            const [csTables] = await this.pool.query("SHOW TABLES LIKE 'condition_surveys'")
            if ((csTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS condition_surveys (
                    id VARCHAR(36) PRIMARY KEY,
                    vessel_id VARCHAR(36) NOT NULL,
                    survey_date DATE NOT NULL,
                    surveyor_id VARCHAR(36) NOT NULL,
                    survey_type VARCHAR(100) NOT NULL,
                    location VARCHAR(255),
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(255),
                    FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE,
                    FOREIGN KEY (surveyor_id) REFERENCES surveyors(id) ON DELETE RESTRICT,
                    INDEX idx_vessel_date (vessel_id, survey_date DESC)
                )`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS survey_defects (
                    id VARCHAR(36) PRIMARY KEY,
                    survey_id VARCHAR(36) NOT NULL,
                    defect_number VARCHAR(50) NOT NULL,
                    description TEXT NOT NULL,
                    severity VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
                    due_date DATE,
                    closed_at DATETIME,
                    closed_by VARCHAR(255),
                    closure_notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (survey_id) REFERENCES condition_surveys(id) ON DELETE CASCADE,
                    INDEX idx_survey_status (survey_id, status),
                    INDEX idx_due_date (due_date)
                )`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS survey_attachments (
                    id VARCHAR(36) PRIMARY KEY,
                    survey_id VARCHAR(36) NOT NULL,
                    file_path TEXT NOT NULL,
                    file_name VARCHAR(255) NOT NULL,
                    file_type VARCHAR(50),
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    uploaded_by VARCHAR(255),
                    FOREIGN KEY (survey_id) REFERENCES condition_surveys(id) ON DELETE CASCADE
                )`)
            } else {
                // Migration: Update existing condition_surveys table to use surveyor_id
                const [columns] = await this.pool.query(
                    "SHOW COLUMNS FROM condition_surveys LIKE 'surveyor_name'"
                )
                if ((columns as any[]).length > 0) {
                    // Old schema detected - migrate data
                    // First, create a default "Unknown" surveyor for existing surveys
                    const unknownSurveyorId = '00000000-0000-0000-0000-000000000000'
                    await this.pool.query(
                        `INSERT IGNORE INTO surveyors (id, company_name, country) VALUES (?, 'Unknown', 'Unknown')`,
                        [unknownSurveyorId]
                    )

                    // Add surveyor_id column
                    await this.pool.query(
                        `ALTER TABLE condition_surveys ADD COLUMN surveyor_id VARCHAR(36) DEFAULT ?`,
                        [unknownSurveyorId]
                    )

                    // Update constraint
                    await this.pool.query(
                        `ALTER TABLE condition_surveys ADD FOREIGN KEY (surveyor_id) REFERENCES surveyors(id) ON DELETE RESTRICT`
                    )

                    // Drop old columns
                    await this.pool.query(`ALTER TABLE condition_surveys DROP COLUMN surveyor_name`)
                    await this.pool.query(`ALTER TABLE condition_surveys DROP COLUMN surveyor_company`)
                }
            }
        } catch (error) {
            console.error('Schema initialization failed:', error)
            throw error
        }
    }

    // --- Document Types ---
    async getDocumentTypes(): Promise<DocumentType[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, description, required, order_index as `order` FROM document_types ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, required: Boolean(r.required) }))
    }

    async addDocumentType(docType: Omit<DocumentType, 'id'>): Promise<DocumentType> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO document_types (id, name, description, required, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, docType.name, docType.description || null, docType.required, docType.order]
        )
        return { ...docType, id }
    }

    async updateDocumentType(id: string, updates: Partial<DocumentType>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []

        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.required !== undefined) { fields.push('required = ?'); values.push(updates.required) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }

        if (fields.length === 0) return

        values.push(id)
        await this.pool.execute(`UPDATE document_types SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteDocumentType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM document_types WHERE id = ?', [id])
    }

    // --- Fleets ---
    async getFleets(): Promise<Fleet[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name FROM fleets')
        return rows as Fleet[]
    }

    async addFleet(fleet: Omit<Fleet, 'id'>): Promise<Fleet> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO fleets (id, name) VALUES (?, ?)', [id, fleet.name])
        return { ...fleet, id }
    }

    async deleteFleet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM fleets WHERE id = ?', [id])
    }

    // --- Vessels ---
    async getVessels(): Promise<Vessel[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, imo_number as imoNumber, fleet_id as fleetId, ofac_checked_at as ofacCheckedAt, ofac_match_found as ofacMatchFound, ofac_status as ofacStatus FROM vessels')
        return (rows as any[]).map(r => ({ ...r, ofacMatchFound: Boolean(r.ofacMatchFound) }))
    }

    async addVessel(vessel: Omit<Vessel, 'id'>): Promise<Vessel> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO vessels (id, name, imo_number, fleet_id, ofac_checked_at, ofac_match_found, ofac_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, vessel.name, vessel.imoNumber, vessel.fleetId || null, vessel.ofacCheckedAt || null, vessel.ofacMatchFound || false, vessel.ofacStatus || 'PENDING']
        )
        return { ...vessel, id }
    }

    async updateVessel(id: string, updates: Partial<Vessel>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []

        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.imoNumber !== undefined) { fields.push('imo_number = ?'); values.push(updates.imoNumber) }
        if (updates.fleetId !== undefined) { fields.push('fleet_id = ?'); values.push(updates.fleetId || null) }
        if (updates.ofacCheckedAt !== undefined) { fields.push('ofac_checked_at = ?'); values.push(updates.ofacCheckedAt || null) }
        if (updates.ofacMatchFound !== undefined) { fields.push('ofac_match_found = ?'); values.push(updates.ofacMatchFound || false) }
        if (updates.ofacStatus !== undefined) { fields.push('ofac_status = ?'); values.push(updates.ofacStatus) }

        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE vessels SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteVessel(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessels WHERE id = ?', [id])
    }

    // --- Vessel Documents ---
    async getVesselDocuments(vesselId?: string): Promise<VesselDocument[]> {
        if (!this.pool) return []
        let sql = `
      SELECT id, vessel_id as vesselId, document_type_id as documentTypeId, 
      file_path as filePath, sent, required, expiry_date as expiryDate, 
      received_date as receivedDate, uploaded_date as uploadedDate, uploaded_by as uploadedBy
      FROM vessel_documents
    `
        const params: any[] = []
        if (vesselId) {
            sql += ' WHERE vessel_id = ?'
            params.push(vesselId)
        }

        const [rows] = await this.pool.query(sql, params)
        return (rows as any[]).map(r => ({
            ...r,
            sent: Boolean(r.sent),
            required: Boolean(r.required)
        }))
    }

    async upsertVesselDocument(doc: VesselDocument): Promise<void> {
        if (!this.pool) return

        // Security: Validate file extension
        if (doc.filePath) {
            const validation = await this.validateFileExtension(doc.filePath)
            if (!validation.valid) {
                throw new Error(`File validation failed: ${validation.reason}`)
            }
        }

        const [existing]: any[] = await this.pool.query(
            'SELECT id FROM vessel_documents WHERE vessel_id = ? AND document_type_id = ?',
            [doc.vesselId, doc.documentTypeId]
        )

        if (existing.length > 0) {
            await this.pool.execute(
                `UPDATE vessel_documents SET 
            file_path = ?, sent = ?, required = ?, expiry_date = ?, received_date = ?, 
            uploaded_date = ?, uploaded_by = ? 
            WHERE id = ?`,
                [doc.filePath, doc.sent, doc.required, doc.expiryDate || null, doc.receivedDate || null, doc.uploadedDate, doc.uploadedBy, existing[0].id]
            )
        } else {
            await this.pool.execute(
                `INSERT INTO vessel_documents 
            (id, vessel_id, document_type_id, file_path, sent, required, expiry_date, received_date, uploaded_date, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), doc.vesselId, doc.documentTypeId, doc.filePath, doc.sent, doc.required, doc.expiryDate || null, doc.receivedDate || null, doc.uploadedDate, doc.uploadedBy]
            )
        }
    }

    async updateVesselDocumentExpiry(vesselId: string, docTypeId: string, expiryDate: string): Promise<void> {
        if (!this.pool) return

        const [existing]: any[] = await this.pool.query(
            'SELECT id FROM vessel_documents WHERE vessel_id = ? AND document_type_id = ?',
            [vesselId, docTypeId]
        )

        if (existing.length > 0) {
            await this.pool.execute('UPDATE vessel_documents SET expiry_date = ? WHERE id = ?', [expiryDate, existing[0].id])
        } else {
            const [dt]: any[] = await this.pool.query('SELECT required FROM document_types WHERE id = ?', [docTypeId])
            const required = dt.length > 0 ? Boolean(dt[0].required) : false

            await this.pool.execute(
                `INSERT INTO vessel_documents 
                (id, vessel_id, document_type_id, file_path, sent, required, expiry_date, uploaded_date, uploaded_by)
                VALUES (?, ?, ?, ?, 0, ?, ?, NOW(), 'System')`,
                [uuidv4(), vesselId, docTypeId, '', required, expiryDate]
            )
        }
    }

    async updateVesselDocumentReceivedDate(vesselId: string, docTypeId: string, receivedDate: string): Promise<void> {
        if (!this.pool) return

        const [existing]: any[] = await this.pool.query(
            'SELECT id FROM vessel_documents WHERE vessel_id = ? AND document_type_id = ?',
            [vesselId, docTypeId]
        )

        if (existing.length > 0) {
            await this.pool.execute('UPDATE vessel_documents SET received_date = ? WHERE id = ?', [receivedDate, existing[0].id])
        } else {
            const [dt]: any[] = await this.pool.query('SELECT required FROM document_types WHERE id = ?', [docTypeId])
            const required = dt.length > 0 ? Boolean(dt[0].required) : false

            await this.pool.execute(
                `INSERT INTO vessel_documents 
                (id, vessel_id, document_type_id, file_path, sent, required, received_date, uploaded_date, uploaded_by)
                VALUES (?, ?, ?, ?, 0, ?, ?, NOW(), 'System')`,
                [uuidv4(), vesselId, docTypeId, '', required, receivedDate]
            )
        }
    }

    // --- Entities ---
    async getEntities(): Promise<Entity[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, type, identifier, email, phone, passport_file_path as passportFilePath, certificate_of_incorporation_path as certificateOfIncorporationPath, articles_of_association_path as articlesOfAssociationPath, kyc_file_path as kycFilePath, ofac_checked_at as ofacCheckedAt, ofac_match_found as ofacMatchFound, ofac_status as ofacStatus FROM entities')
        return (rows as any[]).map(r => ({ ...r, ofacMatchFound: Boolean(r.ofacMatchFound) }))
    }

    async addEntity(entity: Omit<Entity, 'id'>): Promise<Entity> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO entities (id, name, type, identifier, email, phone, passport_file_path, certificate_of_incorporation_path, articles_of_association_path, kyc_file_path, ofac_checked_at, ofac_match_found, ofac_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, entity.name, entity.type, entity.identifier || null, entity.email || null, entity.phone || null, entity.passportFilePath || null, entity.certificateOfIncorporationPath || null, entity.articlesOfAssociationPath || null, entity.kycFilePath || null, entity.ofacCheckedAt || null, entity.ofacMatchFound || false, entity.ofacStatus || 'PENDING']
        )
        return { ...entity, id }
    }

    async updateEntity(id: string, updates: Partial<Entity>): Promise<void> {
        if (!this.pool) return

        // Security: Validate file extensions for any file paths being updated
        if (updates.passportFilePath !== undefined && updates.passportFilePath) {
            const validation = await this.validateFileExtension(updates.passportFilePath)
            if (!validation.valid) {
                throw new Error(`File validation failed: ${validation.reason}`)
            }
        }
        if (updates.certificateOfIncorporationPath !== undefined && updates.certificateOfIncorporationPath) {
            const validation = await this.validateFileExtension(updates.certificateOfIncorporationPath)
            if (!validation.valid) {
                throw new Error(`File validation failed: ${validation.reason}`)
            }
        }
        if (updates.articlesOfAssociationPath !== undefined && updates.articlesOfAssociationPath) {
            const validation = await this.validateFileExtension(updates.articlesOfAssociationPath)
            if (!validation.valid) {
                throw new Error(`File validation failed: ${validation.reason}`)
            }
        }
        if (updates.kycFilePath !== undefined && updates.kycFilePath) {
            const validation = await this.validateFileExtension(updates.kycFilePath)
            if (!validation.valid) {
                throw new Error(`File validation failed: ${validation.reason}`)
            }
        }

        const fields: string[] = []
        const values: any[] = []

        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type) }
        if (updates.identifier !== undefined) { fields.push('identifier = ?'); values.push(updates.identifier) }
        if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email) }
        if (updates.phone !== undefined) { fields.push('phone = ?'); values.push(updates.phone) }
        if (updates.passportFilePath !== undefined) { fields.push('passport_file_path = ?'); values.push(updates.passportFilePath) }
        if (updates.certificateOfIncorporationPath !== undefined) { fields.push('certificate_of_incorporation_path = ?'); values.push(updates.certificateOfIncorporationPath) }
        if (updates.articlesOfAssociationPath !== undefined) { fields.push('articles_of_association_path = ?'); values.push(updates.articlesOfAssociationPath) }
        if (updates.kycFilePath !== undefined) { fields.push('kyc_file_path = ?'); values.push(updates.kycFilePath) }
        if (updates.ofacCheckedAt !== undefined) { fields.push('ofac_checked_at = ?'); values.push(updates.ofacCheckedAt || null) }
        if (updates.ofacMatchFound !== undefined) { fields.push('ofac_match_found = ?'); values.push(updates.ofacMatchFound || false) }
        if (updates.ofacStatus !== undefined) { fields.push('ofac_status = ?'); values.push(updates.ofacStatus) }

        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteEntity(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM entities WHERE id = ?', [id])
    }

    // --- Roles ---
    async getAssuredRoles(): Promise<AssuredRole[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name FROM assured_roles')
        return rows as AssuredRole[]
    }

    async addAssuredRole(role: Omit<AssuredRole, 'id'>): Promise<AssuredRole> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO assured_roles (id, name) VALUES (?, ?)', [id, role.name])
        return { ...role, id }
    }

    async updateAssuredRole(id: string, updates: Partial<AssuredRole>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []

        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }

        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE assured_roles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteAssuredRole(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM assured_roles WHERE id = ?', [id])
    }

    // --- Vessel Assureds ---
    async getVesselAssureds(vesselId?: string): Promise<VesselAssured[]> {
        if (!this.pool) return []
        let sql = 'SELECT id, vessel_id as vesselId, entity_id as entityId, role FROM vessel_assureds'
        const params: any[] = []
        if (vesselId) {
            sql += ' WHERE vessel_id = ?'
            params.push(vesselId)
        }
        const [rows] = await this.pool.query(sql, params)
        return rows as VesselAssured[]
    }

    async addVesselAssured(assured: Omit<VesselAssured, 'id'>): Promise<VesselAssured> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO vessel_assureds (id, vessel_id, entity_id, role) VALUES (?, ?, ?, ?)',
            [id, assured.vesselId, assured.entityId, assured.role]
        )
        return { ...assured, id }
    }

    async deleteVesselAssured(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_assureds WHERE id = ?', [id])
    }

    // --- Entity UBOs ---
    async getEntityUBOs(assuredEntityId?: string): Promise<EntityUBO[]> {
        if (!this.pool) return []
        let sql = 'SELECT assured_entity_id as assuredEntityId, ubo_entity_id as uboEntityId FROM entity_ubos'
        const params: any[] = []
        if (assuredEntityId) {
            sql += ' WHERE assured_entity_id = ?'
            params.push(assuredEntityId)
        }
        const [rows] = await this.pool.query(sql, params)
        return rows as EntityUBO[]
    }

    async addEntityUBO(ubo: EntityUBO): Promise<void> {
        if (!this.pool) return
        try {
            await this.pool.execute(
                'INSERT INTO entity_ubos (assured_entity_id, ubo_entity_id) VALUES (?, ?)',
                [ubo.assuredEntityId, ubo.uboEntityId]
            )
        } catch (e: any) {
            if (e.code !== 'ER_DUP_ENTRY') throw e
        }
    }

    async deleteEntityUBO(ubo: EntityUBO): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'DELETE FROM entity_ubos WHERE assured_entity_id = ? AND ubo_entity_id = ?',
            [ubo.assuredEntityId, ubo.uboEntityId]
        )
    }

    // --- Users ---
    async getUser(username: string): Promise<User | null> {
        if (!this.pool) return null
        const [rows]: any[] = await this.pool.query(
            'SELECT id, username, password_hash as passwordHash, role, theme_preference as themePreference, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, created_at as createdAt FROM users WHERE username = ?',
            [username]
        )
        return rows.length > 0 ? (rows[0] as User) : null
    }

    async addUser(user: User): Promise<void> {
        if (!this.pool) throw new Error('DB Not connected')
        await this.pool.execute(
            'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
            [user.id, user.username, user.passwordHash, user.role]
        )
    }

    async getUserCount(): Promise<number> {
        if (!this.pool) return 0
        const [rows]: any[] = await this.pool.query('SELECT COUNT(*) as count FROM users')
        return (rows[0] as any).count
    }

    async getUsers(): Promise<User[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, username, role, theme_preference as themePreference, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, created_at as createdAt FROM users ORDER BY username ASC'
        )
        // Return without passwordHash
        return rows as User[]
    }

    async deleteUser(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM users WHERE id = ?', [id])
    }

    async updateUserTheme(userId: string, theme: 'light' | 'dark'): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET theme_preference = ? WHERE id = ?',
            [theme, userId]
        )
    }

    async updateUserWindowPreferences(userId: string, width: number, height: number, x?: number, y?: number): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET window_width = ?, window_height = ?, window_x = ?, window_y = ? WHERE id = ?',
            [width, height, x !== undefined ? x : null, y !== undefined ? y : null, userId]
        )
    }

    // Settings Management
    async getSetting(key: string): Promise<string | null> {
        if (!this.pool) return null
        const [rows] = await this.pool.execute(
            'SELECT setting_value FROM app_settings WHERE setting_key = ?',
            [key]
        )
        const result = rows as any[]
        return result.length > 0 ? result[0].setting_value : null
    }

    async setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            `INSERT INTO app_settings (setting_key, setting_value, updated_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP`,
            [key, value, updatedBy || 'system', value, updatedBy || 'system']
        )
    }

    async getFileTypeSettings(): Promise<{ allowedExtensions: string[]; blockedExtensions: string[] }> {
        const defaultSettings = {
            allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.zip'],
            blockedExtensions: ['.exe', '.bat', '.sh', '.cmd', '.app', '.msi', '.dll', '.so', '.dylib', '.vbs', '.ps1']
        }

        const settingValue = await this.getSetting('fileTypeSettings')
        if (!settingValue) {
            // Initialize with defaults
            await this.setSetting('fileTypeSettings', JSON.stringify(defaultSettings))
            return defaultSettings
        }

        try {
            return JSON.parse(settingValue)
        } catch {
            // If parsing fails, return defaults
            return defaultSettings
        }
    }

    async setFileTypeSettings(settings: { allowedExtensions: string[]; blockedExtensions: string[] }, updatedBy?: string): Promise<void> {
        await this.setSetting('fileTypeSettings', JSON.stringify(settings), updatedBy)
    }

    // Security: Validate file extension against settings
    async validateFileExtension(filePath: string): Promise<{ valid: boolean; reason?: string }> {
        if (!filePath) return { valid: true } // Empty path is valid (optional files)

        const settings = await this.getFileTypeSettings()
        const ext = extname(filePath).toLowerCase()

        // Check if blocked
        if (settings.blockedExtensions.includes(ext)) {
            return {
                valid: false,
                reason: `File type '${ext}' is blocked by administrator`
            }
        }

        // Check if allowed (only if allowed list has items)
        if (settings.allowedExtensions.length > 0 && !settings.allowedExtensions.includes(ext)) {
            return {
                valid: false,
                reason: `File type '${ext}' is not in the allowed list`
            }
        }

        return { valid: true }
    }

    // --- Surveyors ---
    async getSurveyors(): Promise<Surveyor[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, company_name as companyName, country, contact_person as contactPerson,
             contact_details as contactDetails, notes, created_at as createdAt
             FROM surveyors ORDER BY company_name ASC`
        )
        return rows as Surveyor[]
    }

    async addSurveyor(surveyor: Omit<Surveyor, 'id'>): Promise<Surveyor> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO surveyors (id, company_name, country, contact_person, contact_details, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, surveyor.companyName, surveyor.country, surveyor.contactPerson || null,
             surveyor.contactDetails || null, surveyor.notes || null]
        )
        return { ...surveyor, id }
    }

    async updateSurveyor(id: string, updates: Partial<Surveyor>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.companyName !== undefined) { fields.push('company_name = ?'); values.push(updates.companyName) }
        if (updates.country !== undefined) { fields.push('country = ?'); values.push(updates.country) }
        if (updates.contactPerson !== undefined) { fields.push('contact_person = ?'); values.push(updates.contactPerson) }
        if (updates.contactDetails !== undefined) { fields.push('contact_details = ?'); values.push(updates.contactDetails) }
        if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE surveyors SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteSurveyor(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM surveyors WHERE id = ?', [id])
    }

    // --- Condition Surveys ---
    async getConditionSurveys(vesselId?: string): Promise<ConditionSurvey[]> {
        if (!this.pool) return []
        let sql = `SELECT id, vessel_id as vesselId, survey_date as surveyDate,
                   surveyor_id as surveyorId, survey_type as surveyType, location, notes,
                   created_at as createdAt, created_by as createdBy
                   FROM condition_surveys`
        const params: any[] = []
        if (vesselId) {
            sql += ' WHERE vessel_id = ? ORDER BY survey_date DESC'
            params.push(vesselId)
        } else {
            sql += ' ORDER BY survey_date DESC'
        }
        const [rows] = await this.pool.query(sql, params)
        return rows as ConditionSurvey[]
    }

    async addConditionSurvey(survey: Omit<ConditionSurvey, 'id'>): Promise<ConditionSurvey> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO condition_surveys
             (id, vessel_id, survey_date, surveyor_id, survey_type, location, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, survey.vesselId, survey.surveyDate, survey.surveyorId,
             survey.surveyType, survey.location || null,
             survey.notes || null, survey.createdBy || 'System']
        )
        return { ...survey, id }
    }

    async updateConditionSurvey(id: string, updates: Partial<ConditionSurvey>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.surveyDate !== undefined) { fields.push('survey_date = ?'); values.push(updates.surveyDate) }
        if (updates.surveyorId !== undefined) { fields.push('surveyor_id = ?'); values.push(updates.surveyorId) }
        if (updates.surveyType !== undefined) { fields.push('survey_type = ?'); values.push(updates.surveyType) }
        if (updates.location !== undefined) { fields.push('location = ?'); values.push(updates.location) }
        if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE condition_surveys SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteConditionSurvey(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM condition_surveys WHERE id = ?', [id])
    }

    // --- Survey Defects ---
    async getSurveyDefects(surveyId?: string): Promise<SurveyDefect[]> {
        if (!this.pool) return []
        let sql = `SELECT id, survey_id as surveyId, defect_number as defectNumber,
                   description, severity, status, due_date as dueDate,
                   closed_at as closedAt, closed_by as closedBy, closure_notes as closureNotes,
                   created_at as createdAt
                   FROM survey_defects`
        const params: any[] = []
        if (surveyId) {
            sql += ' WHERE survey_id = ? ORDER BY defect_number ASC'
            params.push(surveyId)
        }
        const [rows] = await this.pool.query(sql, params)
        return rows as SurveyDefect[]
    }

    async addSurveyDefect(defect: Omit<SurveyDefect, 'id'>): Promise<SurveyDefect> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO survey_defects
             (id, survey_id, defect_number, description, severity, status, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, defect.surveyId, defect.defectNumber, defect.description,
             defect.severity, defect.status || 'OPEN', defect.dueDate || null]
        )
        return { ...defect, id }
    }

    async updateSurveyDefect(id: string, updates: Partial<SurveyDefect>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.defectNumber !== undefined) { fields.push('defect_number = ?'); values.push(updates.defectNumber) }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.severity !== undefined) { fields.push('severity = ?'); values.push(updates.severity) }
        if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status) }
        if (updates.dueDate !== undefined) { fields.push('due_date = ?'); values.push(updates.dueDate) }
        if (updates.closedAt !== undefined) { fields.push('closed_at = ?'); values.push(updates.closedAt) }
        if (updates.closedBy !== undefined) { fields.push('closed_by = ?'); values.push(updates.closedBy) }
        if (updates.closureNotes !== undefined) { fields.push('closure_notes = ?'); values.push(updates.closureNotes) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE survey_defects SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteSurveyDefect(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM survey_defects WHERE id = ?', [id])
    }

    async closeDefect(id: string, closedBy: string, closureNotes?: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE survey_defects SET status = "CLOSED", closed_at = NOW(), closed_by = ?, closure_notes = ? WHERE id = ?',
            [closedBy, closureNotes || null, id]
        )
    }

    async reopenDefect(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE survey_defects SET status = "OPEN", closed_at = NULL, closed_by = NULL, closure_notes = NULL WHERE id = ?',
            [id]
        )
    }

    // --- Survey Attachments ---
    async getSurveyAttachments(surveyId?: string): Promise<SurveyAttachment[]> {
        if (!this.pool) return []
        let sql = `SELECT id, survey_id as surveyId, file_path as filePath,
                   file_name as fileName, file_type as fileType,
                   uploaded_at as uploadedAt, uploaded_by as uploadedBy
                   FROM survey_attachments`
        const params: any[] = []
        if (surveyId) {
            sql += ' WHERE survey_id = ? ORDER BY uploaded_at DESC'
            params.push(surveyId)
        }
        const [rows] = await this.pool.query(sql, params)
        return rows as SurveyAttachment[]
    }

    async addSurveyAttachment(attachment: Omit<SurveyAttachment, 'id'>): Promise<SurveyAttachment> {
        if (!this.pool) throw new Error('DB Not connected')
        if (attachment.filePath) {
            const validation = await this.validateFileExtension(attachment.filePath)
            if (!validation.valid) {
                throw new Error(`File validation failed: ${validation.reason}`)
            }
        }
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO survey_attachments
             (id, survey_id, file_path, file_name, file_type, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, attachment.surveyId, attachment.filePath, attachment.fileName,
             attachment.fileType || 'other', attachment.uploadedBy || 'System']
        )
        return { ...attachment, id }
    }

    async deleteSurveyAttachment(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM survey_attachments WHERE id = ?', [id])
    }

    // --- Reports ---
    async getOpenDefectsByVessel(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT
                v.id as vesselId, v.name as vesselName, v.imo_number as imoNumber,
                cs.id as surveyId, cs.survey_date as surveyDate, cs.surveyor_name as surveyorName,
                sd.id as defectId, sd.defect_number as defectNumber, sd.description,
                sd.severity, sd.due_date as dueDate, sd.created_at as createdAt
            FROM vessels v
            INNER JOIN condition_surveys cs ON cs.vessel_id = v.id
            INNER JOIN survey_defects sd ON sd.survey_id = cs.id
            WHERE sd.status = 'OPEN'
            ORDER BY v.name ASC, sd.severity DESC, sd.due_date ASC
        `)
        return rows as any[]
    }

    async getSurveyHistory(vesselId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT
                cs.id as surveyId, cs.survey_date as surveyDate,
                s.company_name as surveyorName, s.country as surveyorCompany,
                cs.survey_type as surveyType, cs.location,
                COUNT(CASE WHEN sd.status = 'OPEN' THEN 1 END) as openDefects,
                COUNT(CASE WHEN sd.status = 'CLOSED' THEN 1 END) as closedDefects,
                COUNT(sd.id) as totalDefects
            FROM condition_surveys cs
            LEFT JOIN surveyors s ON s.id = cs.surveyor_id
            LEFT JOIN survey_defects sd ON sd.survey_id = cs.id
            WHERE cs.vessel_id = ?
            GROUP BY cs.id
            ORDER BY cs.survey_date DESC
        `, [vesselId])
        return rows as any[]
    }
}

export const db = new MySQLAdapter()
