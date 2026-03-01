import { createPool, Pool } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import { readFileSync, existsSync } from 'fs'
import { extname } from 'path'
import { DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO, User, ConditionSurvey, SurveyDefect, SurveyAttachment, Surveyor, PaginatedResult, VesselQueryParams, EntityQueryParams, SurveyorQueryParams, ComplianceResultQueryParams, ReminderSettings, VesselReminder, AssuredDocAlert, VesselCustomDocType, PolicyType, VesselPolicy, DABQueryCriteria, PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIDeductible, PIDeductibleSet, PIDeductibleSetItem, PIExclusion, PISubLimitTemplate, PIAdditionalClause, TradingExcludedCountry, Quotation, PISanctionsVersion, InstalmentDefaults, ClassificationSociety, VesselClassification, VesselType, VesselAuditEntry, PolicyTypeCharacteristic, PolicyTypeCondition, VesselDynamicPolicy, VesselPolicyValue } from '../../shared/types'
import { formatDateForMySQL } from './utils'
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
        // If pool exists, verify it's still healthy
        if (this.pool) {
            try {
                const conn = await this.pool.getConnection()
                conn.release()
                return true
            } catch {
                console.warn('DB pool unhealthy, reconnecting...')
                await this.destroyPool()
            }
        }

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
                dateStrings: true,
                connectTimeout: 10000
            })

            const conn = await this.pool.getConnection()
            conn.release()
            return true
        } catch (error) {
            console.error('Failed to connect to MySQL:', error)
            this.pool = null
            return false
        }
    }

    private async destroyPool(): Promise<void> {
        if (this.pool) {
            try {
                await this.pool.end()
            } catch {
                // Ignore errors during cleanup
            }
            this.pool = null
        }
    }

    getSanctionsApiKey(): string | null {
        if (!this.configPath || !existsSync(this.configPath)) return null
        try {
            const config = JSON.parse(readFileSync(this.configPath, 'utf-8'))
            return config.sanctionsApiKey || null
        } catch {
            return null
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
            const [arCols] = await this.pool.query('SHOW COLUMNS FROM document_types LIKE "annual_renewal"')
            if ((arCols as any[]).length === 0) {
                await this.pool.query('ALTER TABLE document_types ADD COLUMN annual_renewal BOOLEAN DEFAULT FALSE AFTER required')
            }

            // Migration: Add reference to condition_surveys if it doesn't exist
            try {
                // Check if table exists first
                const [surveyTable] = await this.pool.query("SHOW TABLES LIKE 'condition_surveys'")
                if ((surveyTable as any[]).length > 0) {
                    const [refCol] = await this.pool.query('SHOW COLUMNS FROM condition_surveys LIKE "reference"')
                    if ((refCol as any[]).length === 0) {
                        console.log('Migrating: Adding reference column to condition_surveys')
                        await this.pool.query('ALTER TABLE condition_surveys ADD COLUMN reference VARCHAR(255) AFTER survey_type')
                    }
                }
            } catch (e) {
                console.error('Migration error (reference col):', e)
            }

            // Ensure condition_survey_types table exists
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS condition_survey_types (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `)
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
            if (!vesselColNames.includes('is_active')) {
                await this.pool.query("ALTER TABLE vessels ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER ofac_status")
            }

            // Migration: Add theme_preference to users if it doesn't exist
            const [userCols] = await this.pool.query('SHOW COLUMNS FROM users')
            const userColNames = (userCols as any[]).map(c => c.Field)
            if (!userColNames.includes('theme_preference')) {
                await this.pool.query("ALTER TABLE users ADD COLUMN theme_preference VARCHAR(10) DEFAULT 'dark' AFTER role")
            }

            // Migration: Add window preferences to users (handled in schema.sql for new installs)

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
                    INDEX idx_vessel_date (vessel_id, survey_date)
                )`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS survey_defects (
                    id VARCHAR(36) PRIMARY KEY,
                    survey_id VARCHAR(36) NOT NULL,
                    defect_number VARCHAR(50) NOT NULL,
                    description TEXT NOT NULL,
                    severity VARCHAR(20),
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

            // Migration: Add notes column to survey_defects
            const [defectCols] = await this.pool.query("SHOW COLUMNS FROM survey_defects LIKE 'notes'")
            if ((defectCols as any[]).length === 0) {
                await this.pool.query("ALTER TABLE survey_defects ADD COLUMN notes TEXT AFTER due_date")
            }

            // Migration: Make severity nullable in survey_defects
            const [sevCols] = await this.pool.query("SHOW COLUMNS FROM survey_defects WHERE Field = 'severity'") as any[]
            if (sevCols.length > 0 && sevCols[0].Null === 'NO') {
                await this.pool.query("ALTER TABLE survey_defects MODIFY COLUMN severity VARCHAR(20) NULL")
            }

            // Create vessel_custom_doc_types table
            await this.pool.query(`CREATE TABLE IF NOT EXISTS vessel_custom_doc_types (
                id VARCHAR(36) PRIMARY KEY,
                vessel_id VARCHAR(36) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE,
                INDEX idx_vessel_custom_docs (vessel_id)
            )`)

            // Create compliance check logs table
            await this.pool.query(`CREATE TABLE IF NOT EXISTS compliance_check_logs (
                id VARCHAR(36) PRIMARY KEY,
                run_at TIMESTAMP NOT NULL,
                total_checked INT NOT NULL DEFAULT 0,
                matches_found INT NOT NULL DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_run_at (run_at)
            )`)

            // Create compliance check results table
            await this.pool.query(`CREATE TABLE IF NOT EXISTS compliance_check_results (
                id VARCHAR(36) PRIMARY KEY,
                log_id VARCHAR(36) NOT NULL,
                entity_type VARCHAR(20) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                entity_name VARCHAR(255) NOT NULL,
                match_score DECIMAL(5,2) NOT NULL,
                match_details TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
                decision VARCHAR(20),
                reviewed_by VARCHAR(255),
                reviewed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (log_id) REFERENCES compliance_check_logs(id) ON DELETE CASCADE,
                INDEX idx_log_id (log_id),
                INDEX idx_status (status),
                INDEX idx_entity (entity_type, entity_id)
            )`)

            // Add decision column if it doesn't exist
            const [resultCols]: any[] = await this.pool.query('SHOW COLUMNS FROM compliance_check_results')
            const resultColNames = resultCols.map((c: any) => c.Field)
            if (!resultColNames.includes('decision')) {
                await this.pool.query("ALTER TABLE compliance_check_results ADD COLUMN decision VARCHAR(20) AFTER status")
            }

            // Create vessel reminder snoozes table
            await this.pool.query(`CREATE TABLE IF NOT EXISTS vessel_reminder_snoozes (
                vessel_id VARCHAR(36) NOT NULL,
                snoozed_at DATETIME NOT NULL,
                snoozed_by VARCHAR(100) NOT NULL,
                snooze_until DATETIME NOT NULL,
                PRIMARY KEY (vessel_id),
                FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE
            )`)

            // Add performance indexes (idempotent)
            const addIndexIfNotExists = async (table: string, indexName: string, columns: string): Promise<void> => {
                const [rows]: any[] = await this.pool!.query(
                    `SELECT COUNT(1) as cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
                    [table, indexName]
                )
                if (rows[0].cnt === 0) {
                    await this.pool!.query(`CREATE INDEX \`${indexName}\` ON \`${table}\` (${columns})`)
                }
            }

            // Migration: Add customer_id and customer_type to vessels
            if (!vesselColNames.includes('customer_id')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN customer_id VARCHAR(36) NULL AFTER is_active')
            }
            if (!vesselColNames.includes('customer_type')) {
                await this.pool.query("ALTER TABLE vessels ADD COLUMN customer_type VARCHAR(10) NULL AFTER customer_id")
            }
            if (!vesselColNames.includes('policy_expiry_date')) {
                await this.pool.query("ALTER TABLE vessels ADD COLUMN policy_expiry_date DATE NULL AFTER customer_type")
            }
            // Migration: Change policy_expiry_date from DATE to VARCHAR to support datetime
            if (vesselColNames.includes('policy_expiry_date')) {
                const [peColType] = await this.pool.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vessels' AND COLUMN_NAME = 'policy_expiry_date'") as any[]
                if (peColType.length > 0 && peColType[0].COLUMN_TYPE === 'date') {
                    await this.pool.query("ALTER TABLE vessels MODIFY COLUMN policy_expiry_date VARCHAR(30) NULL")
                }
            }

            if (!vesselColNames.includes('notes')) {
                await this.pool.query("ALTER TABLE vessels ADD COLUMN notes TEXT NULL")
            }

            await addIndexIfNotExists('vessels', 'idx_vessels_imo', 'imo_number')
            // Migration: Add vessel_name_history table
            const [nameHistoryTable] = await this.pool.query("SHOW TABLES LIKE 'vessel_name_history'")
            if ((nameHistoryTable as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE vessel_name_history (
                    id VARCHAR(36) PRIMARY KEY,
                    vessel_id VARCHAR(36) NOT NULL,
                    previous_name VARCHAR(255) NOT NULL,
                    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    changed_by VARCHAR(255),
                    FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE CASCADE,
                    INDEX idx_vnh_vessel (vessel_id),
                    INDEX idx_vnh_name (previous_name)
                )`)
            }

            // Migration: Add order_index to assured_roles
            const [arOrderCols] = await this.pool.query("SHOW COLUMNS FROM assured_roles")
            const arColNames = (arOrderCols as any[]).map(c => c.Field)
            if (!arColNames.includes('order_index')) {
                await this.pool.query("ALTER TABLE assured_roles ADD COLUMN order_index INT DEFAULT 0")
            }

            // Migration: Remove duplicate assured_roles (keep first by id, delete rest)
            try {
                await this.pool.query(`
                    DELETE ar1 FROM assured_roles ar1
                    INNER JOIN assured_roles ar2
                    ON LOWER(ar1.name) = LOWER(ar2.name) AND ar1.id > ar2.id
                `)
            } catch { /* ignore if no duplicates */ }

            // Migration: Add flag_state_id to vessels
            const [vFlagCols] = await this.pool.query("SHOW COLUMNS FROM vessels LIKE 'flag_state_id'")
            if ((vFlagCols as any[]).length === 0) {
                await this.pool.query("ALTER TABLE vessels ADD COLUMN flag_state_id VARCHAR(36) NULL")
            }

            // Migration: Add vessel detail fields
            if (!vesselColNames.includes('built_year')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN built_year INT NULL')
            }
            if (!vesselColNames.includes('gross_tonnage')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN gross_tonnage DECIMAL(12,2) NULL')
            }
            if (!vesselColNames.includes('vessel_type')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN vessel_type VARCHAR(100) NULL')
            }
            if (!vesselColNames.includes('classification_society')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN classification_society VARCHAR(100) NULL')
            }
            if (!vesselColNames.includes('call_sign')) {
                await this.pool.query('ALTER TABLE vessels ADD COLUMN call_sign VARCHAR(50) NULL')
            }

            await addIndexIfNotExists('vessels', 'idx_vessels_fleet', 'fleet_id')
            await addIndexIfNotExists('vessels', 'idx_vessels_active', 'is_active')
            await addIndexIfNotExists('vessels', 'idx_vessels_customer', 'customer_id')
            await addIndexIfNotExists('vessel_documents', 'idx_vdocs_vessel_doctype', 'vessel_id, document_type_id')
            await addIndexIfNotExists('vessel_assureds', 'idx_vassureds_vessel', 'vessel_id')
            await addIndexIfNotExists('vessel_assureds', 'idx_vassureds_entity', 'entity_id')
            await addIndexIfNotExists('entities', 'idx_entities_name', 'name')
            await addIndexIfNotExists('entities', 'idx_entities_type', 'type')

            // Migration: Add section_texts_override and sanctions_text_override to quotations
            const [qStoCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'section_texts_override'")
            if ((qStoCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN section_texts_override TEXT NULL')
            }
            const [qSanOvCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'sanctions_text_override'")
            if ((qSanOvCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN sanctions_text_override TEXT NULL')
            }
            // Widen sanctions_clause_version for custom version keys
            await this.pool.query('ALTER TABLE quotations MODIFY COLUMN sanctions_clause_version VARCHAR(50) DEFAULT \'standard\'').catch(() => {})

            // Migration: Add non_refundable fields to quotation_instalments
            const [qiNrCol] = await this.pool.query("SHOW COLUMNS FROM quotation_instalments LIKE 'non_refundable'")
            if ((qiNrCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotation_instalments ADD COLUMN non_refundable BOOLEAN DEFAULT FALSE')
                await this.pool.query('ALTER TABLE quotation_instalments ADD COLUMN non_refundable_percent DECIMAL(5,2) NULL')
            }

            // Migration: Add default_selected column to pi_warranties
            const [wDefSelCol] = await this.pool.query("SHOW COLUMNS FROM pi_warranties LIKE 'default_selected'")
            if ((wDefSelCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE pi_warranties ADD COLUMN default_selected BOOLEAN DEFAULT FALSE')
            }

            // Migration: Add discount_percent and discount_label to quotations
            const [qDiscCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'discount_percent'")
            if ((qDiscCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN discount_percent DECIMAL(5,2) NULL')
                await this.pool.query('ALTER TABLE quotations ADD COLUMN discount_label VARCHAR(100) NULL')
            }

            // Migration: Add description_override to quotation_clauses for per-quotation clause desc edits
            const [qcDescCol] = await this.pool.query("SHOW COLUMNS FROM quotation_clauses LIKE 'description_override'")
            if ((qcDescCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotation_clauses ADD COLUMN description_override TEXT NULL')
            }

            // Migration: Add trading section toggle columns to quotations
            const [tradDdqCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'trading_show_ddq_list'")
            if ((tradDdqCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN trading_show_ddq_list BOOLEAN DEFAULT TRUE')
                await this.pool.query('ALTER TABLE quotations ADD COLUMN trading_show_ddq_warranties BOOLEAN DEFAULT TRUE')
                await this.pool.query('ALTER TABLE quotations ADD COLUMN trading_show_israel BOOLEAN DEFAULT TRUE')
                await this.pool.query('ALTER TABLE quotations ADD COLUMN trading_custom_text TEXT NULL')
            }
            // Vessel insurance policies (imported from Excel)
            // --- Migrate legacy vessel_insurance_policies → vessel_dynamic_policies ---
            try {
                const [legacyRows] = await this.pool.query(
                    'SELECT COUNT(*) as cnt FROM vessel_insurance_policies'
                )
                const legacyCount = (legacyRows as any[])[0]?.cnt || 0
                if (legacyCount > 0) {
                    // Check if we already migrated (if dynamic policies exist, skip)
                    const [dynCount] = await this.pool.query('SELECT COUNT(*) as cnt FROM vessel_dynamic_policies')
                    if ((dynCount as any[])[0]?.cnt === 0) {
                        console.log(`Migrating ${legacyCount} legacy insurance policies to dynamic system...`)

                        // Ensure Hull, P&I, War policy types exist
                        const categoryNameMap: Record<string, string> = { hull: 'Hull', pi: 'P&I', war: 'War' }
                        const ptIds: Record<string, string> = {}
                        for (const [cat, name] of Object.entries(categoryNameMap)) {
                            const [existing] = await this.pool.query('SELECT id FROM policy_types WHERE name = ?', [name])
                            if ((existing as any[]).length > 0) {
                                ptIds[cat] = (existing as any[])[0].id
                            } else {
                                const ptId = uuidv4()
                                await this.pool.execute('INSERT INTO policy_types (id, name, order_index) VALUES (?, ?, ?)', [ptId, name, Object.keys(ptIds).length])
                                ptIds[cat] = ptId
                            }
                        }

                        // Define characteristic fields per category
                        const hullFields = [
                            { name: 'Coverage Code', type: 'text' }, { name: 'Inception Date', type: 'date' }, { name: 'End Date', type: 'date' },
                            { name: 'H&M Value', type: 'amount' }, { name: 'IV Value', type: 'amount' },
                            { name: 'H&M Premium', type: 'amount' }, { name: 'IV Premium', type: 'amount' },
                            { name: 'Deductible', type: 'amount' }, { name: 'AMD', type: 'amount' }, { name: 'General Average', type: 'amount' },
                            { name: 'UPCC', type: 'text' }, { name: 'NCB', type: 'text' }, { name: 'Our Share', type: 'text' }
                        ]
                        const piFields = [
                            { name: 'Coverage Code', type: 'text' }, { name: 'Inception Date', type: 'date' }, { name: 'End Date', type: 'date' },
                            { name: 'Limit of Liability', type: 'amount' }, { name: 'Premium', type: 'amount' },
                            { name: 'UPCC', type: 'text' }, { name: 'NCB', type: 'text' }, { name: 'Our Share', type: 'text' }
                        ]
                        const warFields = [
                            { name: 'War Rate', type: 'text' }, { name: 'Premium', type: 'amount' },
                            { name: 'Our Share', type: 'text' }
                        ]
                        const catFields: Record<string, { name: string; type: string }[]> = { hull: hullFields, pi: piFields, war: warFields }

                        // Create characteristics and build id maps
                        const charIdMaps: Record<string, Map<string, string>> = {}
                        for (const [cat, fields] of Object.entries(catFields)) {
                            const ptId = ptIds[cat]
                            const charMap = new Map<string, string>()
                            const [existingChars] = await this.pool.query('SELECT id, name FROM policy_type_characteristics WHERE policy_type_id = ?', [ptId])
                            for (const c of existingChars as any[]) {
                                charMap.set(c.name.toLowerCase(), c.id)
                            }
                            for (let i = 0; i < fields.length; i++) {
                                const f = fields[i]
                                if (!charMap.has(f.name.toLowerCase())) {
                                    const cId = uuidv4()
                                    await this.pool.execute(
                                        'INSERT INTO policy_type_characteristics (id, policy_type_id, name, field_type, is_required, order_index) VALUES (?, ?, ?, ?, ?, ?)',
                                        [cId, ptId, f.name, f.type, false, (existingChars as any[]).length + i]
                                    )
                                    charMap.set(f.name.toLowerCase(), cId)
                                }
                            }
                            charIdMaps[cat] = charMap
                        }

                        // Field mapping from legacy columns to characteristic names
                        const legacyFieldMap: Record<string, { col: string; char: string; type: string }[]> = {
                            hull: [
                                { col: 'coverageCode', char: 'Coverage Code', type: 'text' },
                                { col: 'inceptionDate', char: 'Inception Date', type: 'date' },
                                { col: 'endDate', char: 'End Date', type: 'date' },
                                { col: 'hmValue', char: 'H&M Value', type: 'amount' },
                                { col: 'ivValue', char: 'IV Value', type: 'amount' },
                                { col: 'hmPremium', char: 'H&M Premium', type: 'amount' },
                                { col: 'ivPremium', char: 'IV Premium', type: 'amount' },
                                { col: 'deductible', char: 'Deductible', type: 'amount' },
                                { col: 'amd', char: 'AMD', type: 'amount' },
                                { col: 'generalAverage', char: 'General Average', type: 'amount' },
                                { col: 'upcc', char: 'UPCC', type: 'text' },
                                { col: 'ncb', char: 'NCB', type: 'text' },
                                { col: 'ourShare', char: 'Our Share', type: 'text' }
                            ],
                            pi: [
                                { col: 'coverageCode', char: 'Coverage Code', type: 'text' },
                                { col: 'inceptionDate', char: 'Inception Date', type: 'date' },
                                { col: 'endDate', char: 'End Date', type: 'date' },
                                { col: 'limitOfLiability', char: 'Limit of Liability', type: 'amount' },
                                { col: 'premium', char: 'Premium', type: 'amount' },
                                { col: 'upcc', char: 'UPCC', type: 'text' },
                                { col: 'ncb', char: 'NCB', type: 'text' },
                                { col: 'ourShare', char: 'Our Share', type: 'text' }
                            ],
                            war: [
                                { col: 'warRate', char: 'War Rate', type: 'text' },
                                { col: 'premium', char: 'Premium', type: 'amount' },
                                { col: 'ourShare', char: 'Our Share', type: 'text' }
                            ]
                        }

                        // Migrate each legacy policy
                        const [allLegacy] = await this.pool.query(
                            `SELECT id, vessel_id, policy_category, policy_number, coverage_code,
                             inception_date, end_date, currency,
                             hm_value, iv_value, hm_premium, iv_premium, deductible, amd, general_average,
                             limit_of_liability, premium, war_rate, upcc, ncb, our_share, notes, broker
                             FROM vessel_insurance_policies`
                        )

                        // Build entity name→id map for broker matching
                        const [entityRows] = await this.pool.query('SELECT id, name FROM entities')
                        const entityNameMap = new Map<string, string>()
                        for (const e of entityRows as any[]) {
                            entityNameMap.set(e.name.toLowerCase(), e.id)
                        }

                        for (const row of allLegacy as any[]) {
                            const cat = row.policy_category as string
                            const ptId = ptIds[cat]
                            if (!ptId) continue

                            const brokerId = row.broker ? entityNameMap.get(row.broker.toLowerCase()) : undefined
                            const dynId = uuidv4()
                            await this.pool.execute(
                                `INSERT INTO vessel_dynamic_policies (id, vessel_id, policy_type_id, policy_number, status, currency, broker_entity_id, notes)
                                 VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
                                [dynId, row.vessel_id, ptId, row.policy_number || null, row.currency || 'USD', brokerId || null, row.notes || null]
                            )

                            // Map legacy columns to dynamic values
                            const colMap: Record<string, any> = {
                                coverageCode: row.coverage_code,
                                inceptionDate: row.inception_date,
                                endDate: row.end_date,
                                hmValue: row.hm_value ? Number(row.hm_value) : null,
                                ivValue: row.iv_value ? Number(row.iv_value) : null,
                                hmPremium: row.hm_premium ? Number(row.hm_premium) : null,
                                ivPremium: row.iv_premium ? Number(row.iv_premium) : null,
                                deductible: row.deductible ? Number(row.deductible) : null,
                                amd: row.amd ? Number(row.amd) : null,
                                generalAverage: row.general_average ? Number(row.general_average) : null,
                                limitOfLiability: row.limit_of_liability ? Number(row.limit_of_liability) : null,
                                premium: row.premium ? Number(row.premium) : null,
                                warRate: row.war_rate,
                                upcc: row.upcc,
                                ncb: row.ncb,
                                ourShare: row.our_share
                            }

                            const charMap = charIdMaps[cat]
                            const fieldDefs = legacyFieldMap[cat] || []
                            for (const f of fieldDefs) {
                                const val = colMap[f.col]
                                if (val == null || val === '' || val === '-') continue
                                const charId = charMap.get(f.char.toLowerCase())
                                if (!charId) continue
                                const vId = uuidv4()
                                if (f.type === 'amount') {
                                    await this.pool.execute(
                                        'INSERT INTO vessel_policy_values (id, policy_id, characteristic_id, value_amount) VALUES (?, ?, ?, ?)',
                                        [vId, dynId, charId, val]
                                    )
                                } else if (f.type === 'date') {
                                    await this.pool.execute(
                                        'INSERT INTO vessel_policy_values (id, policy_id, characteristic_id, value_date) VALUES (?, ?, ?, ?)',
                                        [vId, dynId, charId, String(val)]
                                    )
                                } else {
                                    await this.pool.execute(
                                        'INSERT INTO vessel_policy_values (id, policy_id, characteristic_id, value_text) VALUES (?, ?, ?, ?)',
                                        [vId, dynId, charId, String(val)]
                                    )
                                }
                            }
                        }

                        console.log(`Migration complete: ${legacyCount} legacy policies migrated to dynamic system`)
                    }
                }
            } catch (migErr) {
                console.warn('Legacy policy migration skipped (table may not exist):', migErr)
            }

            // Normalize all date values to ISO format (YYYY-MM-DD) for proper MySQL comparison
            try {
                const [dateVals] = await this.pool.query(
                    `SELECT vpv.id, vpv.value_date
                     FROM vessel_policy_values vpv
                     JOIN policy_type_characteristics ptc ON ptc.id = vpv.characteristic_id
                     WHERE ptc.field_type = 'date'
                       AND vpv.value_date IS NOT NULL
                       AND vpv.value_date NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
                )
                const dateRows = dateVals as any[]
                let fixedCount = 0
                for (const row of dateRows) {
                    const val = row.value_date
                    let formatted: string | null = null

                    // Check if it's a pure number (Excel serial)
                    const num = parseFloat(val)
                    if (!isNaN(num) && String(num) === val.trim()) {
                        let serial = Math.floor(num)
                        if (serial > 60) serial--
                        const epoch = new Date(1899, 11, 30)
                        const date = new Date(epoch.getTime() + serial * 86400000)
                        if (!isNaN(date.getTime())) {
                            formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                        }
                    }

                    // Otherwise try parsing as a date string (DD-Mon-YY, etc.)
                    if (!formatted) {
                        const parsed = new Date(val)
                        if (!isNaN(parsed.getTime())) {
                            formatted = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
                        }
                    }

                    if (formatted) {
                        await this.pool.execute(
                            'UPDATE vessel_policy_values SET value_date = ? WHERE id = ?',
                            [formatted, row.id]
                        )
                        fixedCount++
                    }
                }
                if (fixedCount > 0) {
                    console.log(`Normalized ${fixedCount} date values to ISO format`)
                }
            } catch (dateFixErr) {
                console.warn('Date normalization migration skipped:', dateFixErr)
            }

            // Migration: Add renewal_status_types table
            const [rstTable] = await this.pool.query("SHOW TABLES LIKE 'renewal_status_types'")
            if ((rstTable as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE renewal_status_types (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
                    order_index INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`)
            }

            // Migration: Add renewal_status_id to vessel_dynamic_policies
            const [vdpCols] = await this.pool.query("SHOW COLUMNS FROM vessel_dynamic_policies LIKE 'renewal_status_id'")
            if ((vdpCols as any[]).length === 0) {
                await this.pool.query("ALTER TABLE vessel_dynamic_policies ADD COLUMN renewal_status_id VARCHAR(36) NULL")
            }

            // Migration: Add policy_renewal_notes table
            const [prnTable] = await this.pool.query("SHOW TABLES LIKE 'policy_renewal_notes'")
            if ((prnTable as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE policy_renewal_notes (
                    id VARCHAR(36) PRIMARY KEY,
                    policy_id VARCHAR(36) NOT NULL,
                    policy_number VARCHAR(255) NOT NULL DEFAULT '',
                    note TEXT NOT NULL,
                    created_by_user_id VARCHAR(36),
                    created_by_username VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_prn_policy (policy_id, policy_number(100))
                )`)
            }

            // Migration: Add sidebar state columns to users
            const [userSidebarCols] = await this.pool.query("SHOW COLUMNS FROM users LIKE 'sidebar_collapsed'")
            if ((userSidebarCols as any[]).length === 0) {
                await this.pool.query('ALTER TABLE users ADD COLUMN sidebar_collapsed TINYINT(1) DEFAULT 0')
                await this.pool.query("ALTER TABLE users ADD COLUMN collapsed_groups TEXT DEFAULT NULL")
            }

            // Migration: Add last_login_at to users
            const [userLoginCols] = await this.pool.query("SHOW COLUMNS FROM users LIKE 'last_login_at'")
            if ((userLoginCols as any[]).length === 0) {
                await this.pool.query('ALTER TABLE users ADD COLUMN last_login_at DATETIME DEFAULT NULL')
            }

            // Migration: Drop FK on document_type_id in vessel_documents (allows custom doc type IDs)
            try {
                const [ctRows]: any[] = await this.pool.query('SHOW CREATE TABLE vessel_documents')
                const createSql: string = (ctRows[0] && (ctRows[0]['Create Table'] || ctRows[0].create_table)) || ''
                const fkMatch = createSql.match(/CONSTRAINT `([^`]+)` FOREIGN KEY \(`document_type_id`\)/)
                if (fkMatch) {
                    await this.pool.execute(`ALTER TABLE vessel_documents DROP FOREIGN KEY \`${fkMatch[1]}\``)
                }
            } catch (fkErr) {
                console.warn('FK migration skipped (non-fatal):', fkErr)
            }

            // Migration: Add vessel_notes table
            const [vnTable] = await this.pool.query("SHOW TABLES LIKE 'vessel_notes'")
            if ((vnTable as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE vessel_notes (
                    id VARCHAR(36) PRIMARY KEY,
                    vessel_id VARCHAR(36) NOT NULL,
                    note TEXT NOT NULL,
                    created_by_user_id VARCHAR(36),
                    created_by_username VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_vn_vessel (vessel_id)
                )`)
            }

            // Migration: Add quotation_sent_date to vessel_dynamic_policies
            const [qsdCols] = await this.pool.query("SHOW COLUMNS FROM vessel_dynamic_policies LIKE 'quotation_sent_date'")
            if ((qsdCols as any[]).length === 0) {
                await this.pool.query("ALTER TABLE vessel_dynamic_policies ADD COLUMN quotation_sent_date DATE NULL")
            }

            // Migration: Add description to vessel_types
            const [vtDescCols] = await this.pool.query("SHOW COLUMNS FROM vessel_types LIKE 'description'")
            if ((vtDescCols as any[]).length === 0) {
                await this.pool.query("ALTER TABLE vessel_types ADD COLUMN description TEXT NULL AFTER name")
            }

            // Migration: Add completion + endorsement fields to condition_surveys
            const [csCompletedCols] = await this.pool.query("SHOW COLUMNS FROM condition_surveys LIKE 'completed_at'")
            if ((csCompletedCols as any[]).length === 0) {
                await this.pool.query("ALTER TABLE condition_surveys ADD COLUMN completed_at DATETIME NULL, ADD COLUMN completed_by VARCHAR(36) NULL, ADD COLUMN endorsement_issued TINYINT(1) NULL, ADD COLUMN endorsement_reminder_date DATE NULL")
            }

            // Migration: Create survey_warranties table
            const [swTables] = await this.pool.query("SHOW TABLES LIKE 'survey_warranties'")
            if ((swTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE survey_warranties (
                    id VARCHAR(36) PRIMARY KEY,
                    vessel_id VARCHAR(36) NOT NULL,
                    policy_id VARCHAR(36) NULL,
                    description VARCHAR(500) NOT NULL,
                    deadline_type ENUM('days','event') NOT NULL DEFAULT 'days',
                    deadline_days INT NULL,
                    deadline_event VARCHAR(500) NULL,
                    inception_date DATE NOT NULL,
                    notes TEXT NULL,
                    status ENUM('pending','survey_done','completed','waived') NOT NULL DEFAULT 'pending',
                    waiver_reason TEXT NULL,
                    completed_at DATETIME NULL,
                    completion_notes TEXT NULL,
                    condition_survey_id VARCHAR(36) NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_sw_vessel (vessel_id),
                    INDEX idx_sw_policy (policy_id),
                    INDEX idx_sw_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            } else {
                await this.pool.query(`ALTER TABLE survey_warranties CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
            }

            // Migration: Create survey_warranty_reminders table
            const [swrTables] = await this.pool.query("SHOW TABLES LIKE 'survey_warranty_reminders'")
            if ((swrTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE survey_warranty_reminders (
                    id VARCHAR(36) PRIMARY KEY,
                    warranty_id VARCHAR(36) NOT NULL,
                    sent_at DATE NOT NULL,
                    channel ENUM('email','phone','other') NOT NULL DEFAULT 'email',
                    reference VARCHAR(255) NULL,
                    notes TEXT NULL,
                    next_reminder_date DATE NULL,
                    logged_by VARCHAR(36) NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_swr_warranty (warranty_id),
                    INDEX idx_swr_next (next_reminder_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            } else {
                await this.pool.query(`ALTER TABLE survey_warranty_reminders CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
                // Migration: add reference column if missing
                const [swrCols] = await this.pool.query("SHOW COLUMNS FROM survey_warranty_reminders LIKE 'reference'")
                if ((swrCols as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranty_reminders ADD COLUMN reference VARCHAR(255) NULL AFTER channel`)
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
        const [rows] = await this.pool.query('SELECT id, name, description, required, annual_renewal as annualRenewal, order_index as `order` FROM document_types ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, required: Boolean(r.required), annualRenewal: Boolean(r.annualRenewal) }))
    }

    async addDocumentType(docType: Omit<DocumentType, 'id'>): Promise<DocumentType> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO document_types (id, name, description, required, annual_renewal, order_index) VALUES (?, ?, ?, ?, ?, ?)',
            [id, docType.name, docType.description || null, docType.required, docType.annualRenewal || false, docType.order]
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
        if (updates.annualRenewal !== undefined) { fields.push('annual_renewal = ?'); values.push(updates.annualRenewal) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }

        if (fields.length === 0) return

        values.push(id)
        await this.pool.execute(`UPDATE document_types SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteDocumentType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM document_types WHERE id = ?', [id])
    }

    // --- Vessel Custom Doc Types ---
    async getVesselCustomDocTypes(vesselId: string): Promise<VesselCustomDocType[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, vessel_id as vesselId, name, description, order_index as `order` FROM vessel_custom_doc_types WHERE vessel_id = ? ORDER BY order_index ASC',
            [vesselId]
        )
        return rows as VesselCustomDocType[]
    }

    async addVesselCustomDocType(docType: Omit<VesselCustomDocType, 'id'>): Promise<VesselCustomDocType> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO vessel_custom_doc_types (id, vessel_id, name, description, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, docType.vesselId, docType.name, docType.description || null, docType.order]
        )
        return { ...docType, id }
    }

    async deleteVesselCustomDocType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_custom_doc_types WHERE id = ?', [id])
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
        const [rows] = await this.pool.query('SELECT id, name, imo_number as imoNumber, fleet_id as fleetId, ofac_checked_at as ofacCheckedAt, ofac_match_found as ofacMatchFound, ofac_status as ofacStatus, is_active as isActive, customer_id as customerId, customer_type as customerType, policy_expiry_date as policyExpiryDate, notes, flag_state_id as flagStateId, built_year as builtYear, gross_tonnage as grossTonnage, vessel_type as vesselType, classification_society as classificationSociety, call_sign as callSign FROM vessels')
        return (rows as any[]).map(r => ({ ...r, ofacMatchFound: Boolean(r.ofacMatchFound), isActive: Boolean(r.isActive), builtYear: r.builtYear ? Number(r.builtYear) : undefined, grossTonnage: r.grossTonnage ? Number(r.grossTonnage) : undefined }))
    }

    async getVesselsPaginated(params: VesselQueryParams): Promise<PaginatedResult<Vessel>> {
        if (!this.pool) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }

        const { page = 1, limit = 10, search, fleetId, customerId, status, sortField = 'name', sortOrder = 'asc' } = params
        const offset = (page - 1) * limit

        let query = 'SELECT id, name, imo_number as imoNumber, fleet_id as fleetId, ofac_checked_at as ofacCheckedAt, ofac_match_found as ofacMatchFound, ofac_status as ofacStatus, is_active as isActive, customer_id as customerId, customer_type as customerType, policy_expiry_date as policyExpiryDate, notes, flag_state_id as flagStateId, built_year as builtYear, gross_tonnage as grossTonnage, vessel_type as vesselType, classification_society as classificationSociety, call_sign as callSign FROM vessels'
        let countQuery = 'SELECT COUNT(*) as total FROM vessels'
        const conditions: string[] = []
        const values: any[] = []

        if (search) {
            conditions.push('(name LIKE ? OR imo_number LIKE ? OR EXISTS (SELECT 1 FROM vessel_name_history vnh WHERE vnh.vessel_id = vessels.id AND vnh.previous_name LIKE ?))')
            values.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        if (fleetId !== undefined && fleetId !== 'all') {
            if (fleetId === '') {
                conditions.push('fleet_id IS NULL')
            } else {
                conditions.push('fleet_id = ?')
                values.push(fleetId)
            }
        }

        if (customerId !== undefined && customerId !== 'all') {
            if (customerId === '') {
                conditions.push('customer_id IS NULL')
            } else {
                conditions.push('customer_id = ?')
                values.push(customerId)
            }
        }

        if (status && status !== 'all') {
            if (status === 'active') conditions.push('is_active = 1')
            if (status === 'inactive') conditions.push('is_active = 0')
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ')
            query += whereClause
            countQuery += whereClause
        }

        // Sorting
        const allowedSortFields: Record<string, string> = { 'name': 'name', 'imoNumber': 'imo_number' }
        const dbSortField = allowedSortFields[sortField] || 'name'
        const dbSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'

        query += ` ORDER BY ${dbSortField} ${dbSortOrder}`

        // Limits
        query += ' LIMIT ? OFFSET ?'
        values.push(limit, offset)

        // Execute Count
        // Count queries params are same as main query params minus limit/offset
        const countValues = values.slice(0, values.length - 2)
        const [countResult] = await this.pool.query(countQuery, countValues)
        const total = (countResult as any[])[0].total

        // Execute Main
        const [rows] = await this.pool.query(query, values)

        const data = (rows as any[]).map(r => ({ ...r, ofacMatchFound: Boolean(r.ofacMatchFound), isActive: Boolean(r.isActive), builtYear: r.builtYear ? Number(r.builtYear) : undefined, grossTonnage: r.grossTonnage ? Number(r.grossTonnage) : undefined }))

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        }
    }

    async addVessel(vessel: Omit<Vessel, 'id'>): Promise<Vessel> {
        if (!this.pool) throw new Error('DB Not connected')

        // Check for duplicate IMO
        const [existing] = await this.pool.query('SELECT id FROM vessels WHERE imo_number = ?', [vessel.imoNumber])
        if ((existing as any[]).length > 0) {
            throw new Error(`Vessel with IMO number ${vessel.imoNumber} already exists`)
        }

        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO vessels (id, name, imo_number, fleet_id, ofac_checked_at, ofac_match_found, ofac_status, is_active, customer_id, customer_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, vessel.name, vessel.imoNumber, vessel.fleetId || null, formatDateForMySQL(vessel.ofacCheckedAt), vessel.ofacMatchFound || false, vessel.ofacStatus || 'PENDING', vessel.isActive !== undefined ? vessel.isActive : true, vessel.customerId || null, vessel.customerType || null]
        )
        return { ...vessel, id }
    }

    async updateVessel(id: string, updates: Partial<Vessel>, changedBy?: string): Promise<void> {
        if (!this.pool) return

        // Fetch current vessel for audit logging
        const [currentRows]: any[] = await this.pool.query(
            'SELECT name, imo_number, fleet_id, flag_state_id, built_year, gross_tonnage, vessel_type, classification_society, call_sign, is_active, customer_id, customer_type FROM vessels WHERE id = ?',
            [id]
        )
        const current = currentRows.length > 0 ? currentRows[0] : null

        const fields: string[] = []
        const values: any[] = []

        // Tracked fields for audit log
        const auditFields: { updateKey: keyof Vessel; dbCol: string; label: string }[] = [
            { updateKey: 'name', dbCol: 'name', label: 'Name' },
            { updateKey: 'imoNumber', dbCol: 'imo_number', label: 'IMO Number' },
            { updateKey: 'flagStateId', dbCol: 'flag_state_id', label: 'Flag State' },
            { updateKey: 'builtYear', dbCol: 'built_year', label: 'Built Year' },
            { updateKey: 'grossTonnage', dbCol: 'gross_tonnage', label: 'Gross Tonnage' },
            { updateKey: 'vesselType', dbCol: 'vessel_type', label: 'Vessel Type' },
            { updateKey: 'classificationSociety', dbCol: 'classification_society', label: 'Classification' },
            { updateKey: 'callSign', dbCol: 'call_sign', label: 'Call Sign' },
            { updateKey: 'isActive', dbCol: 'is_active', label: 'Status' },
            { updateKey: 'customerId', dbCol: 'customer_id', label: 'Customer' },
            { updateKey: 'customerType', dbCol: 'customer_type', label: 'Customer Type' },
        ]

        if (updates.name !== undefined) {
            // Record name history before update
            if (current && current.name !== updates.name) {
                await this.pool.execute(
                    'INSERT INTO vessel_name_history (id, vessel_id, previous_name, changed_by) VALUES (?, ?, ?, ?)',
                    [uuidv4(), id, current.name, changedBy || 'system']
                )
            }
            fields.push('name = ?'); values.push(updates.name)
        }
        if (updates.imoNumber !== undefined) { fields.push('imo_number = ?'); values.push(updates.imoNumber) }
        if (updates.fleetId !== undefined) { fields.push('fleet_id = ?'); values.push(updates.fleetId || null) }
        if (updates.ofacCheckedAt !== undefined) { fields.push('ofac_checked_at = ?'); values.push(formatDateForMySQL(updates.ofacCheckedAt)) }
        if (updates.ofacMatchFound !== undefined) { fields.push('ofac_match_found = ?'); values.push(updates.ofacMatchFound || false) }
        if (updates.ofacStatus !== undefined) { fields.push('ofac_status = ?'); values.push(updates.ofacStatus) }
        if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive) }
        if (updates.customerId !== undefined) { fields.push('customer_id = ?'); values.push(updates.customerId || null) }
        if (updates.customerType !== undefined) { fields.push('customer_type = ?'); values.push(updates.customerType || null) }
        if (updates.policyExpiryDate !== undefined) { fields.push('policy_expiry_date = ?'); values.push(updates.policyExpiryDate || null) }
        if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes || null) }
        if (updates.flagStateId !== undefined) { fields.push('flag_state_id = ?'); values.push(updates.flagStateId || null) }
        if (updates.builtYear !== undefined) { fields.push('built_year = ?'); values.push(updates.builtYear || null) }
        if (updates.grossTonnage !== undefined) { fields.push('gross_tonnage = ?'); values.push(updates.grossTonnage || null) }
        if (updates.vesselType !== undefined) { fields.push('vessel_type = ?'); values.push(updates.vesselType || null) }
        if (updates.classificationSociety !== undefined) { fields.push('classification_society = ?'); values.push(updates.classificationSociety || null) }
        if (updates.callSign !== undefined) { fields.push('call_sign = ?'); values.push(updates.callSign || null) }

        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE vessels SET ${fields.join(', ')} WHERE id = ?`, values)

        // Log audit entries for tracked fields
        if (current) {
            const who = changedBy || 'system'
            for (const af of auditFields) {
                if (updates[af.updateKey] !== undefined) {
                    const oldVal = current[af.dbCol] != null ? String(current[af.dbCol]) : null
                    const newVal = updates[af.updateKey] != null ? String(updates[af.updateKey]) : null
                    if (oldVal !== newVal) {
                        await this.addVesselAuditEntry(id, af.label, oldVal, newVal, who)
                    }
                }
            }
        }

        // When vessel is deactivated, cascade: disable all active policies
        if (updates.isActive === false && current && current.is_active) {
            await this.pool.execute(
                "UPDATE vessel_dynamic_policies SET status = 'inactive' WHERE vessel_id = ? AND status = 'active'",
                [id]
            )
        }

        // When vessel is reactivated, restore cascade-deactivated policies (status = 'inactive') to active
        if (updates.isActive === true && current && !current.is_active) {
            await this.pool.execute(
                "UPDATE vessel_dynamic_policies SET status = 'active' WHERE vessel_id = ? AND status = 'inactive'",
                [id]
            )
        }
    }

    async getVesselNameHistory(vesselId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, vessel_id as vesselId, previous_name as previousName, changed_at as changedAt, changed_by as changedBy FROM vessel_name_history WHERE vessel_id = ? ORDER BY changed_at DESC',
            [vesselId]
        )
        return rows as any[]
    }

    async deleteVessel(id: string): Promise<void> {
        if (!this.pool) return

        // 1. Get associated entity IDs before deletion
        const [assureds]: any[] = await this.pool.execute(
            'SELECT entity_id as entityId FROM vessel_assureds WHERE vessel_id = ?',
            [id]
        )
        const entityIds = assureds.map((a: any) => a.entityId)

        // 2. Delete the vessel (cascades to vessel_documents, vessel_assureds)
        await this.pool.execute('DELETE FROM vessels WHERE id = ?', [id])

        // 3. Delete compliance results for this vessel
        await this.pool.execute('DELETE FROM compliance_check_results WHERE entity_type = "vessel" AND entity_id = ?', [id])

        // 4. Clean up orphaned entities
        for (const entityId of entityIds) {
            const [others]: any[] = await this.pool.execute(
                'SELECT id FROM vessel_assureds WHERE entity_id = ?',
                [entityId]
            )
            if (others.length === 0) {
                // Not linked to any other vessel, delete the entity (cascades to entity_ubos)
                await this.pool.execute('DELETE FROM entities WHERE id = ?', [entityId])
                // Also delete compliance results for this entity
                await this.pool.execute('DELETE FROM compliance_check_results WHERE entity_type = "entity" AND entity_id = ?', [entityId])
            }
        }
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
                [doc.filePath, doc.sent, doc.required, doc.expiryDate || null, doc.receivedDate || null, formatDateForMySQL(doc.uploadedDate), doc.uploadedBy, existing[0].id]
            )
        } else {
            await this.pool.execute(
                `INSERT INTO vessel_documents 
            (id, vessel_id, document_type_id, file_path, sent, required, expiry_date, received_date, uploaded_date, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), doc.vesselId, doc.documentTypeId, doc.filePath, doc.sent, doc.required, doc.expiryDate || null, doc.receivedDate || null, formatDateForMySQL(doc.uploadedDate), doc.uploadedBy]
            )
        }
    }

    async duplicateVesselDocument(docId: string, uploadedBy: string): Promise<void> {
        if (!this.pool) return
        const [rows]: any[] = await this.pool.query(
            'SELECT * FROM vessel_documents WHERE id = ?',
            [docId]
        )
        if (rows.length === 0) throw new Error('Document not found')
        const doc = rows[0]
        await this.pool.execute(
            `INSERT INTO vessel_documents
            (id, vessel_id, document_type_id, file_path, sent, required, expiry_date, received_date, uploaded_date, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [uuidv4(), doc.vessel_id, doc.document_type_id, doc.file_path, doc.sent, doc.required, doc.expiry_date, doc.received_date, uploadedBy]
        )
    }

    async deleteVesselDocumentById(docId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_documents WHERE id = ?', [docId])
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

    // --- Flag States ---
    async getFlagStates(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT fs.id, fs.name, fs.iso3_code as iso3Code, fs.address, fs.email,
                   COUNT(v.id) as vesselCount
            FROM flag_states fs
            LEFT JOIN vessels v ON fs.id = v.flag_state_id
            GROUP BY fs.id, fs.name, fs.iso3_code, fs.address, fs.email
            ORDER BY fs.name ASC
        `)
        return (rows as any[]).map(r => ({ ...r, vesselCount: Number(r.vesselCount) }))
    }

    async addFlagState(flagState: { name: string; iso3Code: string; address?: string; email?: string }): Promise<any> {
        if (!this.pool) throw new Error('No database connection')
        const id = require('crypto').randomUUID()
        await this.pool.execute(
            'INSERT INTO flag_states (id, name, iso3_code, address, email) VALUES (?, ?, ?, ?, ?)',
            [id, flagState.name, flagState.iso3Code.toUpperCase(), flagState.address || null, flagState.email || null]
        )
        return { id, ...flagState, iso3Code: flagState.iso3Code.toUpperCase(), vesselCount: 0 }
    }

    async updateFlagState(id: string, updates: { name?: string; iso3Code?: string; address?: string; email?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.iso3Code !== undefined) { fields.push('iso3_code = ?'); values.push(updates.iso3Code.toUpperCase()) }
        if (updates.address !== undefined) { fields.push('address = ?'); values.push(updates.address || null) }
        if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email || null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE flag_states SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteFlagState(id: string): Promise<void> {
        if (!this.pool) return
        // Clear flag_state_id on vessels referencing this flag state
        await this.pool.execute('UPDATE vessels SET flag_state_id = NULL WHERE flag_state_id = ?', [id])
        await this.pool.execute('DELETE FROM flag_states WHERE id = ?', [id])
    }

    async getVesselsByFlagState(flagStateId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, name, imo_number as imoNumber FROM vessels WHERE flag_state_id = ? ORDER BY name ASC',
            [flagStateId]
        )
        return rows as any[]
    }

    // --- Entities ---
    async getEntities(): Promise<Entity[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, type, identifier, email, phone, passport_file_path as passportFilePath, certificate_of_incorporation_path as certificateOfIncorporationPath, articles_of_association_path as articlesOfAssociationPath, kyc_file_path as kycFilePath, ofac_checked_at as ofacCheckedAt, ofac_match_found as ofacMatchFound, ofac_status as ofacStatus FROM entities')
        return (rows as any[]).map(r => ({ ...r, ofacMatchFound: Boolean(r.ofacMatchFound) }))
    }

    async getEntitiesPaginated(params: EntityQueryParams): Promise<PaginatedResult<Entity>> {
        if (!this.pool) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }

        const { page = 1, limit = 10, search, type, ofacStatus, sortField = 'name', sortOrder = 'asc' } = params
        const offset = (page - 1) * limit

        let query = 'SELECT id, name, type, identifier, email, phone, passport_file_path as passportFilePath, certificate_of_incorporation_path as certificateOfIncorporationPath, articles_of_association_path as articlesOfAssociationPath, kyc_file_path as kycFilePath, ofac_checked_at as ofacCheckedAt, ofac_match_found as ofacMatchFound, ofac_status as ofacStatus FROM entities'
        let countQuery = 'SELECT COUNT(*) as total FROM entities'
        const conditions: string[] = []
        const values: any[] = []

        if (search) {
            conditions.push('(name LIKE ? OR identifier LIKE ?)')
            values.push(`%${search}%`, `%${search}%`)
        }

        if (type && type !== 'all') {
            conditions.push('type = ?')
            values.push(type)
        }

        if (ofacStatus && ofacStatus !== 'all') {
            if (ofacStatus === 'PENDING') {
                conditions.push("(ofac_status = 'PENDING' OR ofac_status IS NULL)")
            } else {
                conditions.push('ofac_status = ?')
                values.push(ofacStatus)
            }
        }

        if (params.customersOnly) {
            conditions.push('(id IN (SELECT DISTINCT customer_id FROM vessels WHERE customer_id IS NOT NULL) OR id IN (SELECT DISTINCT broker_entity_id FROM vessel_dynamic_policies WHERE broker_entity_id IS NOT NULL))')
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ')
            query += whereClause
            countQuery += whereClause
        }

        const allowedSortFields: Record<string, string> = { 'name': 'name', 'type': 'type' }
        const dbSortField = allowedSortFields[sortField] || 'name'
        const dbSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'

        query += ` ORDER BY ${dbSortField} ${dbSortOrder}`
        query += ' LIMIT ? OFFSET ?'
        values.push(limit, offset)

        const countValues = values.slice(0, values.length - 2)
        const [countResult] = await this.pool.query(countQuery, countValues)
        const total = (countResult as any[])[0].total

        const [rows] = await this.pool.query(query, values)
        const data = (rows as any[]).map(r => ({ ...r, ofacMatchFound: Boolean(r.ofacMatchFound) }))

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
    }

    async addEntity(entity: Omit<Entity, 'id'>): Promise<Entity> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO entities (id, name, type, identifier, email, phone, passport_file_path, certificate_of_incorporation_path, articles_of_association_path, kyc_file_path, ofac_checked_at, ofac_match_found, ofac_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, entity.name, entity.type, entity.identifier || null, entity.email || null, entity.phone || null, entity.passportFilePath || null, entity.certificateOfIncorporationPath || null, entity.articlesOfAssociationPath || null, entity.kycFilePath || null, formatDateForMySQL(entity.ofacCheckedAt), entity.ofacMatchFound || false, entity.ofacStatus || 'PENDING']
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
        if (updates.ofacCheckedAt !== undefined) { fields.push('ofac_checked_at = ?'); values.push(formatDateForMySQL(updates.ofacCheckedAt)) }
        if (updates.ofacMatchFound !== undefined) { fields.push('ofac_match_found = ?'); values.push(updates.ofacMatchFound || false) }
        if (updates.ofacStatus !== undefined) { fields.push('ofac_status = ?'); values.push(updates.ofacStatus) }

        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async purgeAllVesselsAndEntities(): Promise<{ vesselsDeleted: number; entitiesDeleted: number }> {
        if (!this.pool) throw new Error('DB Not connected')
        const [vRows] = await this.pool.query('SELECT COUNT(*) as cnt FROM vessels')
        const [eRows] = await this.pool.query('SELECT COUNT(*) as cnt FROM entities')
        const vesselsDeleted = (vRows as any[])[0].cnt
        const entitiesDeleted = (eRows as any[])[0].cnt
        // Delete in dependency order to avoid FK violations
        await this.pool.execute('DELETE FROM vessel_reminder_snoozes')
        await this.pool.execute('DELETE FROM survey_attachments WHERE survey_id IN (SELECT id FROM condition_surveys)')
        await this.pool.execute('DELETE FROM survey_defects WHERE survey_id IN (SELECT id FROM condition_surveys)')
        await this.pool.execute('DELETE FROM condition_surveys')
        await this.pool.execute('DELETE FROM entity_ubos')
        await this.pool.execute('DELETE FROM vessel_assureds')
        await this.pool.execute('DELETE FROM vessel_documents')
        await this.pool.execute('DELETE FROM compliance_check_results')
        await this.pool.execute('DELETE FROM vessels')
        await this.pool.execute('DELETE FROM entities')
        return { vesselsDeleted, entitiesDeleted }
    }

    async deleteEntity(id: string): Promise<void> {
        if (!this.pool) return
        // Clear customer_id on vessels that reference this entity as their customer
        await this.pool.execute('UPDATE vessels SET customer_id = NULL, customer_type = NULL WHERE customer_id = ?', [id])
        await this.pool.execute('DELETE FROM entities WHERE id = ?', [id])
    }

    async mergeEntities(sourceId: string, targetId: string, keepName?: string): Promise<{ mergedAssuredLinks: number; mergedUBOLinks: number; mergedCustomerLinks: number }> {
        if (!this.pool) throw new Error('DB Not connected')

        const conn = await this.pool.getConnection()
        try {
            await conn.beginTransaction()

            // Optionally update the target entity name
            if (keepName) {
                await conn.execute('UPDATE entities SET name = ? WHERE id = ?', [keepName, targetId])
            }

            // Copy file paths from source to target if target doesn't have them
            const [sourceRows] = await conn.query('SELECT * FROM entities WHERE id = ?', [sourceId])
            const [targetRows] = await conn.query('SELECT * FROM entities WHERE id = ?', [targetId])
            const source = (sourceRows as any[])[0]
            const target = (targetRows as any[])[0]

            if (!source || !target) throw new Error('One or both entities not found')

            const fileCols = ['passport_file_path', 'certificate_of_incorporation_path', 'articles_of_association_path', 'kyc_file_path']
            for (const col of fileCols) {
                if (source[col] && !target[col]) {
                    await conn.execute(`UPDATE entities SET ${col} = ? WHERE id = ?`, [source[col], targetId])
                }
            }

            // 1. Update vessel_assureds: move source entity's assured links to target
            // First, find duplicates (same vessel + same role for both entities)
            const [dupeAssureds] = await conn.query(
                `SELECT va1.id FROM vessel_assureds va1
                 INNER JOIN vessel_assureds va2 ON va1.vessel_id = va2.vessel_id AND va1.role = va2.role
                 WHERE va1.entity_id = ? AND va2.entity_id = ?`,
                [sourceId, targetId]
            )
            // Delete duplicates from source
            for (const dupe of dupeAssureds as any[]) {
                await conn.execute('DELETE FROM vessel_assureds WHERE id = ?', [dupe.id])
            }
            // Move remaining
            const [assuredResult] = await conn.execute(
                'UPDATE vessel_assureds SET entity_id = ? WHERE entity_id = ?',
                [targetId, sourceId]
            )
            const mergedAssuredLinks = (assuredResult as any).affectedRows || 0

            // 2. Update entity_ubos: reassign UBO relationships
            // As assured parent: move UBOs from source to target (skip duplicates)
            const [dupeUbosParent] = await conn.query(
                `SELECT eu1.ubo_entity_id FROM entity_ubos eu1
                 INNER JOIN entity_ubos eu2 ON eu1.ubo_entity_id = eu2.ubo_entity_id
                 WHERE eu1.assured_entity_id = ? AND eu2.assured_entity_id = ?`,
                [sourceId, targetId]
            )
            for (const dupe of dupeUbosParent as any[]) {
                await conn.execute('DELETE FROM entity_ubos WHERE assured_entity_id = ? AND ubo_entity_id = ?', [sourceId, dupe.ubo_entity_id])
            }
            await conn.execute('UPDATE entity_ubos SET assured_entity_id = ? WHERE assured_entity_id = ?', [targetId, sourceId])

            // As UBO child: update references where source is someone's UBO
            const [dupeUbosChild] = await conn.query(
                `SELECT eu1.assured_entity_id FROM entity_ubos eu1
                 INNER JOIN entity_ubos eu2 ON eu1.assured_entity_id = eu2.assured_entity_id
                 WHERE eu1.ubo_entity_id = ? AND eu2.ubo_entity_id = ?`,
                [sourceId, targetId]
            )
            for (const dupe of dupeUbosChild as any[]) {
                await conn.execute('DELETE FROM entity_ubos WHERE assured_entity_id = ? AND ubo_entity_id = ?', [dupe.assured_entity_id, sourceId])
            }
            const [uboResult] = await conn.execute('UPDATE entity_ubos SET ubo_entity_id = ? WHERE ubo_entity_id = ?', [targetId, sourceId])
            const mergedUBOLinks = (uboResult as any).affectedRows || 0

            // Remove self-referencing UBOs (entity can't be its own UBO)
            await conn.execute('DELETE FROM entity_ubos WHERE assured_entity_id = ubo_entity_id')

            // 3. Update vessels customer_id
            const [custResult] = await conn.execute(
                'UPDATE vessels SET customer_id = ? WHERE customer_id = ?',
                [targetId, sourceId]
            )
            const mergedCustomerLinks = (custResult as any).affectedRows || 0

            // 4. Update compliance_check_results
            await conn.execute(
                `UPDATE compliance_check_results SET entity_id = ? WHERE entity_type = 'entity' AND entity_id = ?`,
                [targetId, sourceId]
            )

            // 5. Delete the source entity
            await conn.execute('DELETE FROM entities WHERE id = ?', [sourceId])

            await conn.commit()
            return { mergedAssuredLinks, mergedUBOLinks, mergedCustomerLinks }
        } catch (error) {
            await conn.rollback()
            throw error
        } finally {
            conn.release()
        }
    }

    // --- Roles ---
    async getAssuredRoles(): Promise<AssuredRole[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT ar.id, ar.name, ar.order_index as \`order\`, COUNT(DISTINCT va.vessel_id) as vesselCount
            FROM assured_roles ar
            LEFT JOIN vessel_assureds va ON ar.name = va.role
            GROUP BY ar.id, ar.name, ar.order_index
            ORDER BY ar.order_index ASC, ar.name ASC
        `)
        return (rows as any[]).map(r => ({
            ...r,
            vesselCount: Number(r.vesselCount)
        }))
    }

    async addAssuredRole(role: Omit<AssuredRole, 'id'>): Promise<AssuredRole> {
        if (!this.pool) throw new Error('DB Not connected')
        // Check for duplicate name (case-insensitive)
        const [existing] = await this.pool.execute('SELECT id FROM assured_roles WHERE LOWER(name) = LOWER(?)', [role.name.trim()])
        if ((existing as any[]).length > 0) {
            throw new Error('This role already exists')
        }
        const id = uuidv4()
        // Get max order_index
        const [maxRows] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) as maxOrder FROM assured_roles')
        const maxOrder = (maxRows as any[])[0].maxOrder
        await this.pool.execute('INSERT INTO assured_roles (id, name, order_index) VALUES (?, ?, ?)', [id, role.name.trim(), maxOrder + 1])
        return { ...role, id, order: maxOrder + 1 }
    }

    async updateAssuredRole(id: string, updates: Partial<AssuredRole>): Promise<void> {
        if (!this.pool) return

        // Fetch old role name for syncing with vessel_assureds
        const [oldRows] = await this.pool.execute('SELECT name FROM assured_roles WHERE id = ?', [id])
        const oldRole = (oldRows as any[])[0]

        const fields: string[] = []
        const values: any[] = []

        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }

        if (fields.length === 0) return
        values.push(id)

        const connection = await this.pool.getConnection()
        await connection.beginTransaction()
        try {
            await connection.execute(`UPDATE assured_roles SET ${fields.join(', ')} WHERE id = ?`, values)

            if (updates.name !== undefined && oldRole && oldRole.name !== updates.name) {
                // Sync with vessel_assureds table
                await connection.execute('UPDATE vessel_assureds SET role = ? WHERE role = ?', [updates.name, oldRole.name])
            }

            await connection.commit()
        } catch (error) {
            await connection.rollback()
            throw error
        } finally {
            connection.release()
        }
    }

    async reorderAssuredRoles(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        const connection = await this.pool.getConnection()
        await connection.beginTransaction()
        try {
            for (let i = 0; i < orderedIds.length; i++) {
                await connection.execute('UPDATE assured_roles SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
            }
            await connection.commit()
        } catch (error) {
            await connection.rollback()
            throw error
        } finally {
            connection.release()
        }
    }

    async getVesselsByRole(roleName: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT DISTINCT v.id, v.name, v.imo_number as imoNumber
            FROM vessels v
            INNER JOIN vessel_assureds va ON v.id = va.vessel_id
            WHERE va.role = ?
            ORDER BY v.name ASC
        `, [roleName])
        return rows as any[]
    }

    async deleteAssuredRole(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM assured_roles WHERE id = ?', [id])
    }

    async syncAssuredRoles(): Promise<{ added: number }> {
        if (!this.pool) throw new Error('DB Not connected')

        // 1. Get all unique roles from vessel_assureds
        const [usedRows] = await this.pool.query('SELECT DISTINCT role FROM vessel_assureds')
        const usedRoles = (usedRows as any[]).map(r => r.role)

        // 2. Get all existing roles from assured_roles
        const existingRoles = await this.getAssuredRoles()
        const existingRoleNames = new Set(existingRoles.map(r => r.name.toLowerCase()))

        // 3. Find missing roles and add them
        let addedCount = 0
        for (const roleName of usedRoles) {
            if (roleName && !existingRoleNames.has(roleName.toLowerCase())) {
                await this.addAssuredRole({ name: roleName })
                addedCount++
            }
        }

        return { added: addedCount }
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

    async updateVesselAssuredRole(id: string, role: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE vessel_assureds SET role = ? WHERE id = ?', [role, id])
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
            'SELECT id, username, password_hash as passwordHash, role, theme_preference as themePreference, sanctions_threshold as sanctionsThreshold, last_app_version as lastAppVersion, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, sidebar_collapsed as sidebarCollapsed, collapsed_groups as collapsedGroups, created_at as createdAt, last_login_at as lastLoginAt FROM users WHERE username = ?',
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
            'SELECT id, username, role, theme_preference as themePreference, sanctions_threshold as sanctionsThreshold, last_app_version as lastAppVersion, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, sidebar_collapsed as sidebarCollapsed, collapsed_groups as collapsedGroups, created_at as createdAt, last_login_at as lastLoginAt FROM users ORDER BY username ASC'
        )
        // Return without passwordHash
        return rows as User[]
    }

    async updateUserLastLogin(userId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId])
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

    async updateUserSanctionsThreshold(userId: string, threshold: number): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET sanctions_threshold = ? WHERE id = ?',
            [threshold, userId]
        )
    }

    async updateUserSidebarState(userId: string, sidebarCollapsed: boolean, collapsedGroups: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET sidebar_collapsed = ?, collapsed_groups = ? WHERE id = ?',
            [sidebarCollapsed ? 1 : 0, collapsedGroups, userId]
        )
    }

    async updateUserAppVersion(userId: string, version: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET last_app_version = ? WHERE id = ?',
            [version, userId]
        )
    }

    async getUserById(userId: string): Promise<User | null> {
        if (!this.pool) return null
        const [rows]: any[] = await this.pool.query(
            'SELECT id, username, password_hash as passwordHash, role, theme_preference as themePreference, sanctions_threshold as sanctionsThreshold, last_app_version as lastAppVersion, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, sidebar_collapsed as sidebarCollapsed, collapsed_groups as collapsedGroups, created_at as createdAt FROM users WHERE id = ?',
            [userId]
        )
        return rows.length > 0 ? (rows[0] as User) : null
    }

    async updateUserPassword(userId: string, newPasswordHash: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newPasswordHash, userId]
        )
    }

    async updateUserRole(userId: string, role: 'admin' | 'user'): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId])
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

    async getPISectionTexts(): Promise<any> {
        const val = await this.getSetting('pi_section_texts')
        if (!val) return {}
        try { return JSON.parse(val) } catch { return {} }
    }

    async setPISectionTexts(texts: any, updatedBy?: string): Promise<void> {
        await this.setSetting('pi_section_texts', JSON.stringify(texts), updatedBy)
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

    async getSurveyorsPaginated(params: SurveyorQueryParams): Promise<PaginatedResult<Surveyor>> {
        if (!this.pool) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }

        const { page = 1, limit = 10, search, country, sortField = 'companyName', sortOrder = 'asc' } = params
        const offset = (page - 1) * limit

        let query = `SELECT id, company_name as companyName, country, contact_person as contactPerson,
             contact_details as contactDetails, notes, created_at as createdAt FROM surveyors`
        let countQuery = 'SELECT COUNT(*) as total FROM surveyors'
        const conditions: string[] = []
        const values: any[] = []

        if (search) {
            conditions.push('(company_name LIKE ? OR country LIKE ? OR contact_person LIKE ?)')
            values.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        if (country) {
            conditions.push('country = ?')
            values.push(country)
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ')
            query += whereClause
            countQuery += whereClause
        }

        const allowedSortFields: Record<string, string> = { 'companyName': 'company_name', 'country': 'country' }
        const dbSortField = allowedSortFields[sortField] || 'company_name'
        const dbSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'

        query += ` ORDER BY ${dbSortField} ${dbSortOrder}`
        query += ' LIMIT ? OFFSET ?'
        values.push(limit, offset)

        const countValues = values.slice(0, values.length - 2)
        const [countResult] = await this.pool.query(countQuery, countValues)
        const total = (countResult as any[])[0].total

        const [rows] = await this.pool.query(query, values)

        return { data: rows as Surveyor[], total, page, limit, totalPages: Math.ceil(total / limit) }
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
        let sql: string
        const params: any[] = []
        if (vesselId) {
            sql = `SELECT id, vessel_id as vesselId, survey_date as surveyDate,
                   surveyor_id as surveyorId, survey_type as surveyType, reference, location, notes,
                   created_at as createdAt, created_by as createdBy
                   FROM condition_surveys WHERE vessel_id = ? ORDER BY survey_date DESC`
            params.push(vesselId)
        } else {
            sql = `SELECT cs.id, cs.vessel_id as vesselId, cs.survey_date as surveyDate,
                   cs.surveyor_id as surveyorId, cs.survey_type as surveyType, cs.reference, cs.location, cs.notes,
                   cs.created_at as createdAt, cs.created_by as createdBy
                   FROM condition_surveys cs
                   JOIN vessels v ON v.id = cs.vessel_id
                   WHERE v.is_active = TRUE
                   ORDER BY cs.survey_date DESC`
        }
        const [rows] = await this.pool.query(sql, params)
        return rows as ConditionSurvey[]
    }

    async addConditionSurvey(survey: Omit<ConditionSurvey, 'id'>): Promise<ConditionSurvey> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO condition_surveys
             (id, vessel_id, survey_date, surveyor_id, survey_type, reference, location, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, survey.vesselId, survey.surveyDate, survey.surveyorId,
                survey.surveyType, survey.reference || null, survey.location || null,
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
        if (updates.reference !== undefined) { fields.push('reference = ?'); values.push(updates.reference) }
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

    // --- Condition Survey Types ---
    async getConditionSurveyTypes(): Promise<{ id: string; name: string }[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name FROM condition_survey_types ORDER BY name ASC')
        return rows as { id: string; name: string }[]
    }

    async addConditionSurveyType(name: string): Promise<{ id: string; name: string }> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO condition_survey_types (id, name) VALUES (?, ?)', [id, name])
        return { id, name }
    }

    async deleteConditionSurveyType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM condition_survey_types WHERE id = ?', [id])
    }

    // --- Survey Defects ---
    async getSurveyDefects(surveyId?: string): Promise<SurveyDefect[]> {
        if (!this.pool) return []
        let sql = `SELECT id, survey_id as surveyId, defect_number as defectNumber,
                   description, severity, status, due_date as dueDate, notes,
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
             (id, survey_id, defect_number, description, severity, status, due_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, defect.surveyId, defect.defectNumber, defect.description,
                defect.severity || null, defect.status || 'OPEN', defect.dueDate || null, defect.notes || null]
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
        if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes) }
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
                cs.id as surveyId, cs.survey_date as surveyDate,
                s.company_name as surveyorName,
                sd.id as defectId, sd.defect_number as defectNumber, sd.description,
                sd.severity, sd.due_date as dueDate, sd.created_at as createdAt
            FROM vessels v
            INNER JOIN condition_surveys cs ON cs.vessel_id = v.id
            LEFT JOIN surveyors s ON s.id = cs.surveyor_id
            INNER JOIN survey_defects sd ON sd.survey_id = cs.id
            WHERE sd.status = 'OPEN' AND v.is_active = TRUE
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

    // --- Dashboard Activity ---
    async getDashboardActivity(): Promise<{ recentVessels: any[]; recentEntities: any[]; recentAuditEntries: any[] }> {
        if (!this.pool) return { recentVessels: [], recentEntities: [], recentAuditEntries: [] }
        const [recentVessels] = await this.pool.query(`
            SELECT v.id, v.name, v.imo_number as imoNumber,
                v.created_at as createdAt, v.is_active as isActive,
                f.name as fleetName
            FROM vessels v
            LEFT JOIN fleets f ON f.id = v.fleet_id
            ORDER BY v.created_at DESC
            LIMIT 6
        `)
        const [recentEntities] = await this.pool.query(`
            SELECT id, name, type, created_at as createdAt
            FROM entities
            ORDER BY created_at DESC
            LIMIT 6
        `)
        const [recentAuditEntries] = await this.pool.query(`
            SELECT al.vessel_id as vesselId, v.name as vesselName,
                al.field_name as fieldName, al.new_value as newValue,
                al.changed_at as changedAt
            FROM vessel_audit_log al
            JOIN vessels v ON v.id = al.vessel_id
            ORDER BY al.changed_at DESC
            LIMIT 8
        `)
        return {
            recentVessels: (recentVessels as any[]).map(r => ({ ...r, isActive: Boolean(r.isActive) })),
            recentEntities: recentEntities as any[],
            recentAuditEntries: recentAuditEntries as any[]
        }
    }

    // --- Survey Warranties ---
    async getSurveyWarrantiesByVessel(vesselId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT sw.id, sw.vessel_id as vesselId, sw.policy_id as policyId,
                sw.description, sw.deadline_type as deadlineType,
                sw.deadline_days as deadlineDays, sw.deadline_event as deadlineEvent,
                sw.inception_date as inceptionDate, sw.notes, sw.status,
                sw.waiver_reason as waiverReason, sw.completed_at as completedAt,
                sw.completion_notes as completionNotes,
                sw.condition_survey_id as conditionSurveyId,
                sw.created_at as createdAt,
                (SELECT COUNT(*) FROM survey_warranty_reminders swr WHERE swr.warranty_id = sw.id) as reminderCount,
                (SELECT swr2.sent_at FROM survey_warranty_reminders swr2 WHERE swr2.warranty_id = sw.id ORDER BY swr2.sent_at DESC LIMIT 1) as lastReminderDate,
                (SELECT swr3.next_reminder_date FROM survey_warranty_reminders swr3 WHERE swr3.warranty_id = sw.id ORDER BY swr3.created_at DESC LIMIT 1) as nextReminderDate
            FROM survey_warranties sw
            WHERE sw.vessel_id = ?
            ORDER BY sw.created_at DESC
        `, [vesselId])
        return rows as any[]
    }

    async getAllSurveyWarranties(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT sw.id, sw.vessel_id as vesselId, sw.policy_id as policyId,
                sw.description, sw.deadline_type as deadlineType,
                sw.deadline_days as deadlineDays, sw.deadline_event as deadlineEvent,
                sw.inception_date as inceptionDate, sw.notes, sw.status,
                sw.waiver_reason as waiverReason, sw.completed_at as completedAt,
                sw.completion_notes as completionNotes,
                sw.condition_survey_id as conditionSurveyId,
                sw.created_at as createdAt,
                v.name as vesselName, v.imo_number as imoNumber,
                e.name as customerName,
                f.name as fleetName,
                pt.name as policyTypeName,
                (SELECT COUNT(*) FROM survey_warranty_reminders swr WHERE swr.warranty_id = sw.id) as reminderCount,
                (SELECT swr2.sent_at FROM survey_warranty_reminders swr2 WHERE swr2.warranty_id = sw.id ORDER BY swr2.sent_at DESC LIMIT 1) as lastReminderDate,
                (SELECT swr3.next_reminder_date FROM survey_warranty_reminders swr3 WHERE swr3.warranty_id = sw.id ORDER BY swr3.created_at DESC LIMIT 1) as nextReminderDate
            FROM survey_warranties sw
            JOIN vessels v ON v.id = sw.vessel_id
            LEFT JOIN entities e ON e.id = v.customer_id
            LEFT JOIN fleets f ON f.id = v.fleet_id
            LEFT JOIN vessel_dynamic_policies vdp ON vdp.id = sw.policy_id
            LEFT JOIN policy_types pt ON pt.id = vdp.policy_type_id
            WHERE sw.status IN ('pending', 'survey_done')
            ORDER BY sw.inception_date ASC
        `)
        return rows as any[]
    }

    async getSurveyWarrantiesDueToday(): Promise<any[]> {
        if (!this.pool) return []
        const today = new Date().toISOString().split('T')[0]
        const [rows] = await this.pool.query(`
            SELECT sw.id, sw.description, sw.status,
                v.name as vesselName, v.imo_number as imoNumber,
                (SELECT swr.next_reminder_date FROM survey_warranty_reminders swr WHERE swr.warranty_id = sw.id ORDER BY swr.created_at DESC LIMIT 1) as nextReminderDate
            FROM survey_warranties sw
            JOIN vessels v ON v.id = sw.vessel_id
            WHERE sw.status IN ('pending', 'survey_done')
            HAVING nextReminderDate IS NOT NULL AND nextReminderDate <= ?
        `, [today])
        return rows as any[]
    }

    async getEndorsementsDue(): Promise<any[]> {
        if (!this.pool) return []
        const today = new Date().toISOString().split('T')[0]
        const [rows] = await this.pool.query(`
            SELECT cs.id as surveyId, cs.vessel_id as vesselId,
                cs.survey_date as surveyDate, cs.survey_type as surveyType,
                cs.endorsement_reminder_date as endorsementReminderDate,
                v.name as vesselName, v.imo_number as imoNumber
            FROM condition_surveys cs
            JOIN vessels v ON v.id = cs.vessel_id
            WHERE cs.endorsement_issued = 0
              AND cs.endorsement_reminder_date IS NOT NULL
              AND cs.endorsement_reminder_date <= ?
              AND cs.completed_at IS NULL
        `, [today])
        return rows as any[]
    }

    async createSurveyWarranty(data: any): Promise<any> {
        if (!this.pool) throw new Error('No DB')
        const id = require('crypto').randomUUID()
        await this.pool.query(
            `INSERT INTO survey_warranties (id, vessel_id, policy_id, description, deadline_type, deadline_days, deadline_event, inception_date, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [id, data.vesselId, data.policyId || null, data.description, data.deadlineType, data.deadlineDays || null, data.deadlineEvent || null, data.inceptionDate, data.notes || null]
        )
        const [rows] = await this.pool.query('SELECT * FROM survey_warranties WHERE id = ?', [id])
        return (rows as any[])[0]
    }

    async updateSurveyWarranty(id: string, data: any): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        const allowed = ['description', 'deadlineType', 'deadlineDays', 'deadlineEvent', 'inceptionDate', 'notes', 'status', 'waiverReason', 'completedAt', 'completionNotes', 'conditionSurveyId', 'policyId']
        const colMap: Record<string, string> = { deadlineType: 'deadline_type', deadlineDays: 'deadline_days', deadlineEvent: 'deadline_event', inceptionDate: 'inception_date', waiverReason: 'waiver_reason', completedAt: 'completed_at', completionNotes: 'completion_notes', conditionSurveyId: 'condition_survey_id', policyId: 'policy_id' }
        for (const key of allowed) {
            if (key in data) {
                fields.push(`${colMap[key] || key} = ?`)
                values.push(data[key] ?? null)
            }
        }
        if (!fields.length) return
        values.push(id)
        await this.pool.query(`UPDATE survey_warranties SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteSurveyWarranty(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.query('DELETE FROM survey_warranty_reminders WHERE warranty_id = ?', [id])
        await this.pool.query('DELETE FROM survey_warranties WHERE id = ?', [id])
    }

    async logWarrantyReminder(data: any): Promise<any> {
        if (!this.pool) throw new Error('No DB')
        const id = require('crypto').randomUUID()
        await this.pool.query(
            `INSERT INTO survey_warranty_reminders (id, warranty_id, sent_at, channel, reference, notes, next_reminder_date, logged_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.warrantyId, data.sentAt, data.channel || 'email', data.reference || null, data.notes || null, data.nextReminderDate || null, data.loggedBy || null]
        )
        const [rows] = await this.pool.query('SELECT * FROM survey_warranty_reminders WHERE id = ?', [id])
        return (rows as any[])[0]
    }

    async getWarrantyReminders(warrantyId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT swr.id, swr.warranty_id as warrantyId,
                swr.sent_at as sentAt, swr.channel, swr.reference,
                swr.notes, swr.next_reminder_date as nextReminderDate,
                swr.logged_by as loggedBy, swr.created_at as createdAt,
                u.username as loggedByName
            FROM survey_warranty_reminders swr
            LEFT JOIN users u ON u.id = swr.logged_by
            WHERE swr.warranty_id = ?
            ORDER BY swr.sent_at DESC, swr.created_at DESC
        `, [warrantyId])
        return rows as any[]
    }

    async waiverSurveyWarranty(id: string, reason: string): Promise<void> {
        if (!this.pool) return
        await this.pool.query(
            `UPDATE survey_warranties SET status = 'waived', waiver_reason = ?, completed_at = NOW() WHERE id = ?`,
            [reason, id]
        )
    }

    async closeSurvey(surveyId: string, userId: string): Promise<void> {
        if (!this.pool) return
        // Bulk-close all open defects
        await this.pool.query(
            `UPDATE survey_defects SET status = 'CLOSED', closed_at = NOW(), closed_by = ? WHERE survey_id = ? AND status = 'OPEN'`,
            [userId, surveyId]
        )
        // Mark survey complete
        await this.pool.query(
            `UPDATE condition_surveys SET completed_at = NOW(), completed_by = ? WHERE id = ?`,
            [userId, surveyId]
        )
        // Auto-complete any linked warranty
        await this.pool.query(
            `UPDATE survey_warranties SET status = 'completed', completed_at = NOW() WHERE condition_survey_id = ? AND status IN ('pending','survey_done')`,
            [surveyId]
        )
    }

    async updateConditionSurveyEndorsement(surveyId: string, issued: boolean): Promise<void> {
        if (!this.pool) return
        if (issued) {
            await this.pool.query(
                `UPDATE condition_surveys SET endorsement_issued = 1, endorsement_reminder_date = NULL WHERE id = ?`,
                [surveyId]
            )
        } else {
            const reminderDate = new Date()
            reminderDate.setDate(reminderDate.getDate() + 2)
            const dateStr = reminderDate.toISOString().split('T')[0]
            await this.pool.query(
                `UPDATE condition_surveys SET endorsement_issued = 0, endorsement_reminder_date = ? WHERE id = ?`,
                [dateStr, surveyId]
            )
        }
    }

    // --- Compliance Schedule ---
    async getComplianceScheduleSettings(): Promise<any> {
        const defaultSettings = {
            enabled: false,
            dayOfWeek: 1, // Monday
            timeOfDay: '09:00',
            threshold: 85,
            includeVessels: true,
            skipCleared: true,
            lastRunAt: null,
            nextRunAt: null
        }

        const settingValue = await this.getSetting('complianceSchedule')
        if (!settingValue) {
            return defaultSettings
        }

        try {
            return { ...defaultSettings, ...JSON.parse(settingValue) }
        } catch {
            return defaultSettings
        }
    }

    async setComplianceScheduleSettings(settings: any, updatedBy?: string): Promise<void> {
        await this.setSetting('complianceSchedule', JSON.stringify(settings), updatedBy)
    }

    // --- Compliance Check Logs ---
    async createComplianceCheckLog(log: { totalChecked: number; status: string }): Promise<string> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO compliance_check_logs (id, run_at, total_checked, matches_found, status)
             VALUES (?, NOW(), ?, 0, ?)`,
            [id, log.totalChecked, log.status]
        )
        return id
    }

    async updateComplianceCheckLog(id: string, updates: { matchesFound?: number; status?: string; error?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.matchesFound !== undefined) { fields.push('matches_found = ?'); values.push(updates.matchesFound) }
        if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status) }
        if (updates.error !== undefined) { fields.push('error = ?'); values.push(updates.error) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE compliance_check_logs SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async getComplianceCheckLogs(limit: number = 20): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, run_at as runAt, total_checked as totalChecked, matches_found as matchesFound,
             status, error, created_at as createdAt
             FROM compliance_check_logs ORDER BY run_at DESC LIMIT ?`,
            [limit]
        )
        return rows as any[]
    }

    async getLatestComplianceCheckLog(): Promise<any | null> {
        if (!this.pool) return null
        const [rows]: any[] = await this.pool.query(
            `SELECT id, run_at as runAt, total_checked as totalChecked, matches_found as matchesFound,
             status, error, created_at as createdAt
             FROM compliance_check_logs ORDER BY run_at DESC LIMIT 1`
        )
        return rows.length > 0 ? rows[0] : null
    }

    // --- Compliance Check Results ---
    async addComplianceCheckResult(result: {
        logId: string
        entityType: 'entity' | 'vessel'
        entityId: string
        entityName: string
        matchScore: number
        matchDetails: string
    }): Promise<void> {
        if (!this.pool) return
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO compliance_check_results
             (id, log_id, entity_type, entity_id, entity_name, match_score, match_details, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_review')`,
            [id, result.logId, result.entityType, result.entityId, result.entityName, result.matchScore, result.matchDetails]
        )
    }

    async getComplianceCheckResults(logId?: string, status?: string): Promise<any[]> {
        if (!this.pool) return []
        let sql = `SELECT r.id, r.log_id as logId, r.entity_type as entityType, r.entity_id as entityId,
                   r.entity_name as entityName, r.match_score as matchScore, r.match_details as matchDetails,
                   r.status, r.decision, r.reviewed_by as reviewedBy, r.reviewed_at as reviewedAt, r.created_at as createdAt
                   FROM compliance_check_results r
                   LEFT JOIN vessels v ON r.entity_type = 'vessel' AND r.entity_id = v.id`

        const conditions: string[] = []
        const params: any[] = []

        // Filter out results for inactive vessels
        conditions.push("(r.entity_type != 'vessel' OR v.is_active = 1 OR v.id IS NULL)")

        if (logId) { conditions.push('r.log_id = ?'); params.push(logId) }
        if (status) { conditions.push('r.status = ?'); params.push(status) }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ')
        }
        sql += ' ORDER BY r.match_score DESC, r.created_at DESC'
        const [rows] = await this.pool.query(sql, params)
        return rows as any[]
    }

    async getComplianceCheckResultsPaginated(params: ComplianceResultQueryParams): Promise<PaginatedResult<any>> {
        if (!this.pool) return { data: [], total: 0, page: 1, limit: 10, totalPages: 0 }

        const { page = 1, limit = 10, logId, status, entityType, sortField = 'matchScore', sortOrder = 'desc' } = params
        const offset = (page - 1) * limit

        let query = `SELECT r.id, r.log_id as logId, r.entity_type as entityType, r.entity_id as entityId,
                   r.entity_name as entityName, r.match_score as matchScore, r.match_details as matchDetails,
                   r.status, r.decision, r.reviewed_by as reviewedBy, r.reviewed_at as reviewedAt, r.created_at as createdAt
                   FROM compliance_check_results r
                   LEFT JOIN vessels v ON r.entity_type = 'vessel' AND r.entity_id = v.id`
        let countQuery = `SELECT COUNT(*) as total FROM compliance_check_results r
                   LEFT JOIN vessels v ON r.entity_type = 'vessel' AND r.entity_id = v.id`
        const conditions: string[] = []
        const values: any[] = []

        // Filter out results for inactive vessels
        conditions.push("(r.entity_type != 'vessel' OR v.is_active = 1 OR v.id IS NULL)")

        if (logId) { conditions.push('r.log_id = ?'); values.push(logId) }
        if (status && status !== 'all') { conditions.push('r.status = ?'); values.push(status) }
        if (entityType && entityType !== 'all') { conditions.push('r.entity_type = ?'); values.push(entityType) }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ')
            query += whereClause
            countQuery += whereClause
        }

        const allowedSortFields: Record<string, string> = { 'matchScore': 'r.match_score', 'createdAt': 'r.created_at', 'entityName': 'r.entity_name' }
        const dbSortField = allowedSortFields[sortField] || 'r.match_score'
        const dbSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'

        query += ` ORDER BY ${dbSortField} ${dbSortOrder}`
        query += ' LIMIT ? OFFSET ?'
        values.push(limit, offset)

        const countValues = values.slice(0, values.length - 2)
        const [countResult] = await this.pool.query(countQuery, countValues)
        const total = (countResult as any[])[0].total

        const [rows] = await this.pool.query(query, values)

        return { data: rows as any[], total, page, limit, totalPages: Math.ceil(total / limit) }
    }

    async getPendingComplianceResults(): Promise<any[]> {
        return this.getComplianceCheckResults(undefined, 'pending_review')
    }

    async markComplianceResultReviewed(id: string, reviewedBy: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            `UPDATE compliance_check_results SET status = 'reviewed', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
            [reviewedBy, id]
        )
    }

    async decideComplianceResult(id: string, decision: 'sanctioned' | 'cleared', reviewedBy: string): Promise<void> {
        if (!this.pool) return

        // 1. Get the result to know the entity/vessel
        const [results]: any[] = await this.pool.query(
            'SELECT entity_type as entityType, entity_id as entityId FROM compliance_check_results WHERE id = ?',
            [id]
        )
        if (results.length === 0) return
        const { entityType, entityId } = results[0]

        // 2. Update the result status and decision
        await this.pool.execute(
            `UPDATE compliance_check_results SET status = 'reviewed', decision = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
            [decision, reviewedBy, id]
        )

        // 3. Update the related vessel or entity
        if (decision === 'sanctioned') {
            const table = entityType === 'vessel' ? 'vessels' : 'entities'
            await this.pool.execute(
                `UPDATE ${table} SET ofac_status = 'SANCTIONED', ofac_match_found = 1 WHERE id = ?`,
                [entityId]
            )
        } else {
            // Decision is 'cleared'
            // We only clear the record if there are no OTHER pending or sanctioned matches for this entity
            const [otherMatches]: any[] = await this.pool.query(
                `SELECT id FROM compliance_check_results 
                 WHERE entity_type = ? AND entity_id = ? AND id != ? 
                 AND (status = 'pending_review' OR (status = 'reviewed' AND decision = 'sanctioned'))`,
                [entityType, entityId, id]
            )

            if (otherMatches.length === 0) {
                const table = entityType === 'vessel' ? 'vessels' : 'entities'
                await this.pool.execute(
                    `UPDATE ${table} SET ofac_status = 'CLEARED', ofac_match_found = 0 WHERE id = ?`,
                    [entityId]
                )
            }
        }
    }
    // --- Reminder Settings ---
    async getReminderSettings(): Promise<ReminderSettings> {
        const defaultTemplate = `Vessel: {vesselName} (IMO: {imoNumber})\n\nVessel Documents:\n{vesselDocuments}\n\nAssured Documents:\n{assuredDocuments}`
        const defaults: ReminderSettings = { periodDays: 7, reminderTemplate: defaultTemplate }
        const settingValue = await this.getSetting('reminder_settings')
        if (!settingValue) return defaults
        try {
            return { ...defaults, ...JSON.parse(settingValue) }
        } catch {
            return defaults
        }
    }

    async setReminderSettings(settings: ReminderSettings): Promise<void> {
        await this.setSetting('reminder_settings', JSON.stringify(settings))
    }

    async getVesselReminders(): Promise<VesselReminder[]> {
        if (!this.pool) return []

        // Get all active vessels with fleet info
        const [vessels]: any[] = await this.pool.query(
            `SELECT v.id, v.name, v.imo_number, v.fleet_id, f.name as fleet_name
             FROM vessels v
             LEFT JOIN fleets f ON v.fleet_id = f.id
             WHERE v.is_active = 1
             ORDER BY v.name`
        )

        // Get all required document types
        const [docTypes]: any[] = await this.pool.query(
            'SELECT id, name FROM document_types WHERE required = 1'
        )

        // Get all vessel documents
        const [vesselDocs]: any[] = await this.pool.query(
            'SELECT vessel_id, document_type_id, file_path, expiry_date FROM vessel_documents'
        )

        // Get all vessel assureds with entity info and role names
        const [assureds]: any[] = await this.pool.query(
            `SELECT va.id as assured_id, va.vessel_id, va.entity_id, va.role as role_name,
                    e.name as entity_name, e.type as entity_type,
                    e.passport_file_path, e.certificate_of_incorporation_path,
                    e.articles_of_association_path, e.kyc_file_path
             FROM vessel_assureds va
             JOIN entities e ON va.entity_id = e.id`
        )

        // Get active snoozes
        const [snoozes]: any[] = await this.pool.query(
            'SELECT vessel_id, snoozed_at, snoozed_by, snooze_until FROM vessel_reminder_snoozes WHERE snooze_until > NOW()'
        )

        const snoozeMap = new Map<string, { snoozedBy: string; snoozeUntil: string }>()
        for (const s of snoozes) {
            snoozeMap.set(s.vessel_id, { snoozedBy: s.snoozed_by, snoozeUntil: s.snooze_until })
        }

        // Build doc map: vesselId -> docTypeId -> { filePath, expiryDate }
        const docMap = new Map<string, Map<string, { filePath: string; expiryDate: string | null }>>()
        for (const d of vesselDocs) {
            if (!docMap.has(d.vessel_id)) docMap.set(d.vessel_id, new Map())
            docMap.get(d.vessel_id)!.set(d.document_type_id, {
                filePath: d.file_path || '',
                expiryDate: d.expiry_date
            })
        }

        // Build assured map: vesselId -> assured[]
        const assuredMap = new Map<string, any[]>()
        for (const a of assureds) {
            if (!assuredMap.has(a.vessel_id)) assuredMap.set(a.vessel_id, [])
            assuredMap.get(a.vessel_id)!.push(a)
        }

        const now = new Date()
        const reminders: VesselReminder[] = []

        for (const vessel of vessels) {
            const missingVesselDocs: { docTypeName: string; status: 'missing' | 'expired'; expiryDate?: string }[] = []
            const vesselDocMap = docMap.get(vessel.id) || new Map()

            // Check required vessel documents
            for (const dt of docTypes) {
                const doc = vesselDocMap.get(dt.id)
                if (!doc || !doc.filePath) {
                    missingVesselDocs.push({ docTypeName: dt.name, status: 'missing' })
                } else if (doc.expiryDate && new Date(doc.expiryDate) < now) {
                    missingVesselDocs.push({ docTypeName: dt.name, status: 'expired', expiryDate: doc.expiryDate })
                }
            }

            // Check assured entity documents
            const assuredAlerts: AssuredDocAlert[] = []
            const vesselAssureds = assuredMap.get(vessel.id) || []

            for (const a of vesselAssureds) {
                const missing: string[] = []

                if (a.entity_type === 'person') {
                    if (!a.passport_file_path) missing.push('ID/Passport')
                } else {
                    // company
                    if (!a.certificate_of_incorporation_path) missing.push('Certificate of Incorporation')
                    if (!a.articles_of_association_path) missing.push('Articles of Association')
                    if (!a.kyc_file_path) missing.push('KYC')
                }

                if (missing.length > 0) {
                    assuredAlerts.push({
                        assuredId: a.assured_id,
                        entityId: a.entity_id,
                        entityName: a.entity_name,
                        roleName: a.role_name,
                        entityType: a.entity_type,
                        missingDocs: missing
                    })
                }
            }

            const totalIssues = missingVesselDocs.length + assuredAlerts.reduce((sum, a) => sum + a.missingDocs.length, 0)

            if (totalIssues > 0) {
                const snooze = snoozeMap.get(vessel.id)
                reminders.push({
                    vesselId: vessel.id,
                    vesselName: vessel.name,
                    imoNumber: vessel.imo_number,
                    fleetId: vessel.fleet_id || null,
                    fleetName: vessel.fleet_name || null,
                    missingVesselDocs,
                    assuredAlerts,
                    isSnoozed: !!snooze,
                    snoozeUntil: snooze?.snoozeUntil,
                    snoozedBy: snooze?.snoozedBy,
                    totalIssues
                })
            }
        }

        return reminders
    }

    async snoozeVessel(vesselId: string, username: string, periodDays: number): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            `INSERT INTO vessel_reminder_snoozes (vessel_id, snoozed_at, snoozed_by, snooze_until)
             VALUES (?, NOW(), ?, DATE_ADD(NOW(), INTERVAL ? DAY))
             ON DUPLICATE KEY UPDATE snoozed_at = NOW(), snoozed_by = ?, snooze_until = DATE_ADD(NOW(), INTERVAL ? DAY)`,
            [vesselId, username, periodDays, username, periodDays]
        )
    }

    async unsnoozeVessel(vesselId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_reminder_snoozes WHERE vessel_id = ?', [vesselId])
    }

    async autoSnoozeVessel(vesselId: string): Promise<void> {
        const settings = await this.getReminderSettings()
        await this.snoozeVessel(vesselId, 'system', settings.periodDays)
    }

    async autoSnoozeVesselsForEntity(entityId: string): Promise<void> {
        if (!this.pool) return
        const [rows]: any[] = await this.pool.query(
            'SELECT DISTINCT vessel_id FROM vessel_assureds WHERE entity_id = ?',
            [entityId]
        )
        for (const row of rows) {
            await this.autoSnoozeVessel(row.vessel_id)
        }
    }

    // --- Policy Types ---
    async getPolicyTypes(): Promise<PolicyType[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, order_index as `order` FROM policy_types ORDER BY order_index ASC')
        return rows as PolicyType[]
    }

    async addPolicyType(name: string): Promise<PolicyType> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM policy_types')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO policy_types (id, name, order_index) VALUES (?, ?, ?)', [id, name, order])
        return { id, name, order }
    }

    async updatePolicyType(id: string, updates: { name?: string }): Promise<void> {
        if (!this.pool) return
        if (updates.name !== undefined) {
            await this.pool.execute('UPDATE policy_types SET name = ? WHERE id = ?', [updates.name, id])
        }
    }

    async deletePolicyType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM policy_types WHERE id = ?', [id])
    }

    async reorderPolicyTypes(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE policy_types SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // --- Vessel Policies ---
    async getVesselPolicies(vesselId: string): Promise<VesselPolicy[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, vessel_id as vesselId, policy_type_id as policyTypeId FROM vessel_policies WHERE vessel_id = ?',
            [vesselId]
        )
        return rows as VesselPolicy[]
    }

    async addVesselPolicy(vesselId: string, policyTypeId: string): Promise<VesselPolicy> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO vessel_policies (id, vessel_id, policy_type_id) VALUES (?, ?, ?)',
            [id, vesselId, policyTypeId]
        )
        return { id, vesselId, policyTypeId }
    }

    async deleteVesselPolicy(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_policies WHERE id = ?', [id])
    }

    // --- Dynamic Address Book Query ---
    async queryDAB(criteria: DABQueryCriteria): Promise<any[]> {
        if (!this.pool) return []

        // Build a query that finds entities matching the criteria via their vessel associations
        // We need: entity name, type, email, phone, associated vessel names
        const conditions: string[] = []
        const params: any[] = []

        if (criteria.policyTypeIds && criteria.policyTypeIds.length > 0) {
            const placeholders = criteria.policyTypeIds.map(() => '?').join(',')
            conditions.push(`v.id IN (SELECT vessel_id FROM vessel_policies WHERE policy_type_id IN (${placeholders}))`)
            params.push(...criteria.policyTypeIds)
        }

        if (criteria.flagStateIds && criteria.flagStateIds.length > 0 && criteria.flagStateUnassigned) {
            const placeholders = criteria.flagStateIds.map(() => '?').join(',')
            conditions.push(`(v.flag_state_id IN (${placeholders}) OR v.flag_state_id IS NULL)`)
            params.push(...criteria.flagStateIds)
        } else if (criteria.flagStateIds && criteria.flagStateIds.length > 0) {
            const placeholders = criteria.flagStateIds.map(() => '?').join(',')
            conditions.push(`v.flag_state_id IN (${placeholders})`)
            params.push(...criteria.flagStateIds)
        } else if (criteria.flagStateUnassigned) {
            conditions.push(`v.flag_state_id IS NULL`)
        }

        if (criteria.customerIds && criteria.customerIds.length > 0) {
            const placeholders = criteria.customerIds.map(() => '?').join(',')
            conditions.push(`v.customer_id IN (${placeholders})`)
            params.push(...criteria.customerIds)
        }

        if (criteria.customerType && criteria.customerType !== 'both') {
            conditions.push(`v.customer_type = ?`)
            params.push(criteria.customerType)
        }

        if (conditions.length === 0) return []

        const logicOp = criteria.logic === 'OR' ? ' OR ' : ' AND '
        const whereClause = conditions.join(logicOp)

        // Vessel status filter
        let statusFilter = 'v.is_active = TRUE'
        if (criteria.vesselStatus === 'inactive') statusFilter = 'v.is_active = FALSE'
        else if (criteria.vesselStatus === 'all') statusFilter = '1=1'

        const [rows] = await this.pool.query(`
            SELECT DISTINCT
                e.id as entityId,
                e.name as entityName,
                e.type as entityType,
                e.email,
                e.phone,
                GROUP_CONCAT(DISTINCT v.name ORDER BY v.name SEPARATOR ', ') as vesselNames
            FROM entities e
            INNER JOIN vessel_assureds va ON va.entity_id = e.id
            INNER JOIN vessels v ON v.id = va.vessel_id
            WHERE ${statusFilter} AND (${whereClause})
            GROUP BY e.id, e.name, e.type, e.email, e.phone
            ORDER BY e.name
        `, params)

        // Also include customer entities (those assigned directly to vessels, not via vessel_assureds)
        const [customerRows] = await this.pool.query(`
            SELECT DISTINCT
                e.id as entityId,
                e.name as entityName,
                e.type as entityType,
                e.email,
                e.phone,
                GROUP_CONCAT(DISTINCT v.name ORDER BY v.name SEPARATOR ', ') as vesselNames
            FROM entities e
            INNER JOIN vessels v ON v.customer_id = e.id
            WHERE ${statusFilter} AND (${whereClause})
            GROUP BY e.id, e.name, e.type, e.email, e.phone
            ORDER BY e.name
        `, params)

        // Build set of customer entity IDs and broker entity IDs
        const customerEntityIds = new Set<string>()
        const brokerEntityIds = new Set<string>()
        try {
            const [custRows] = await this.pool.query('SELECT DISTINCT customer_id FROM vessels WHERE customer_id IS NOT NULL')
            for (const r of (custRows as any[])) customerEntityIds.add(r.customer_id)
            const [brokerRows] = await this.pool.query('SELECT DISTINCT broker_entity_id FROM vessel_dynamic_policies WHERE broker_entity_id IS NOT NULL')
            for (const r of (brokerRows as any[])) brokerEntityIds.add(r.broker_entity_id)
        } catch { /* tables may not exist yet */ }

        // Merge results, deduplicating by entityId
        const resultMap = new Map<string, any>()
        for (const row of (rows as any[])) {
            row.isCustomer = customerEntityIds.has(row.entityId)
            row.isBroker = brokerEntityIds.has(row.entityId)
            resultMap.set(row.entityId, row)
        }
        for (const row of (customerRows as any[])) {
            row.isCustomer = customerEntityIds.has(row.entityId)
            row.isBroker = brokerEntityIds.has(row.entityId)
            if (resultMap.has(row.entityId)) {
                // Merge vessel names
                const existing = resultMap.get(row.entityId)
                const existingVessels = new Set(existing.vesselNames.split(', '))
                const newVessels = row.vesselNames.split(', ')
                for (const v of newVessels) existingVessels.add(v)
                existing.vesselNames = Array.from(existingVessels).sort().join(', ')
            } else {
                resultMap.set(row.entityId, row)
            }
        }

        return Array.from(resultMap.values()).sort((a, b) => a.entityName.localeCompare(b.entityName))
    }

    // ==================== P&I Clauses ====================

    async getPIClauses(): Promise<PIClause[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, clause_number as clauseNumber, name, description, is_cargo_related as isCargoRelated, order_index as `order` FROM pi_clauses ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, isCargoRelated: Boolean(r.isCargoRelated) }))
    }

    async addPIClause(clause: Omit<PIClause, 'id'>): Promise<PIClause> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_clauses')
        const order = maxRow[0].nextOrder
        await this.pool.execute(
            'INSERT INTO pi_clauses (id, clause_number, name, description, is_cargo_related, order_index) VALUES (?, ?, ?, ?, ?, ?)',
            [id, clause.clauseNumber, clause.name, clause.description || null, clause.isCargoRelated || false, order]
        )
        return { ...clause, id, order }
    }

    async updatePIClause(id: string, updates: Partial<PIClause>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.clauseNumber !== undefined) { fields.push('clause_number = ?'); values.push(updates.clauseNumber) }
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.isCargoRelated !== undefined) { fields.push('is_cargo_related = ?'); values.push(updates.isCargoRelated) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE pi_clauses SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePIClause(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_clauses WHERE id = ?', [id])
    }

    async reorderPIClauses(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_clauses SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Clause Sets ====================

    async getPIClauseSets(): Promise<PIClauseSet[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name FROM pi_clause_sets ORDER BY name ASC')
        const sets = rows as PIClauseSet[]
        for (const set of sets) {
            const [items] = await this.pool.query('SELECT clause_id FROM pi_clause_set_items WHERE set_id = ?', [set.id])
            set.clauseIds = (items as any[]).map(i => i.clause_id)
        }
        return sets
    }

    async addPIClauseSet(name: string, clauseIds: string[]): Promise<PIClauseSet> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO pi_clause_sets (id, name) VALUES (?, ?)', [id, name])
        for (const clauseId of clauseIds) {
            await this.pool.execute('INSERT INTO pi_clause_set_items (id, set_id, clause_id) VALUES (?, ?, ?)', [uuidv4(), id, clauseId])
        }
        return { id, name, clauseIds }
    }

    async updatePIClauseSet(id: string, name: string, clauseIds: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_clause_sets SET name = ? WHERE id = ?', [name, id])
        await this.pool.execute('DELETE FROM pi_clause_set_items WHERE set_id = ?', [id])
        for (const clauseId of clauseIds) {
            await this.pool.execute('INSERT INTO pi_clause_set_items (id, set_id, clause_id) VALUES (?, ?, ?)', [uuidv4(), id, clauseId])
        }
    }

    async deletePIClauseSet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_clause_sets WHERE id = ?', [id])
    }

    // ==================== P&I Warranties ====================

    async getPIWarranties(): Promise<PIWarranty[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text, is_cargo_related as isCargoRelated, default_selected as defaultSelected, order_index as `order` FROM pi_warranties ORDER BY order_index ASC')
        const warranties = (rows as any[]).map(r => ({
            ...r,
            isCargoRelated: Boolean(r.isCargoRelated),
            defaultSelected: Boolean(r.defaultSelected),
            tagIds: [] as string[]
        }))
        // Load tag assignments
        if (warranties.length > 0) {
            const [tagRows] = await this.pool.query('SELECT warranty_id, tag_id FROM pi_warranty_tag_assignments')
            for (const tr of tagRows as any[]) {
                const w = warranties.find(w => w.id === tr.warranty_id)
                if (w) w.tagIds.push(tr.tag_id)
            }
        }
        return warranties
    }

    async addPIWarranty(warranty: Omit<PIWarranty, 'id'>): Promise<PIWarranty> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_warranties')
        const order = maxRow[0].nextOrder
        await this.pool.execute(
            'INSERT INTO pi_warranties (id, text, is_cargo_related, default_selected, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, warranty.text, warranty.isCargoRelated || false, warranty.defaultSelected || false, order]
        )
        // Save tag assignments
        if (warranty.tagIds && warranty.tagIds.length > 0) {
            for (const tagId of warranty.tagIds) {
                await this.pool.execute('INSERT IGNORE INTO pi_warranty_tag_assignments (warranty_id, tag_id) VALUES (?, ?)', [id, tagId])
            }
        }
        return { ...warranty, id, order }
    }

    async updatePIWarranty(id: string, updates: Partial<PIWarranty>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.isCargoRelated !== undefined) { fields.push('is_cargo_related = ?'); values.push(updates.isCargoRelated) }
        if (updates.defaultSelected !== undefined) { fields.push('default_selected = ?'); values.push(updates.defaultSelected) }
        if (fields.length > 0) {
            values.push(id)
            await this.pool.execute(`UPDATE pi_warranties SET ${fields.join(', ')} WHERE id = ?`, values)
        }
        // Update tag assignments if provided
        if (updates.tagIds !== undefined) {
            await this.pool.execute('DELETE FROM pi_warranty_tag_assignments WHERE warranty_id = ?', [id])
            for (const tagId of updates.tagIds) {
                await this.pool.execute('INSERT INTO pi_warranty_tag_assignments (warranty_id, tag_id) VALUES (?, ?)', [id, tagId])
            }
        }
    }

    async deletePIWarranty(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_warranties WHERE id = ?', [id])
    }

    async reorderPIWarranties(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_warranties SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Deductibles ====================

    async getPIDeductibles(): Promise<PIDeductible[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, description, default_amount as defaultAmount, default_currency as defaultCurrency, has_secondary as hasSecondary, secondary_description as secondaryDescription, secondary_default_amount as secondaryDefaultAmount, order_index as `order` FROM pi_deductibles ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, hasSecondary: Boolean(r.hasSecondary), defaultAmount: Number(r.defaultAmount), secondaryDefaultAmount: r.secondaryDefaultAmount ? Number(r.secondaryDefaultAmount) : undefined }))
    }

    async addPIDeductible(ded: Omit<PIDeductible, 'id'>): Promise<PIDeductible> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_deductibles')
        const order = maxRow[0].nextOrder
        await this.pool.execute(
            'INSERT INTO pi_deductibles (id, description, default_amount, default_currency, has_secondary, secondary_description, secondary_default_amount, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, ded.description, ded.defaultAmount, ded.defaultCurrency || 'USD', ded.hasSecondary || false, ded.secondaryDescription || null, ded.secondaryDefaultAmount || null, order]
        )
        return { ...ded, id, order }
    }

    async updatePIDeductible(id: string, updates: Partial<PIDeductible>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.defaultAmount !== undefined) { fields.push('default_amount = ?'); values.push(updates.defaultAmount) }
        if (updates.defaultCurrency !== undefined) { fields.push('default_currency = ?'); values.push(updates.defaultCurrency) }
        if (updates.hasSecondary !== undefined) { fields.push('has_secondary = ?'); values.push(updates.hasSecondary) }
        if (updates.secondaryDescription !== undefined) { fields.push('secondary_description = ?'); values.push(updates.secondaryDescription) }
        if (updates.secondaryDefaultAmount !== undefined) { fields.push('secondary_default_amount = ?'); values.push(updates.secondaryDefaultAmount) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE pi_deductibles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePIDeductible(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_deductibles WHERE id = ?', [id])
    }

    async reorderPIDeductibles(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_deductibles SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Deductible Sets ====================

    async getPIDeductibleSets(): Promise<PIDeductibleSet[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name FROM pi_deductible_sets ORDER BY name ASC')
        return rows as PIDeductibleSet[]
    }

    async getPIDeductibleSetItems(setId: string): Promise<PIDeductibleSetItem[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, set_id as setId, deductible_id as deductibleId, amount, currency, secondary_amount as secondaryAmount FROM pi_deductible_set_items WHERE set_id = ?',
            [setId]
        )
        return (rows as any[]).map(r => ({ ...r, amount: Number(r.amount), secondaryAmount: r.secondaryAmount ? Number(r.secondaryAmount) : undefined }))
    }

    async addPIDeductibleSet(name: string, items: { deductibleId: string; amount: number; currency: string; secondaryAmount?: number }[]): Promise<PIDeductibleSet> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO pi_deductible_sets (id, name) VALUES (?, ?)', [id, name])
        for (const item of items) {
            await this.pool.execute(
                'INSERT INTO pi_deductible_set_items (id, set_id, deductible_id, amount, currency, secondary_amount) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), id, item.deductibleId, item.amount, item.currency || 'USD', item.secondaryAmount || null]
            )
        }
        return { id, name }
    }

    async updatePIDeductibleSet(id: string, name: string, items: { deductibleId: string; amount: number; currency: string; secondaryAmount?: number }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_deductible_sets SET name = ? WHERE id = ?', [name, id])
        await this.pool.execute('DELETE FROM pi_deductible_set_items WHERE set_id = ?', [id])
        for (const item of items) {
            await this.pool.execute(
                'INSERT INTO pi_deductible_set_items (id, set_id, deductible_id, amount, currency, secondary_amount) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), id, item.deductibleId, item.amount, item.currency || 'USD', item.secondaryAmount || null]
            )
        }
    }

    async deletePIDeductibleSet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_deductible_sets WHERE id = ?', [id])
    }

    // ==================== P&I Exclusions ====================

    async getPIExclusions(): Promise<PIExclusion[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text, order_index as `order` FROM pi_exclusions ORDER BY order_index ASC')
        return rows as PIExclusion[]
    }

    async addPIExclusion(text: string): Promise<PIExclusion> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_exclusions')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO pi_exclusions (id, text, order_index) VALUES (?, ?, ?)', [id, text, order])
        return { id, text, order }
    }

    async updatePIExclusion(id: string, text: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_exclusions SET text = ? WHERE id = ?', [text, id])
    }

    async deletePIExclusion(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_exclusions WHERE id = ?', [id])
    }

    async reorderPIExclusions(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_exclusions SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Sub-Limit Templates ====================

    async getPISubLimitTemplates(): Promise<PISubLimitTemplate[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text_template as textTemplate, default_amount as defaultAmount, default_currency as defaultCurrency, order_index as `order` FROM pi_sub_limit_templates ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, defaultAmount: Number(r.defaultAmount) }))
    }

    async addPISubLimitTemplate(tmpl: Omit<PISubLimitTemplate, 'id'>): Promise<PISubLimitTemplate> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_sub_limit_templates')
        const order = maxRow[0].nextOrder
        await this.pool.execute(
            'INSERT INTO pi_sub_limit_templates (id, text_template, default_amount, default_currency, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, tmpl.textTemplate, tmpl.defaultAmount, tmpl.defaultCurrency || 'USD', order]
        )
        return { ...tmpl, id, order }
    }

    async updatePISubLimitTemplate(id: string, updates: Partial<PISubLimitTemplate>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.textTemplate !== undefined) { fields.push('text_template = ?'); values.push(updates.textTemplate) }
        if (updates.defaultAmount !== undefined) { fields.push('default_amount = ?'); values.push(updates.defaultAmount) }
        if (updates.defaultCurrency !== undefined) { fields.push('default_currency = ?'); values.push(updates.defaultCurrency) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE pi_sub_limit_templates SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePISubLimitTemplate(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_sub_limit_templates WHERE id = ?', [id])
    }

    async reorderPISubLimitTemplates(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_sub_limit_templates SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Additional Clauses ====================

    async getPIAdditionalClauses(): Promise<PIAdditionalClause[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text, order_index as `order` FROM pi_additional_clauses ORDER BY order_index ASC')
        return rows as PIAdditionalClause[]
    }

    async addPIAdditionalClause(text: string): Promise<PIAdditionalClause> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_additional_clauses')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO pi_additional_clauses (id, text, order_index) VALUES (?, ?, ?)', [id, text, order])
        return { id, text, order }
    }

    async updatePIAdditionalClause(id: string, text: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_additional_clauses SET text = ? WHERE id = ?', [text, id])
    }

    async deletePIAdditionalClause(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_additional_clauses WHERE id = ?', [id])
    }

    async reorderPIAdditionalClauses(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_additional_clauses SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Trading Excluded Countries ====================

    async getTradingExcludedCountries(): Promise<TradingExcludedCountry[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, iso3_code as iso3Code, list_type as listType FROM trading_excluded_countries ORDER BY name ASC')
        return rows as TradingExcludedCountry[]
    }

    async addTradingExcludedCountry(country: Omit<TradingExcludedCountry, 'id'>): Promise<TradingExcludedCountry> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO trading_excluded_countries (id, name, iso3_code, list_type) VALUES (?, ?, ?, ?)',
            [id, country.name, country.iso3Code, country.listType]
        )
        return { ...country, id }
    }

    async updateTradingExcludedCountry(id: string, updates: Partial<TradingExcludedCountry>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.iso3Code !== undefined) { fields.push('iso3_code = ?'); values.push(updates.iso3Code) }
        if (updates.listType !== undefined) { fields.push('list_type = ?'); values.push(updates.listType) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE trading_excluded_countries SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteTradingExcludedCountry(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM trading_excluded_countries WHERE id = ?', [id])
    }

    // ==================== Quotations ====================

    async getQuotations(): Promise<Quotation[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT q.id, q.reference_number as referenceNumber, q.quotation_date as quotationDate,
                q.policy_type_id as policyTypeId, pt.name as policyTypeName,
                q.vessel_id as vesselId, v.name as vesselName,
                q.is_renewal as isRenewal, q.status,
                q.period_text as periodText,
                q.limit_of_liability_amount as limitOfLiabilityAmount,
                q.limit_of_liability_currency as limitOfLiabilityCurrency,
                q.limit_of_liability_text as limitOfLiabilityText,
                q.premium_amount as premiumAmount, q.premium_currency as premiumCurrency,
                q.num_instalments as numInstalments,
                q.trading_warranty_intro as tradingWarrantyIntro,
                q.trading_show_ddq_list as tradingShowDdqList,
                q.trading_show_ddq_warranties as tradingShowDdqWarranties,
                q.trading_show_israel as tradingShowIsrael,
                q.trading_custom_text as tradingCustomText,
                q.sanctions_clause_version as sanctionsClauseVersion,
                q.vdr_deductible_enabled as vdrDeductibleEnabled,
                q.deductible_aggregate_text as deductibleAggregateText,
                q.validity_days as validityDays,
                q.premium_additional_text as premiumAdditionalText,
                q.ncb_enabled as ncbEnabled, q.ncb_discount_percent as ncbDiscountPercent, q.ncb_text as ncbText,
                q.cpc_enabled as cpcEnabled, q.cpc_discount_percent as cpcDiscountPercent, q.cpc_text as cpcText,
                q.discount_percent as discountPercent, q.discount_label as discountLabel,
                q.section_texts_override as sectionTextsOverrideRaw, q.sanctions_text_override as sanctionsTextOverride,
                q.created_at as createdAt, q.updated_at as updatedAt, q.created_by as createdBy
            FROM quotations q
            LEFT JOIN policy_types pt ON q.policy_type_id = pt.id
            LEFT JOIN vessels v ON q.vessel_id = v.id
            ORDER BY q.created_at DESC
        `)
        return (rows as any[]).map(r => ({
            ...r,
            isRenewal: Boolean(r.isRenewal),
            vdrDeductibleEnabled: Boolean(r.vdrDeductibleEnabled),
            ncbEnabled: Boolean(r.ncbEnabled),
            cpcEnabled: Boolean(r.cpcEnabled),
            tradingShowDdqList: r.tradingShowDdqList == null ? true : Boolean(r.tradingShowDdqList),
            tradingShowDdqWarranties: r.tradingShowDdqWarranties == null ? true : Boolean(r.tradingShowDdqWarranties),
            tradingShowIsrael: r.tradingShowIsrael == null ? true : Boolean(r.tradingShowIsrael),
            limitOfLiabilityAmount: r.limitOfLiabilityAmount ? Number(r.limitOfLiabilityAmount) : undefined,
            premiumAmount: r.premiumAmount ? Number(r.premiumAmount) : undefined,
            ncbDiscountPercent: r.ncbDiscountPercent ? Number(r.ncbDiscountPercent) : undefined,
            cpcDiscountPercent: r.cpcDiscountPercent ? Number(r.cpcDiscountPercent) : undefined,
            discountPercent: r.discountPercent ? Number(r.discountPercent) : undefined,
            validityDays: r.validityDays ? Number(r.validityDays) : 14,
            sectionTextsOverride: r.sectionTextsOverrideRaw ? (() => { try { return JSON.parse(r.sectionTextsOverrideRaw) } catch { return undefined } })() : undefined,
            sectionTextsOverrideRaw: undefined
        }))
    }

    async addQuotation(q: Partial<Quotation>): Promise<Quotation> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(`
            INSERT INTO quotations (id, reference_number, quotation_date, policy_type_id, vessel_id, is_renewal, status, period_text, validity_days, sanctions_clause_version, vdr_deductible_enabled, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, q.referenceNumber || null, q.quotationDate || null, q.policyTypeId || null, q.vesselId || null,
            q.isRenewal || false, q.status || 'draft', q.periodText || null, q.validityDays || 14,
            q.sanctionsClauseVersion || 'standard', q.vdrDeductibleEnabled !== false, q.createdBy || null
        ])
        return { ...q, id, status: q.status || 'draft', sanctionsClauseVersion: q.sanctionsClauseVersion || 'standard', vdrDeductibleEnabled: q.vdrDeductibleEnabled !== false, validityDays: q.validityDays || 14, isRenewal: q.isRenewal || false, ncbEnabled: q.ncbEnabled || false, cpcEnabled: q.cpcEnabled || false, referenceNumber: q.referenceNumber || '' } as Quotation
    }

    async updateQuotation(id: string, updates: Partial<Quotation>): Promise<void> {
        if (!this.pool) return
        const fieldMap: Record<string, string> = {
            referenceNumber: 'reference_number', quotationDate: 'quotation_date', policyTypeId: 'policy_type_id',
            vesselId: 'vessel_id', isRenewal: 'is_renewal', status: 'status', periodText: 'period_text',
            limitOfLiabilityAmount: 'limit_of_liability_amount', limitOfLiabilityCurrency: 'limit_of_liability_currency',
            limitOfLiabilityText: 'limit_of_liability_text', premiumAmount: 'premium_amount', premiumCurrency: 'premium_currency',
            numInstalments: 'num_instalments', tradingWarrantyIntro: 'trading_warranty_intro',
            tradingShowDdqList: 'trading_show_ddq_list', tradingShowDdqWarranties: 'trading_show_ddq_warranties',
            tradingShowIsrael: 'trading_show_israel', tradingCustomText: 'trading_custom_text',
            sanctionsClauseVersion: 'sanctions_clause_version', vdrDeductibleEnabled: 'vdr_deductible_enabled',
            deductibleAggregateText: 'deductible_aggregate_text', validityDays: 'validity_days',
            premiumAdditionalText: 'premium_additional_text',
            ncbEnabled: 'ncb_enabled', ncbDiscountPercent: 'ncb_discount_percent', ncbText: 'ncb_text',
            cpcEnabled: 'cpc_enabled', cpcDiscountPercent: 'cpc_discount_percent', cpcText: 'cpc_text',
            discountPercent: 'discount_percent', discountLabel: 'discount_label',
            sanctionsTextOverride: 'sanctions_text_override'
        }
        const fields: string[] = []
        const values: any[] = []
        for (const [key, col] of Object.entries(fieldMap)) {
            if ((updates as any)[key] !== undefined) {
                fields.push(`${col} = ?`)
                values.push((updates as any)[key] ?? null)
            }
        }
        // Handle JSON-serialized sectionTextsOverride
        if (updates.sectionTextsOverride !== undefined) {
            fields.push('section_texts_override = ?')
            values.push(updates.sectionTextsOverride ? JSON.stringify(updates.sectionTextsOverride) : null)
        }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotations SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotation(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotations WHERE id = ?', [id])
    }

    // ==================== Quotation Sub-Tables ====================

    // -- Quotation Assureds --
    async getQuotationAssureds(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT qa.id, qa.quotation_id as quotationId, qa.entity_id as entityId, qa.name, qa.role, qa.order_index as 'order'
             FROM quotation_assureds qa WHERE qa.quotation_id = ? ORDER BY qa.order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationAssured(data: { quotationId: string; entityId?: string; name: string; role?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_assureds (id, quotation_id, entity_id, name, role, order_index) VALUES (?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.entityId || null, data.name, data.role || null, data.order || 0])
        return { id, ...data }
    }

    async updateQuotationAssured(id: string, updates: { name?: string; role?: string; order?: number }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_assureds SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationAssured(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_assureds WHERE id = ?', [id])
    }

    async reorderQuotationAssureds(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_assureds SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // -- Quotation New Vessel --
    async getQuotationNewVessel(quotationId: string): Promise<any | null> {
        if (!this.pool) return null
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, name, imo_number as imoNumber, built_year as builtYear,
                gross_tonnage as grossTonnage, flag, vessel_type as vesselType, classification, call_sign as callSign
             FROM quotation_new_vessels WHERE quotation_id = ?`, [quotationId])
        const arr = rows as any[]
        return arr.length > 0 ? { ...arr[0], builtYear: arr[0].builtYear ? Number(arr[0].builtYear) : undefined, grossTonnage: arr[0].grossTonnage ? Number(arr[0].grossTonnage) : undefined } : null
    }

    async upsertQuotationNewVessel(quotationId: string, data: any): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const existing = await this.getQuotationNewVessel(quotationId)
        if (existing) {
            await this.pool.execute(
                `UPDATE quotation_new_vessels SET name=?, imo_number=?, built_year=?, gross_tonnage=?, flag=?, vessel_type=?, classification=?, call_sign=? WHERE quotation_id=?`,
                [data.name, data.imoNumber || null, data.builtYear || null, data.grossTonnage || null, data.flag || null, data.vesselType || null, data.classification || null, data.callSign || null, quotationId])
            return { ...existing, ...data }
        } else {
            const id = uuidv4()
            await this.pool.execute(
                `INSERT INTO quotation_new_vessels (id, quotation_id, name, imo_number, built_year, gross_tonnage, flag, vessel_type, classification, call_sign) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, quotationId, data.name, data.imoNumber || null, data.builtYear || null, data.grossTonnage || null, data.flag || null, data.vesselType || null, data.classification || null, data.callSign || null])
            return { id, quotationId, ...data }
        }
    }

    async deleteQuotationNewVessel(quotationId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_new_vessels WHERE quotation_id = ?', [quotationId])
    }

    // -- Quotation Sub-Limits --
    async getQuotationSubLimits(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, text, amount, currency FROM quotation_sub_limits WHERE quotation_id = ?`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, amount: Number(r.amount) }))
    }

    async addQuotationSubLimit(data: { quotationId: string; text: string; amount: number; currency: string }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_sub_limits (id, quotation_id, text, amount, currency) VALUES (?, ?, ?, ?, ?)',
            [id, data.quotationId, data.text, data.amount, data.currency])
        return { id, ...data }
    }

    async updateQuotationSubLimit(id: string, updates: { text?: string; amount?: number; currency?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount) }
        if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_sub_limits SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationSubLimit(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_sub_limits WHERE id = ?', [id])
    }

    // -- Quotation Clauses --
    async getQuotationClauses(quotationId: string): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT pi_clause_id FROM quotation_clauses WHERE quotation_id = ?', [quotationId])
        return (rows as any[]).map(r => r.pi_clause_id)
    }

    async getQuotationClauseOverrides(quotationId: string): Promise<Record<string, string>> {
        if (!this.pool) return {}
        const [rows] = await this.pool.query('SELECT pi_clause_id, description_override FROM quotation_clauses WHERE quotation_id = ? AND description_override IS NOT NULL', [quotationId])
        const overrides: Record<string, string> = {}
        for (const r of rows as any[]) {
            if (r.description_override) overrides[r.pi_clause_id] = r.description_override
        }
        return overrides
    }

    async setQuotationClauses(quotationId: string, clauseIds: string[], descriptionOverrides?: Record<string, string>): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_clauses WHERE quotation_id = ?', [quotationId])
        for (const cid of clauseIds) {
            const override = descriptionOverrides?.[cid] || null
            await this.pool.execute('INSERT INTO quotation_clauses (id, quotation_id, pi_clause_id, description_override) VALUES (?, ?, ?, ?)', [uuidv4(), quotationId, cid, override])
        }
    }

    async updateQuotationClauseOverride(quotationId: string, clauseId: string, descriptionOverride: string | null): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE quotation_clauses SET description_override = ? WHERE quotation_id = ? AND pi_clause_id = ?', [descriptionOverride, quotationId, clauseId])
    }

    // -- Quotation Additional Clauses --
    async getQuotationAdditionalClauses(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_additional_clause_id as piAdditionalClauseId, custom_text as customText, order_index as 'order'
             FROM quotation_additional_clauses WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationAdditionalClause(data: { quotationId: string; piAdditionalClauseId?: string; customText?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_additional_clauses (id, quotation_id, pi_additional_clause_id, custom_text, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, data.quotationId, data.piAdditionalClauseId || null, data.customText || null, data.order || 0])
        return { id, ...data }
    }

    async deleteQuotationAdditionalClause(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_additional_clauses WHERE id = ?', [id])
    }

    // -- Quotation Warranties --
    async getQuotationWarranties(quotationId: string): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT pi_warranty_id FROM quotation_warranties WHERE quotation_id = ?', [quotationId])
        return (rows as any[]).map(r => r.pi_warranty_id)
    }

    async setQuotationWarranties(quotationId: string, warrantyIds: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_warranties WHERE quotation_id = ?', [quotationId])
        for (const wid of warrantyIds) {
            await this.pool.execute('INSERT INTO quotation_warranties (id, quotation_id, pi_warranty_id) VALUES (?, ?, ?)', [uuidv4(), quotationId, wid])
        }
    }

    // -- Quotation Deductibles --
    async getQuotationDeductibles(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_deductible_id as piDeductibleId, description, amount, currency,
                secondary_amount as secondaryAmount, secondary_description as secondaryDescription, order_index as 'order'
             FROM quotation_deductibles WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, amount: Number(r.amount), secondaryAmount: r.secondaryAmount ? Number(r.secondaryAmount) : undefined }))
    }

    async addQuotationDeductible(data: { quotationId: string; piDeductibleId?: string; description: string; amount: number; currency: string; secondaryAmount?: number; secondaryDescription?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_deductibles (id, quotation_id, pi_deductible_id, description, amount, currency, secondary_amount, secondary_description, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.piDeductibleId || null, data.description, data.amount, data.currency, data.secondaryAmount || null, data.secondaryDescription || null, data.order || 0])
        return { id, ...data }
    }

    async updateQuotationDeductible(id: string, updates: { description?: string; amount?: number; currency?: string; secondaryAmount?: number; secondaryDescription?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount) }
        if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency) }
        if (updates.secondaryAmount !== undefined) { fields.push('secondary_amount = ?'); values.push(updates.secondaryAmount) }
        if (updates.secondaryDescription !== undefined) { fields.push('secondary_description = ?'); values.push(updates.secondaryDescription) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_deductibles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationDeductible(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_deductibles WHERE id = ?', [id])
    }

    // -- Quotation Text Deductibles --
    async getQuotationTextDeductibles(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, text, order_index as 'order' FROM quotation_text_deductibles WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationTextDeductible(data: { quotationId: string; text: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_text_deductibles (id, quotation_id, text, order_index) VALUES (?, ?, ?, ?)',
            [id, data.quotationId, data.text, data.order || 0])
        return { id, ...data }
    }

    async deleteQuotationTextDeductible(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_text_deductibles WHERE id = ?', [id])
    }

    // -- Quotation Exclusions --
    async getQuotationExclusions(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_exclusion_id as piExclusionId, custom_text as customText
             FROM quotation_exclusions WHERE quotation_id = ?`, [quotationId])
        return rows as any[]
    }

    async setQuotationExclusions(quotationId: string, items: { piExclusionId?: string; customText?: string }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_exclusions WHERE quotation_id = ?', [quotationId])
        for (const item of items) {
            await this.pool.execute('INSERT INTO quotation_exclusions (id, quotation_id, pi_exclusion_id, custom_text) VALUES (?, ?, ?, ?)',
                [uuidv4(), quotationId, item.piExclusionId || null, item.customText || null])
        }
    }

    // -- Quotation Excluded Countries --
    async getQuotationExcludedCountries(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, name, list_type as listType FROM quotation_excluded_countries WHERE quotation_id = ?`, [quotationId])
        return rows as any[]
    }

    async setQuotationExcludedCountries(quotationId: string, countries: { name: string; listType: string }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_excluded_countries WHERE quotation_id = ?', [quotationId])
        for (const c of countries) {
            await this.pool.execute('INSERT INTO quotation_excluded_countries (id, quotation_id, name, list_type) VALUES (?, ?, ?, ?)',
                [uuidv4(), quotationId, c.name, c.listType])
        }
    }

    // -- Quotation Subjectivities --
    async getQuotationSubjectivities(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, text, order_index as 'order' FROM quotation_subjectivities WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationSubjectivity(data: { quotationId: string; text: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_subjectivities (id, quotation_id, text, order_index) VALUES (?, ?, ?, ?)',
            [id, data.quotationId, data.text, data.order || 0])
        return { id, ...data }
    }

    async updateQuotationSubjectivity(id: string, text: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE quotation_subjectivities SET text = ? WHERE id = ?', [text, id])
    }

    async deleteQuotationSubjectivity(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_subjectivities WHERE id = ?', [id])
    }

    // -- Quotation Instalments --
    async getQuotationInstalments(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, instalment_number as instalmentNumber, days_from_inception as daysFromInception, description, non_refundable as nonRefundable, non_refundable_percent as nonRefundablePercent
             FROM quotation_instalments WHERE quotation_id = ? ORDER BY instalment_number`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, instalmentNumber: Number(r.instalmentNumber), daysFromInception: Number(r.daysFromInception), nonRefundable: Boolean(r.nonRefundable), nonRefundablePercent: r.nonRefundablePercent ? Number(r.nonRefundablePercent) : undefined }))
    }

    async setQuotationInstalments(quotationId: string, instalments: { instalmentNumber: number; daysFromInception: number; description?: string; nonRefundable?: boolean; nonRefundablePercent?: number }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_instalments WHERE quotation_id = ?', [quotationId])
        for (const inst of instalments) {
            await this.pool.execute(
                'INSERT INTO quotation_instalments (id, quotation_id, instalment_number, days_from_inception, description, non_refundable, non_refundable_percent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), quotationId, inst.instalmentNumber, inst.daysFromInception, inst.description || null, inst.nonRefundable || false, inst.nonRefundablePercent || null])
        }
    }

    // -- Quotation Information --
    async getQuotationInformation(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, text, order_index as 'order' FROM quotation_information WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationInformation(data: { quotationId: string; text: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_information (id, quotation_id, text, order_index) VALUES (?, ?, ?, ?)',
            [id, data.quotationId, data.text, data.order || 0])
        return { id, ...data }
    }

    async deleteQuotationInformation(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_information WHERE id = ?', [id])
    }

    // -- Quotation Notes --
    async getQuotationNotes(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, title, content, order_index as 'order' FROM quotation_notes WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationNote(data: { quotationId: string; title: string; content?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_notes (id, quotation_id, title, content, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, data.quotationId, data.title, data.content || null, data.order || 0])
        return { id, ...data }
    }

    async updateQuotationNote(id: string, updates: { title?: string; content?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
        if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_notes SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationNote(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_notes WHERE id = ?', [id])
    }

    // ==================== P&I Warranty Tags ====================

    async getPIWarrantyTags(): Promise<PIWarrantyTag[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, order_index as `order` FROM pi_warranty_tags ORDER BY order_index ASC')
        return rows as PIWarrantyTag[]
    }

    async addPIWarrantyTag(name: string): Promise<PIWarrantyTag> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_warranty_tags')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO pi_warranty_tags (id, name, order_index) VALUES (?, ?, ?)', [id, name, order])
        return { id, name, order }
    }

    async updatePIWarrantyTag(id: string, name: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_warranty_tags SET name = ? WHERE id = ?', [name, id])
    }

    async deletePIWarrantyTag(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_warranty_tags WHERE id = ?', [id])
    }

    async reorderPIWarrantyTags(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_warranty_tags SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Instalment Defaults & Logo ====================

    async getInstalmentDefaults(): Promise<InstalmentDefaults> {
        const val = await this.getSetting('instalment_defaults')
        if (!val) return {}
        try { return JSON.parse(val) } catch { return {} }
    }

    async setInstalmentDefaults(defaults: InstalmentDefaults, updatedBy?: string): Promise<void> {
        await this.setSetting('instalment_defaults', JSON.stringify(defaults), updatedBy)
    }

    async getQuotationLogoPath(): Promise<string | null> {
        return this.getSetting('quotation_logo_path')
    }

    async setQuotationLogoPath(path: string, updatedBy?: string): Promise<void> {
        await this.setSetting('quotation_logo_path', path, updatedBy)
    }

    // ==================== P&I Sanctions Versions ====================

    async getPISanctionsVersions(): Promise<PISanctionsVersion[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, key_name as `key`, text, order_index as `order` FROM pi_sanctions_versions ORDER BY order_index ASC')
        return rows as PISanctionsVersion[]
    }

    async addPISanctionsVersion(data: { name: string; key: string; text: string }): Promise<PISanctionsVersion> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_sanctions_versions')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO pi_sanctions_versions (id, name, key_name, text, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, data.name, data.key, data.text, order])
        return { id, name: data.name, key: data.key, text: data.text, order }
    }

    async updatePISanctionsVersion(id: string, updates: { name?: string; key?: string; text?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.key !== undefined) { fields.push('key_name = ?'); values.push(updates.key) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE pi_sanctions_versions SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePISanctionsVersion(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_sanctions_versions WHERE id = ?', [id])
    }

    async reorderPISanctionsVersions(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_sanctions_versions SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // --- Vessel Insurance Policies (imported) ---

    async getVesselInsurancePolicies(vesselId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, vessel_id as vesselId, policy_category as policyCategory, policy_number as policyNumber,
             coverage_code as coverageCode, inception_date as inceptionDate, inception_time as inceptionTime,
             end_date as endDate, end_time as endTime, currency,
             hm_value as hmValue, iv_value as ivValue, hm_premium as hmPremium, iv_premium as ivPremium,
             deductible, amd, general_average as generalAverage,
             limit_of_liability as limitOfLiability, premium, war_rate as warRate,
             upcc, ncb, our_share as ourShare, notes, condition_survey as conditionSurvey,
             survey_done as surveyDone, survey_date as surveyDate, survey_reference as surveyReference,
             broker, fleet_name as fleetName
             FROM vessel_insurance_policies WHERE vessel_id = ? ORDER BY policy_category, inception_date DESC`,
            [vesselId]
        )
        return (rows as any[]).map(r => ({
            ...r,
            hmValue: r.hmValue ? Number(r.hmValue) : undefined,
            ivValue: r.ivValue ? Number(r.ivValue) : undefined,
            hmPremium: r.hmPremium ? Number(r.hmPremium) : undefined,
            ivPremium: r.ivPremium ? Number(r.ivPremium) : undefined,
            deductible: r.deductible ? Number(r.deductible) : undefined,
            amd: r.amd ? Number(r.amd) : undefined,
            generalAverage: r.generalAverage ? Number(r.generalAverage) : undefined,
            limitOfLiability: r.limitOfLiability ? Number(r.limitOfLiability) : undefined,
            premium: r.premium ? Number(r.premium) : undefined
        }))
    }

    async importVesselInsurancePolicies(policies: { vesselId: string; records: any[] }[]): Promise<number> {
        if (!this.pool) return 0
        let count = 0
        for (const { vesselId, records } of policies) {
            // Clear existing imported policies for this vessel
            await this.pool.execute('DELETE FROM vessel_insurance_policies WHERE vessel_id = ?', [vesselId])
            for (const r of records) {
                const id = uuidv4()
                await this.pool.execute(
                    `INSERT INTO vessel_insurance_policies (id, vessel_id, policy_category, policy_number, coverage_code,
                     inception_date, inception_time, end_date, end_time, currency,
                     hm_value, iv_value, hm_premium, iv_premium, deductible, amd, general_average,
                     limit_of_liability, premium, war_rate, upcc, ncb, our_share, notes,
                     condition_survey, survey_done, survey_date, survey_reference, broker, fleet_name)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, vesselId, r.policyCategory, r.policyNumber || null, r.coverageCode || null,
                     r.inceptionDate || null, r.inceptionTime || null, r.endDate || null, r.endTime || null, r.currency || 'USD',
                     r.hmValue ?? null, r.ivValue ?? null, r.hmPremium ?? null, r.ivPremium ?? null,
                     r.deductible ?? null, r.amd ?? null, r.generalAverage ?? null,
                     r.limitOfLiability ?? null, r.premium ?? null, r.warRate || null,
                     r.upcc || null, r.ncb || null, r.ourShare || null, r.notes || null,
                     r.conditionSurvey || null, r.surveyDone || null, r.surveyDate || null, r.surveyReference || null,
                     r.broker || null, r.fleetName || null]
                )
                count++
            }
        }
        return count
    }
    // --- Classification Societies ---
    async getClassificationSocieties(): Promise<ClassificationSociety[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, abbreviation, is_iacs as isIacs, order_index as `order` FROM classification_societies ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, isIacs: Boolean(r.isIacs) }))
    }

    async addClassificationSociety(cs: Omit<ClassificationSociety, 'id'>): Promise<ClassificationSociety> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO classification_societies (id, name, abbreviation, is_iacs, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, cs.name, cs.abbreviation || '', cs.isIacs ? 1 : 0, cs.order || 0]
        )
        return { id, ...cs }
    }

    async updateClassificationSociety(id: string, updates: Partial<ClassificationSociety>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.abbreviation !== undefined) { fields.push('abbreviation = ?'); values.push(updates.abbreviation) }
        if (updates.isIacs !== undefined) { fields.push('is_iacs = ?'); values.push(updates.isIacs ? 1 : 0) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE classification_societies SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteClassificationSociety(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM classification_societies WHERE id = ?', [id])
    }

    async reorderClassificationSocieties(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE classification_societies SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    async getVesselClassifications(vesselId: string): Promise<VesselClassification[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT vc.id, vc.vessel_id as vesselId, vc.classification_society_id as classificationSocietyId,
                    cs.name as classificationSocietyName, cs.abbreviation, cs.is_iacs as isIacs
             FROM vessel_classifications vc
             JOIN classification_societies cs ON vc.classification_society_id = cs.id
             WHERE vc.vessel_id = ?
             ORDER BY cs.order_index ASC`,
            [vesselId]
        )
        return (rows as any[]).map(r => ({ ...r, isIacs: Boolean(r.isIacs) }))
    }

    async setVesselClassifications(vesselId: string, classificationSocietyIds: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_classifications WHERE vessel_id = ?', [vesselId])
        for (const csId of classificationSocietyIds) {
            await this.pool.execute(
                'INSERT INTO vessel_classifications (id, vessel_id, classification_society_id) VALUES (?, ?, ?)',
                [uuidv4(), vesselId, csId]
            )
        }
    }

    // --- Vessel Types ---
    async getVesselTypes(): Promise<VesselType[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, description, order_index as `order` FROM vessel_types ORDER BY order_index ASC')
        return rows as VesselType[]
    }

    async addVesselType(vt: Omit<VesselType, 'id'>): Promise<VesselType> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO vessel_types (id, name, description, order_index) VALUES (?, ?, ?, ?)',
            [id, vt.name, vt.description || null, vt.order || 0]
        )
        return { id, ...vt }
    }

    async updateVesselType(id: string, updates: Partial<VesselType>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description || null) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE vessel_types SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteVesselType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_types WHERE id = ?', [id])
    }

    async reorderVesselTypes(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE vessel_types SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // --- Vessel Audit Log ---
    async getVesselAuditLog(vesselId: string): Promise<VesselAuditEntry[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, vessel_id as vesselId, field_name as fieldName, old_value as oldValue, new_value as newValue,
                    changed_by as changedBy, changed_at as changedAt
             FROM vessel_audit_log WHERE vessel_id = ? ORDER BY changed_at DESC`,
            [vesselId]
        )
        return rows as VesselAuditEntry[]
    }

    async addVesselAuditEntry(vesselId: string, fieldName: string, oldValue: string | null, newValue: string | null, changedBy: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'INSERT INTO vessel_audit_log (id, vessel_id, field_name, old_value, new_value, changed_by) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), vesselId, fieldName, oldValue, newValue, changedBy]
        )
    }

    // --- Policy Type Characteristics ---
    async getPolicyTypeCharacteristics(policyTypeId?: string): Promise<PolicyTypeCharacteristic[]> {
        if (!this.pool) return []
        let sql = `SELECT id, policy_type_id as policyTypeId, name, field_type as fieldType, select_options as selectOptions,
                   is_required as isRequired, order_index as \`order\`
                   FROM policy_type_characteristics`
        const params: any[] = []
        if (policyTypeId) { sql += ' WHERE policy_type_id = ?'; params.push(policyTypeId) }
        sql += ' ORDER BY order_index ASC'
        const [rows] = await this.pool.query(sql, params)
        return (rows as any[]).map(r => ({
            ...r,
            isRequired: Boolean(r.isRequired),
            selectOptions: r.selectOptions ? JSON.parse(r.selectOptions) : undefined
        }))
    }

    async addPolicyTypeCharacteristic(c: Omit<PolicyTypeCharacteristic, 'id'>): Promise<PolicyTypeCharacteristic> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO policy_type_characteristics (id, policy_type_id, name, field_type, select_options, is_required, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, c.policyTypeId, c.name, c.fieldType, c.selectOptions ? JSON.stringify(c.selectOptions) : null, c.isRequired ? 1 : 0, c.order || 0]
        )
        return { id, ...c }
    }

    async updatePolicyTypeCharacteristic(id: string, updates: Partial<PolicyTypeCharacteristic>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.fieldType !== undefined) { fields.push('field_type = ?'); values.push(updates.fieldType) }
        if (updates.selectOptions !== undefined) { fields.push('select_options = ?'); values.push(updates.selectOptions ? JSON.stringify(updates.selectOptions) : null) }
        if (updates.isRequired !== undefined) { fields.push('is_required = ?'); values.push(updates.isRequired ? 1 : 0) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE policy_type_characteristics SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePolicyTypeCharacteristic(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM policy_type_characteristics WHERE id = ?', [id])
    }

    async reorderPolicyTypeCharacteristics(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE policy_type_characteristics SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // --- Policy Type Conditions ---
    async getPolicyTypeConditions(policyTypeId?: string): Promise<PolicyTypeCondition[]> {
        if (!this.pool) return []
        let sql = 'SELECT id, policy_type_id as policyTypeId, name, order_index as `order` FROM policy_type_conditions'
        const params: any[] = []
        if (policyTypeId) { sql += ' WHERE policy_type_id = ?'; params.push(policyTypeId) }
        sql += ' ORDER BY order_index ASC'
        const [rows] = await this.pool.query(sql, params)
        return rows as PolicyTypeCondition[]
    }

    async addPolicyTypeCondition(c: Omit<PolicyTypeCondition, 'id'>): Promise<PolicyTypeCondition> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO policy_type_conditions (id, policy_type_id, name, order_index) VALUES (?, ?, ?, ?)',
            [id, c.policyTypeId, c.name, c.order || 0]
        )
        return { id, ...c }
    }

    async updatePolicyTypeCondition(id: string, updates: Partial<PolicyTypeCondition>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.order !== undefined) { fields.push('order_index = ?'); values.push(updates.order) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE policy_type_conditions SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePolicyTypeCondition(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM policy_type_conditions WHERE id = ?', [id])
    }

    // --- Vessel Dynamic Policies ---
    async getVesselDynamicPolicies(vesselId: string): Promise<VesselDynamicPolicy[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT vdp.id, vdp.vessel_id as vesselId, vdp.policy_type_id as policyTypeId,
                    pt.name as policyTypeName, vdp.policy_number as policyNumber,
                    vdp.condition_id as conditionId, ptc.name as conditionName,
                    vdp.status, vdp.currency, vdp.broker_entity_id as brokerEntityId,
                    e.name as brokerName, vdp.notes,
                    vdp.created_at as createdAt, vdp.updated_at as updatedAt
             FROM vessel_dynamic_policies vdp
             LEFT JOIN policy_types pt ON vdp.policy_type_id = pt.id
             LEFT JOIN policy_type_conditions ptc ON vdp.condition_id = ptc.id
             LEFT JOIN entities e ON vdp.broker_entity_id = e.id
             WHERE vdp.vessel_id = ?
             ORDER BY pt.order_index ASC, vdp.created_at DESC`,
            [vesselId]
        )
        const policies = rows as VesselDynamicPolicy[]

        // Load values for each policy
        for (const p of policies) {
            const [vals] = await this.pool.query(
                `SELECT vpv.id, vpv.policy_id as policyId, vpv.characteristic_id as characteristicId,
                        ptch.name as characteristicName, ptch.field_type as fieldType,
                        vpv.value_text as valueText, vpv.value_amount as valueAmount,
                        vpv.value_date as valueDate, vpv.value_boolean as valueBoolean
                 FROM vessel_policy_values vpv
                 JOIN policy_type_characteristics ptch ON vpv.characteristic_id = ptch.id
                 WHERE vpv.policy_id = ?
                 ORDER BY ptch.order_index ASC`,
                [p.id]
            )
            p.values = (vals as any[]).map(v => ({ ...v, valueBoolean: v.valueBoolean != null ? Boolean(v.valueBoolean) : undefined, valueAmount: v.valueAmount != null ? Number(v.valueAmount) : undefined }))
        }

        return policies
    }

    async getAllVesselDynamicPolicies(): Promise<VesselDynamicPolicy[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT vdp.id, vdp.vessel_id as vesselId, vdp.policy_type_id as policyTypeId,
                    pt.name as policyTypeName, vdp.policy_number as policyNumber,
                    vdp.condition_id as conditionId, ptc.name as conditionName,
                    vdp.status, vdp.currency, vdp.broker_entity_id as brokerEntityId,
                    e.name as brokerName, vdp.notes,
                    vdp.created_at as createdAt, vdp.updated_at as updatedAt
             FROM vessel_dynamic_policies vdp
             LEFT JOIN policy_types pt ON vdp.policy_type_id = pt.id
             LEFT JOIN policy_type_conditions ptc ON vdp.condition_id = ptc.id
             LEFT JOIN entities e ON vdp.broker_entity_id = e.id
             ORDER BY vdp.vessel_id, pt.order_index ASC`
        )
        const policies = rows as VesselDynamicPolicy[]

        // Load all values for all policies in one efficient query
        const [vals] = await this.pool.query(
            `SELECT vpv.id, vpv.policy_id as policyId, vpv.characteristic_id as characteristicId,
                    ptch.name as characteristicName, ptch.field_type as fieldType,
                    vpv.value_text as valueText, vpv.value_amount as valueAmount,
                    vpv.value_date as valueDate, vpv.value_boolean as valueBoolean
             FROM vessel_policy_values vpv
             JOIN policy_type_characteristics ptch ON vpv.characteristic_id = ptch.id
             ORDER BY vpv.policy_id, ptch.order_index ASC`
        )
        
        const valuesByPolicy = new Map<string, any[]>()
        for (const v of vals as any[]) {
            if (!valuesByPolicy.has(v.policyId)) valuesByPolicy.set(v.policyId, [])
            valuesByPolicy.get(v.policyId)!.push({
                ...v,
                valueBoolean: v.valueBoolean != null ? Boolean(v.valueBoolean) : undefined,
                valueAmount: v.valueAmount != null ? Number(v.valueAmount) : undefined
            })
        }

        for (const p of policies) {
            p.values = valuesByPolicy.get(p.id) || []
        }

        return policies
    }

    async addVesselDynamicPolicy(policy: Omit<VesselDynamicPolicy, 'id' | 'createdAt' | 'updatedAt' | 'policyTypeName' | 'conditionName' | 'brokerName' | 'values'>): Promise<string> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO vessel_dynamic_policies (id, vessel_id, policy_type_id, policy_number, condition_id, status, currency, broker_entity_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, policy.vesselId, policy.policyTypeId, policy.policyNumber || null, policy.conditionId || null,
             policy.status || 'active', policy.currency || 'USD', policy.brokerEntityId || null, policy.notes || null]
        )
        return id
    }

    async updateVesselDynamicPolicy(id: string, updates: Partial<VesselDynamicPolicy>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.policyNumber !== undefined) { fields.push('policy_number = ?'); values.push(updates.policyNumber || null) }
        if (updates.conditionId !== undefined) { fields.push('condition_id = ?'); values.push(updates.conditionId || null) }
        if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status) }
        if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency) }
        if (updates.brokerEntityId !== undefined) { fields.push('broker_entity_id = ?'); values.push(updates.brokerEntityId || null) }
        if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes || null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE vessel_dynamic_policies SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async setQuotationSentDate(policyId: string, date: string | null): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE vessel_dynamic_policies SET quotation_sent_date = ? WHERE id = ?',
            [date || null, policyId]
        )
    }

    async deleteVesselDynamicPolicy(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_dynamic_policies WHERE id = ?', [id])
    }

    // --- Vessel Policy Values ---
    async setVesselPolicyValues(policyId: string, values: Omit<VesselPolicyValue, 'id' | 'policyId' | 'characteristicName' | 'fieldType'>[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_policy_values WHERE policy_id = ?', [policyId])
        for (const v of values) {
            await this.pool.execute(
                'INSERT INTO vessel_policy_values (id, policy_id, characteristic_id, value_text, value_amount, value_date, value_boolean) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuidv4(), policyId, v.characteristicId, v.valueText || null, v.valueAmount ?? null, v.valueDate || null, v.valueBoolean != null ? (v.valueBoolean ? 1 : 0) : null]
            )
        }
    }

    // --- Policy Expiry Alerts ---
    async getExpiredActivePolicies(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT vdp.id, vdp.vessel_id as vesselId, v.name as vesselName, v.imo_number as imoNumber,
                    pt.name as policyTypeName, vdp.policy_number as policyNumber, vdp.status,
                    vpv.value_date as endDate
             FROM vessel_dynamic_policies vdp
             JOIN vessels v ON vdp.vessel_id = v.id
             JOIN policy_types pt ON vdp.policy_type_id = pt.id
             JOIN vessel_policy_values vpv ON vpv.policy_id = vdp.id
             JOIN policy_type_characteristics ptc ON vpv.characteristic_id = ptc.id
             WHERE vdp.status = 'active'
               AND ptc.field_type = 'date'
               AND LOWER(ptc.name) LIKE '%end%'
               AND vpv.value_date IS NOT NULL
               AND vpv.value_date < CURDATE()
             ORDER BY vpv.value_date ASC`
        )
        return rows as any[]
    }
    // --- Policy Renewals by Month ---
    async getPolicyRenewalsByMonth(year: number, month: number): Promise<any[]> {
        if (!this.pool) return []
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endMonth = month === 12 ? 1 : month + 1
        const endYear = month === 12 ? year + 1 : year
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
        const [rows] = await this.pool.query(
            `SELECT vdp.id, vdp.vessel_id as vesselId, v.name as vesselName, v.imo_number as imoNumber,
                    pt.name as policyTypeName, vdp.policy_number as policyNumber,
                    vpv.value_date as endDate,
                    e.name as customerName, v.customer_type as customerType,
                    f.name as fleetName,
                    vdp.currency as currency,
                    vdp.renewal_status_id as renewalStatusId,
                    rst.name as renewalStatusName, rst.color as renewalStatusColor,
                    vdp.quotation_sent_date as quotationSentDate,
                    COALESCE(rn.cnt, 0) as noteCount,
                    (SELECT vpv2.value_amount FROM vessel_policy_values vpv2
                     JOIN policy_type_characteristics ptc2 ON vpv2.characteristic_id = ptc2.id
                     WHERE vpv2.policy_id = vdp.id AND ptc2.field_type = 'amount'
                       AND LOWER(ptc2.name) LIKE '%premium%'
                     LIMIT 1) as premium
             FROM vessel_dynamic_policies vdp
             JOIN vessels v ON vdp.vessel_id = v.id
             JOIN policy_types pt ON vdp.policy_type_id = pt.id
             JOIN vessel_policy_values vpv ON vpv.policy_id = vdp.id
             JOIN policy_type_characteristics ptc ON vpv.characteristic_id = ptc.id
             LEFT JOIN entities e ON v.customer_id = e.id
             LEFT JOIN fleets f ON v.fleet_id = f.id
             LEFT JOIN renewal_status_types rst ON vdp.renewal_status_id = rst.id
             LEFT JOIN (
                 SELECT policy_id, policy_number, COUNT(*) as cnt
                 FROM policy_renewal_notes
                 GROUP BY policy_id, policy_number
             ) rn ON rn.policy_id = vdp.id AND rn.policy_number = COALESCE(vdp.policy_number, '')
             WHERE vdp.status = 'active'
               AND v.is_active = TRUE
               AND ptc.field_type = 'date'
               AND LOWER(ptc.name) LIKE '%end%'
               AND vpv.value_date IS NOT NULL
               AND vpv.value_date >= ?
               AND vpv.value_date < ?
             ORDER BY vpv.value_date ASC, v.name ASC`,
            [startDate, endDate]
        )
        return rows as any[]
    }

    // --- Policy Renewal Notes ---
    async getPolicyRenewalNotes(policyId: string, policyNumber: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, policy_id as policyId, policy_number as policyNumber, note, created_by_user_id as createdByUserId, created_by_username as createdByUsername, created_at as createdAt FROM policy_renewal_notes WHERE policy_id = ? AND policy_number = ? ORDER BY created_at ASC',
            [policyId, policyNumber ?? '']
        )
        return rows as any[]
    }

    async addPolicyRenewalNote(policyId: string, policyNumber: string, note: string, userId: string, username: string): Promise<any> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        const now = new Date()
        await this.pool.execute(
            'INSERT INTO policy_renewal_notes (id, policy_id, policy_number, note, created_by_user_id, created_by_username, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, policyId, policyNumber ?? '', note.trim(), userId, username, now]
        )
        return { id, policyId, policyNumber: policyNumber ?? '', note: note.trim(), createdByUserId: userId, createdByUsername: username, createdAt: now.toISOString() }
    }

    async deletePolicyRenewalNote(noteId: string, userId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM policy_renewal_notes WHERE id = ? AND created_by_user_id = ?', [noteId, userId])
    }

    // --- Vessel Notes ---
    async getVesselNotes(vesselId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, vessel_id as vesselId, note, created_by_user_id as createdByUserId, created_by_username as createdByUsername, created_at as createdAt FROM vessel_notes WHERE vessel_id = ? ORDER BY created_at ASC',
            [vesselId]
        )
        return rows as any[]
    }

    async addVesselNote(vesselId: string, note: string, userId: string, username: string): Promise<any> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        const now = new Date()
        await this.pool.execute(
            'INSERT INTO vessel_notes (id, vessel_id, note, created_by_user_id, created_by_username, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [id, vesselId, note.trim(), userId, username, now]
        )
        return { id, vesselId, note: note.trim(), createdByUserId: userId, createdByUsername: username, createdAt: now.toISOString() }
    }

    async deleteVesselNote(noteId: string, userId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM vessel_notes WHERE id = ? AND created_by_user_id = ?', [noteId, userId])
    }

    // --- Renewal Status Types ---
    async getRenewalStatusTypes(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, color, order_index as `order` FROM renewal_status_types ORDER BY order_index ASC, name ASC')
        return rows as any[]
    }

    async addRenewalStatusType(name: string, color: string): Promise<any> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        const [countRows] = await this.pool.query('SELECT COUNT(*) as cnt FROM renewal_status_types')
        const order = (countRows as any[])[0]?.cnt ?? 0
        await this.pool.execute('INSERT INTO renewal_status_types (id, name, color, order_index) VALUES (?, ?, ?, ?)', [id, name.trim(), color, order])
        return { id, name: name.trim(), color, order }
    }

    async updateRenewalStatusType(id: string, name: string, color: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE renewal_status_types SET name = ?, color = ? WHERE id = ?', [name.trim(), color, id])
    }

    async deleteRenewalStatusType(id: string): Promise<void> {
        if (!this.pool) return
        // Clear references on policies first
        await this.pool.execute('UPDATE vessel_dynamic_policies SET renewal_status_id = NULL WHERE renewal_status_id = ?', [id])
        await this.pool.execute('DELETE FROM renewal_status_types WHERE id = ?', [id])
    }

    async setRenewalStatusForPolicy(policyId: string, statusId: string | null): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE vessel_dynamic_policies SET renewal_status_id = ? WHERE id = ?', [statusId || null, policyId])
    }

    async addOneDayToAllPolicies(): Promise<{ updatedValues: number; updatedVessels: number }> {
        if (!this.pool) throw new Error('DB Not connected')

        // 1. Update vessel_policy_values for the dynamic policy system
        // We find all characteristics that are date fields and likely inception/expiry
        const [dateChars] = await this.pool.query(
            "SELECT id FROM policy_type_characteristics WHERE field_type = 'date' AND (LOWER(name) LIKE '%inception%' OR LOWER(name) LIKE '%end%' OR LOWER(name) LIKE '%expiry%')"
        )
        const charIds = (dateChars as any[]).map(c => c.id)

        let updatedValues = 0
        if (charIds.length > 0) {
            // MySQL's DATE_ADD works on ISO date strings
            const [result] = await this.pool.query(
                `UPDATE vessel_policy_values 
                 SET value_date = DATE_FORMAT(DATE_ADD(STR_TO_DATE(value_date, '%Y-%m-%d'), INTERVAL 1 DAY), '%Y-%m-%d')
                 WHERE characteristic_id IN (?) AND value_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
                [charIds]
            )
            updatedValues = (result as any).affectedRows
        }

        // 2. Update vessels.policy_expiry_date (legacy/summary field)
        const [vessResult] = await this.pool.query(
            `UPDATE vessels 
             SET policy_expiry_date = DATE_FORMAT(DATE_ADD(STR_TO_DATE(policy_expiry_date, '%Y-%m-%d'), INTERVAL 1 DAY), '%Y-%m-%d')
             WHERE policy_expiry_date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`
        )
        const updatedVessels = (vessResult as any).affectedRows

        return { updatedValues, updatedVessels }
    }
}

export const db = new MySQLAdapter()
