import { createPool, Pool } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'
import { readFileSync, existsSync } from 'fs'
import { extname } from 'path'
import { DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO, User, ConditionSurvey, SurveyDefect, SurveyAttachment, Surveyor, PaginatedResult, VesselQueryParams, EntityQueryParams, SurveyorQueryParams, ComplianceResultQueryParams, ReminderSettings, VesselReminder, AssuredDocAlert, VesselCustomDocType, PolicyType, VesselPolicy, DABQueryCriteria, PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIDeductible, PIDeductibleSet, PIDeductibleSetItem, PIExclusion, PISubLimitTemplate, PIAdditionalClause, PIAdditionalClauseSet, TradingExcludedCountry, TradingWarrantyTemplate, Quotation, PISanctionsVersion, InstalmentDefaults, ClassificationSociety, VesselClassification, VesselType, VesselAuditEntry, PolicyTypeCharacteristic, PolicyTypeCondition, VesselDynamicPolicy, VesselPolicyValue, QuotationVessel, QuotationType, EntityAddress, UserGroup, AnalyticsPreset, AnalyticsFilters, PremiumTextTemplate, TradingCustomText, SavedReport, ReportConfig } from '../../shared/types'
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
                connectTimeout: 10000,
                charset: 'UTF8MB4_UNICODE_CI'
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
            // Set the database-level default collation BEFORE creating any tables.
            // On MariaDB 10.10+, the server default is utf8mb4_uca1400_ai_ci which
            // differs from utf8mb4_unicode_ci used by existing tables, causing
            // "Illegal mix of collations" errors on JOINs. Setting the DB default
            // here ensures all new tables (from schema.sql and migration blocks)
            // inherit utf8mb4_unicode_ci without needing per-table COLLATE clauses.
            try {
                const [[dbRow]] = await this.pool.query('SELECT DATABASE() as name') as any
                if (dbRow?.name) {
                    await this.pool.query(
                        `ALTER DATABASE \`${dbRow.name}\` CHARACTER SET utf8mb4`
                    )
                }
            } catch (e) {
                console.error('Migration warning (alter database collation):', e)
            }

            const statements = schemaSql.split(';').filter((s: string) => s.trim())

            await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
            for (const statement of statements) {
                if (statement.trim()) {
                    await this.pool.query(statement)
                }
            }
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')

            // Migration: Normalize all existing tables to utf8mb4_unicode_ci.
            // Multi-pass (up to 5 rounds) so that FK-parent tables converted in
            // an earlier pass no longer block FK-child tables in a later pass.
            // Each table is converted independently — one failure never aborts
            // the rest. Strategy: drop all FK constraints touching mismatched tables,
            // convert every mismatched table, then re-add the constraints.
            // MariaDB (unlike MySQL) enforces FK collation in BOTH directions even with
            // FOREIGN_KEY_CHECKS=0, so there is no ordering that avoids the error —
            // the FKs must be absent during conversion.
            const normConn = await this.pool.getConnection()
            try {
                await normConn.query('SET FOREIGN_KEY_CHECKS=0')

                // Find all tables still using the wrong collation
                const [mismatchedRows] = await normConn.query(`
                    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_COLLATION != 'utf8mb4_unicode_ci'
                    AND TABLE_TYPE = 'BASE TABLE'
                `) as any[]
                const mismatchedSet = new Set((mismatchedRows as any[]).map((r: any) => r.TABLE_NAME as string))

                if (mismatchedSet.size > 0) {
                    console.log(`Collation normalization: ${mismatchedSet.size} table(s) need conversion`)

                    // Fetch full FK definitions for constraints touching any mismatched table
                    const [fkRows] = await normConn.query(`
                        SELECT
                            kcu.TABLE_NAME, kcu.CONSTRAINT_NAME,
                            kcu.COLUMN_NAME, kcu.ORDINAL_POSITION,
                            kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
                            rc.UPDATE_RULE, rc.DELETE_RULE
                        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                        JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                            ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                            AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
                        WHERE kcu.TABLE_SCHEMA = DATABASE()
                        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                        ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
                    `) as any[]

                    // Group columns by constraint key
                    type FKDef = { tableName: string; constraintName: string; columns: string[]; refTable: string; refColumns: string[]; updateRule: string; deleteRule: string }
                    const fkMap = new Map<string, FKDef>()
                    for (const row of (fkRows as any[])) {
                        const key = `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`
                        if (!fkMap.has(key)) {
                            fkMap.set(key, { tableName: row.TABLE_NAME, constraintName: row.CONSTRAINT_NAME, columns: [], refTable: row.REFERENCED_TABLE_NAME, refColumns: [], updateRule: row.UPDATE_RULE, deleteRule: row.DELETE_RULE })
                        }
                        fkMap.get(key)!.columns.push(row.COLUMN_NAME)
                        fkMap.get(key)!.refColumns.push(row.REFERENCED_COLUMN_NAME)
                    }

                    // Only handle FKs where at least one side is a mismatched table
                    const relevantFKs = [...fkMap.values()].filter(
                        fk => mismatchedSet.has(fk.tableName) || mismatchedSet.has(fk.refTable)
                    )

                    // Drop all relevant FK constraints
                    for (const fk of relevantFKs) {
                        try {
                            await normConn.query(`ALTER TABLE \`${fk.tableName}\` DROP FOREIGN KEY \`${fk.constraintName}\``)
                        } catch (e) {
                            console.error(`Migration warning: failed to drop FK ${fk.constraintName} on ${fk.tableName}:`, e)
                        }
                    }

                    // Convert every mismatched table — no FK constraints blocking now
                    for (const tableName of mismatchedSet) {
                        try {
                            await normConn.query(`ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
                        } catch (e) {
                            console.error(`Migration warning: failed to convert table ${tableName}:`, e)
                        }
                    }

                    // Re-add all dropped FK constraints
                    for (const fk of relevantFKs) {
                        try {
                            const cols = fk.columns.map(c => `\`${c}\``).join(', ')
                            const refCols = fk.refColumns.map(c => `\`${c}\``).join(', ')
                            await normConn.query(
                                `ALTER TABLE \`${fk.tableName}\` ADD CONSTRAINT \`${fk.constraintName}\` FOREIGN KEY (${cols}) REFERENCES \`${fk.refTable}\` (${refCols}) ON DELETE ${fk.deleteRule} ON UPDATE ${fk.updateRule}`
                            )
                        } catch (e) {
                            console.error(`Migration warning: failed to re-add FK ${fk.constraintName} on ${fk.tableName}:`, e)
                        }
                    }

                    console.log('Collation normalization complete')
                }

                await normConn.query('SET FOREIGN_KEY_CHECKS=1')
            } catch (e) {
                console.error('Migration error (collation normalization):', e)
                try { await normConn.query('SET FOREIGN_KEY_CHECKS=1') } catch { /* ignore */ }
            } finally {
                normConn.release()
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS survey_attachments (
                    id VARCHAR(36) PRIMARY KEY,
                    survey_id VARCHAR(36) NOT NULL,
                    file_path TEXT NOT NULL,
                    file_name VARCHAR(255) NOT NULL,
                    file_type VARCHAR(50),
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    uploaded_by VARCHAR(255),
                    FOREIGN KEY (survey_id) REFERENCES condition_surveys(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
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
                await this.pool.query('ALTER TABLE quotations ADD COLUMN section_texts_override MEDIUMTEXT NULL')
            } else {
                // Always ensure MEDIUMTEXT (upgrade from TEXT if needed)
                await this.pool.query('ALTER TABLE quotations MODIFY COLUMN section_texts_override MEDIUMTEXT NULL')
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
            // Migration: Add trading_custom_mode + trading_custom_wording
            const [tCustModeCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'trading_custom_mode'")
            if ((tCustModeCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN trading_custom_mode BOOLEAN DEFAULT FALSE')
                await this.pool.query('ALTER TABLE quotations ADD COLUMN trading_custom_wording TEXT NULL')
            }
            // Migration: Add co_name to quotations
            const [qCoNameCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'co_name'")
            if ((qCoNameCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN co_name VARCHAR(255) NULL')
            }

            // Migration: Add title to quotations
            const [qTitleCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'title'")
            if ((qTitleCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotations ADD COLUMN title VARCHAR(500) NULL')
            }

            // Migration: Add vessel_label to quotation_assureds
            const [qaVlCol] = await this.pool.query("SHOW COLUMNS FROM quotation_assureds LIKE 'vessel_label'")
            if ((qaVlCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE quotation_assureds ADD COLUMN vessel_label VARCHAR(20) NULL')
            }

            // Migration: Add code column to pi_additional_clauses
            const [acCodeCol] = await this.pool.query("SHOW COLUMNS FROM pi_additional_clauses LIKE 'code'")
            if ((acCodeCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE pi_additional_clauses ADD COLUMN code VARCHAR(50) NULL AFTER id')
            }

            // Migration: Add default_selected to pi_additional_clauses
            const [acDefCol] = await this.pool.query("SHOW COLUMNS FROM pi_additional_clauses LIKE 'default_selected'")
            if ((acDefCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE pi_additional_clauses ADD COLUMN default_selected BOOLEAN DEFAULT FALSE')
            }

            // Migration: Add title column to pi_additional_clauses
            const [acTitleCol] = await this.pool.query("SHOW COLUMNS FROM pi_additional_clauses LIKE 'title'")
            if ((acTitleCol as any[]).length === 0) {
                await this.pool.query('ALTER TABLE pi_additional_clauses ADD COLUMN title VARCHAR(255) NULL AFTER id')
            }

            // Migration: Create quotation_vessels table
            await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_vessels (
                id VARCHAR(36) PRIMARY KEY,
                quotation_id VARCHAR(36) NOT NULL,
                vessel_id VARCHAR(36) NULL,
                vessel_label VARCHAR(20) NOT NULL DEFAULT 'V1',
                order_index INT DEFAULT 0,
                name VARCHAR(255) NULL,
                imo_number VARCHAR(50) NULL,
                built_year INT NULL,
                gross_tonnage DECIMAL(12,2) NULL,
                flag VARCHAR(100) NULL,
                vessel_type VARCHAR(100) NULL,
                classification VARCHAR(100) NULL,
                call_sign VARCHAR(50) NULL,
                INDEX idx_qv_quotation_id (quotation_id),
                INDEX idx_qv_vessel_id (vessel_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

            // Data migration: move existing quotations.vessel_id + quotation_new_vessels into quotation_vessels
            {
                const [existingQv] = await this.pool.query('SELECT COUNT(*) as cnt FROM quotation_vessels')
                if ((existingQv as any[])[0].cnt === 0) {
                    // Migrate existing vessel_id references
                    const [quotationsWithVessel] = await this.pool.query(
                        'SELECT id, vessel_id FROM quotations WHERE vessel_id IS NOT NULL'
                    )
                    for (const q of quotationsWithVessel as any[]) {
                        await this.pool.execute(
                            'INSERT INTO quotation_vessels (id, quotation_id, vessel_id, vessel_label, order_index) VALUES (?, ?, ?, ?, ?)',
                            [uuidv4(), q.id, q.vessel_id, 'V1', 0]
                        )
                    }
                    // Migrate quotation_new_vessels
                    const [newVessels] = await this.pool.query('SELECT * FROM quotation_new_vessels')
                    for (const nv of newVessels as any[]) {
                        const [alreadyMigrated] = await this.pool.query(
                            'SELECT id FROM quotation_vessels WHERE quotation_id = ? AND vessel_id IS NULL', [nv.quotation_id]
                        )
                        if ((alreadyMigrated as any[]).length === 0) {
                            await this.pool.execute(
                                `INSERT INTO quotation_vessels (id, quotation_id, vessel_label, order_index, name, imo_number, built_year, gross_tonnage, flag, vessel_type, classification, call_sign)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [uuidv4(), nv.quotation_id, 'V1', 0, nv.name, nv.imo_number, nv.built_year, nv.gross_tonnage, nv.flag, nv.vessel_type, nv.classification, nv.call_sign]
                            )
                        }
                    }
                }
            }

            // Migration: Add premium_amount to quotation_vessels
            {
                const [qvPremCol] = await this.pool.query("SHOW COLUMNS FROM quotation_vessels LIKE 'premium_amount'") as any[]
                if (qvPremCol.length === 0) {
                    await this.pool.query('ALTER TABLE quotation_vessels ADD COLUMN premium_amount DECIMAL(15,2) NULL')
                }
            }

            // Migration: Create pi_additional_clause_sets tables
            await this.pool.query(`CREATE TABLE IF NOT EXISTS pi_additional_clause_sets (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
            await this.pool.query(`CREATE TABLE IF NOT EXISTS pi_additional_clause_set_items (
                id VARCHAR(36) PRIMARY KEY,
                set_id VARCHAR(36) NOT NULL,
                clause_id VARCHAR(36) NOT NULL,
                order_index INT DEFAULT 0,
                INDEX idx_acsi_set_id (set_id),
                INDEX idx_acsi_clause_id (clause_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

            // Migration: Add order_index to pi_additional_clause_set_items
            {
                const [acsiOrdCol] = await this.pool.query("SHOW COLUMNS FROM pi_additional_clause_set_items LIKE 'order_index'")
                if ((acsiOrdCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE pi_additional_clause_set_items ADD COLUMN order_index INT DEFAULT 0')
                }
            }

            // Migration: Add default_selected to pi_additional_clause_sets
            {
                const [acsDefCol] = await this.pool.query("SHOW COLUMNS FROM pi_additional_clause_sets LIKE 'default_selected'")
                if ((acsDefCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE pi_additional_clause_sets ADD COLUMN default_selected BOOLEAN DEFAULT FALSE')
                }
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
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
                // Add columns that may be missing from older table versions
                const [swColCsi] = await this.pool.query("SHOW COLUMNS FROM survey_warranties LIKE 'condition_survey_id'")
                if ((swColCsi as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranties ADD COLUMN condition_survey_id VARCHAR(36) NULL`)
                }
                const [swColCn] = await this.pool.query("SHOW COLUMNS FROM survey_warranties LIKE 'completion_notes'")
                if ((swColCn as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranties ADD COLUMN completion_notes TEXT NULL`)
                }
                const [swColWr] = await this.pool.query("SHOW COLUMNS FROM survey_warranties LIKE 'waiver_reason'")
                if ((swColWr as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranties ADD COLUMN waiver_reason TEXT NULL`)
                }
                const [swColCa] = await this.pool.query("SHOW COLUMNS FROM survey_warranties LIKE 'completed_at'")
                if ((swColCa as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranties ADD COLUMN completed_at DATETIME NULL`)
                }
                const [swColCr] = await this.pool.query("SHOW COLUMNS FROM survey_warranties LIKE 'created_at'")
                if ((swColCr as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranties ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`)
                }
                // Ensure status ENUM includes all values
                const [swStatusInfo] = await this.pool.query("SHOW COLUMNS FROM survey_warranties LIKE 'status'")
                const swStatusCol = (swStatusInfo as any[])[0]
                if (swStatusCol && !String(swStatusCol.Type).includes('completed')) {
                    await this.pool.query(`ALTER TABLE survey_warranties MODIFY COLUMN status ENUM('pending','survey_done','completed','waived') NOT NULL DEFAULT 'pending'`)
                }
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
                // Migration: add created_at column if missing
                const [swrColCa] = await this.pool.query("SHOW COLUMNS FROM survey_warranty_reminders LIKE 'created_at'")
                if ((swrColCa as any[]).length === 0) {
                    await this.pool.query(`ALTER TABLE survey_warranty_reminders ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`)
                }
            }

            // Migration: Create classification_societies table if it doesn't exist
            const [classSocTables] = await this.pool.query("SHOW TABLES LIKE 'classification_societies'")
            if ((classSocTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE classification_societies (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    abbreviation VARCHAR(20) NOT NULL DEFAULT '',
                    is_iacs BOOLEAN DEFAULT 0,
                    order_index INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            } else {
                await this.pool.query(`ALTER TABLE classification_societies CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
            }

            // Migration: Create vessel_classifications table if it doesn't exist
            const [vesselClassTables] = await this.pool.query("SHOW TABLES LIKE 'vessel_classifications'")
            if ((vesselClassTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE vessel_classifications (
                    id VARCHAR(36) PRIMARY KEY,
                    vessel_id VARCHAR(36) NOT NULL,
                    classification_society_id VARCHAR(36) NOT NULL,
                    INDEX idx_vc_vessel (vessel_id),
                    INDEX idx_vc_cs (classification_society_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            } else {
                await this.pool.query(`ALTER TABLE vessel_classifications CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
            }

            // Migration: Create war_breach_records table
            const [wbrTables] = await this.pool.query("SHOW TABLES LIKE 'war_breach_records'")
            if ((wbrTables as any[]).length === 0) {
                await this.pool.query(`CREATE TABLE war_breach_records (
                    id VARCHAR(36) PRIMARY KEY,
                    cover_note_no VARCHAR(200) NULL,
                    currency VARCHAR(50) NULL,
                    breach_details VARCHAR(1000) NULL,
                    base_days INT NOT NULL DEFAULT 7,
                    settings_json TEXT NOT NULL,
                    vessels_json TEXT NOT NULL,
                    total_net_due DECIMAL(18,4) NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_wbr_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            }

            // Warranty sets tables (disable FK checks to avoid collation mismatch)
            {
                const [t] = await this.pool.query("SHOW TABLES LIKE 'pi_warranty_sets'") as any[]
                if (t.length === 0) {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                    await this.pool.query(`CREATE TABLE pi_warranty_sets (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
                const [t2] = await this.pool.query("SHOW TABLES LIKE 'pi_warranty_set_items'") as any[]
                if (t2.length === 0) {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                    await this.pool.query(`CREATE TABLE pi_warranty_set_items (
                        id VARCHAR(36) PRIMARY KEY,
                        set_id VARCHAR(36) NOT NULL,
                        warranty_id VARCHAR(36) NOT NULL,
                        FOREIGN KEY (set_id) REFERENCES pi_warranty_sets(id) ON DELETE CASCADE,
                        FOREIGN KEY (warranty_id) REFERENCES pi_warranties(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                } else {
                    // Fix collation mismatch on existing table
                    try {
                        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                        await this.pool.query('ALTER TABLE pi_warranty_set_items CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
                        await this.pool.query('ALTER TABLE pi_warranty_sets CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
                        await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                    } catch (e) {
                        console.error('Migration warning: collation fix for warranty set tables:', e)
                        try { await this.pool.query('SET FOREIGN_KEY_CHECKS=1') } catch { /* ignore */ }
                    }
                }
            }

            // Quotation custom warranties + order_index migration
            {
                const [t] = await this.pool.query("SHOW TABLES LIKE 'quotation_custom_warranties'") as any[]
                if (t.length === 0) {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                    await this.pool.query(`CREATE TABLE quotation_custom_warranties (
                        id VARCHAR(36) PRIMARY KEY,
                        quotation_id VARCHAR(36) NOT NULL,
                        text TEXT NOT NULL,
                        order_index INT DEFAULT 0,
                        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
            }

            // Add order_index to quotation_warranties if missing
            {
                const [cols] = await this.pool.query("SHOW COLUMNS FROM quotation_warranties LIKE 'order_index'") as any[]
                if (cols.length === 0) {
                    await this.pool.query('ALTER TABLE quotation_warranties ADD COLUMN order_index INT DEFAULT 0')
                }
            }

            // Add default_selected to pi_warranty_sets if missing
            {
                const [t] = await this.pool.query("SHOW TABLES LIKE 'pi_warranty_sets'") as any[]
                if (t.length > 0) {
                    const [dsCols] = await this.pool.query("SHOW COLUMNS FROM pi_warranty_sets LIKE 'default_selected'") as any[]
                    if (dsCols.length === 0) {
                        await this.pool.query('ALTER TABLE pi_warranty_sets ADD COLUMN default_selected BOOLEAN DEFAULT FALSE')
                    }
                }
            }

            // Migration: Create pi_text_deductibles table
            await this.pool.query(`CREATE TABLE IF NOT EXISTS pi_text_deductibles (
                id VARCHAR(36) PRIMARY KEY,
                text TEXT NOT NULL,
                default_included BOOLEAN DEFAULT FALSE,
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

            // Migration: Add pi_text_deductible_id to quotation_text_deductibles if missing
            {
                const [ptdCol] = await this.pool.query("SHOW COLUMNS FROM quotation_text_deductibles LIKE 'pi_text_deductible_id'") as any[]
                if (ptdCol.length === 0) {
                    await this.pool.query('ALTER TABLE quotation_text_deductibles ADD COLUMN pi_text_deductible_id VARCHAR(36) NULL AFTER quotation_id')
                }
            }

            // Migration: Add title column to pi_deductibles if missing
            {
                const [pdtCol] = await this.pool.query("SHOW COLUMNS FROM pi_deductibles LIKE 'title'") as any[]
                if (pdtCol.length === 0) {
                    await this.pool.query("ALTER TABLE pi_deductibles ADD COLUMN title VARCHAR(255) DEFAULT '' AFTER id")
                }
            }

            // Migration: Add title column to quotation_deductibles if missing
            {
                const [qdtCol] = await this.pool.query("SHOW COLUMNS FROM quotation_deductibles LIKE 'title'") as any[]
                if (qdtCol.length === 0) {
                    await this.pool.query("ALTER TABLE quotation_deductibles ADD COLUMN title VARCHAR(255) DEFAULT '' AFTER pi_deductible_id")
                }
            }

            // Migration: Add title column to pi_text_deductibles if missing
            {
                const [ptdtCol] = await this.pool.query("SHOW COLUMNS FROM pi_text_deductibles LIKE 'title'") as any[]
                if (ptdtCol.length === 0) {
                    await this.pool.query("ALTER TABLE pi_text_deductibles ADD COLUMN title VARCHAR(255) DEFAULT '' AFTER id")
                }
            }

            // Migration: Add title column to quotation_text_deductibles if missing
            {
                const [qtdtCol] = await this.pool.query("SHOW COLUMNS FROM quotation_text_deductibles LIKE 'title'") as any[]
                if (qtdtCol.length === 0) {
                    await this.pool.query("ALTER TABLE quotation_text_deductibles ADD COLUMN title VARCHAR(255) DEFAULT '' AFTER pi_text_deductible_id")
                }
            }

            // Migration: Add deductible_aggregate_enabled to quotations if missing
            {
                const [daeCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'deductible_aggregate_enabled'") as any[]
                if (daeCol.length === 0) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN deductible_aggregate_enabled BOOLEAN DEFAULT TRUE AFTER vdr_deductible_enabled')
                }
            }

            // Migration: Create pi_subjectivities and pi_subjectivity_doc_types tables
            {
                const [piSubjTable] = await this.pool.query("SHOW TABLES LIKE 'pi_subjectivities'") as any[]
                if (piSubjTable.length === 0) {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS pi_subjectivities (
                        id VARCHAR(36) PRIMARY KEY,
                        text TEXT NOT NULL,
                        order_index INT DEFAULT 0
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS pi_subjectivity_doc_types (
                        id VARCHAR(36) PRIMARY KEY,
                        subjectivity_id VARCHAR(36) NOT NULL,
                        doc_type_id VARCHAR(36) NOT NULL,
                        FOREIGN KEY (subjectivity_id) REFERENCES pi_subjectivities(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
            }

            // Migration: Add new columns to quotation_subjectivities
            {
                const [psCol] = await this.pool.query("SHOW COLUMNS FROM quotation_subjectivities LIKE 'pi_subjectivity_id'") as any[]
                if (psCol.length === 0) {
                    await this.pool.query('ALTER TABLE quotation_subjectivities ADD COLUMN pi_subjectivity_id VARCHAR(36) AFTER quotation_id')
                    await this.pool.query('ALTER TABLE quotation_subjectivities ADD COLUMN is_custom BOOLEAN DEFAULT FALSE AFTER text')
                    await this.pool.query('ALTER TABLE quotation_subjectivities ADD COLUMN is_auto_populated BOOLEAN DEFAULT FALSE AFTER is_custom')
                }
            }

            // Migration: Add non_refundable_type and non_refundable_percent to quotations
            {
                const [nrtCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'non_refundable_type'") as any[]
                if (nrtCol.length === 0) {
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN non_refundable_type VARCHAR(20) DEFAULT NULL")
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN non_refundable_percent DECIMAL(5,2) DEFAULT NULL")
                }
            }

            // Migration: Add vessel_scope column to quotation item tables
            {
                const vscopeTables = [
                    'quotation_warranties', 'quotation_custom_warranties', 'quotation_deductibles',
                    'quotation_text_deductibles', 'quotation_subjectivities', 'quotation_clauses',
                    'quotation_additional_clauses', 'quotation_exclusions', 'quotation_custom_exclusions'
                ]
                for (const tbl of vscopeTables) {
                    const [vsCols] = await this.pool.query(`SHOW COLUMNS FROM ${tbl} LIKE 'vessel_scope'`) as any[]
                    if (vsCols.length === 0) {
                        await this.pool.query(`ALTER TABLE ${tbl} ADD COLUMN vessel_scope TEXT DEFAULT NULL`)
                    }
                }
            }

            // Migration: add section_order column to quotations, create quotation_custom_sections table
            {
                const [soCol] = await this.pool.query(`SHOW COLUMNS FROM quotations LIKE 'section_order'`) as any[]
                if (soCol.length === 0) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN section_order TEXT DEFAULT NULL')
                }
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_custom_sections (
                        id VARCHAR(36) PRIMARY KEY,
                        quotation_id VARCHAR(36) NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        text TEXT,
                        order_index INT DEFAULT 0
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
            }

            // Migration: add is_cargo_related to pi_exclusions, create vessel type map + custom exclusions tables
            {
                const [exCols] = await this.pool.query(`SHOW COLUMNS FROM pi_exclusions LIKE 'is_cargo_related'`) as any[]
                if (exCols.length === 0) {
                    await this.pool.query('ALTER TABLE pi_exclusions ADD COLUMN is_cargo_related BOOLEAN DEFAULT FALSE AFTER text')
                }
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS pi_exclusion_vessel_type_map (
                        exclusion_id VARCHAR(36) NOT NULL,
                        vessel_type_id VARCHAR(36) NOT NULL,
                        PRIMARY KEY (exclusion_id, vessel_type_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_custom_exclusions (
                        id VARCHAR(36) PRIMARY KEY,
                        quotation_id VARCHAR(36) NOT NULL,
                        text TEXT NOT NULL,
                        order_index INT DEFAULT 0,
                        vessel_scope TEXT DEFAULT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
            }

            // Migration: quotation_types table + quotation_type_id on quotations
            {
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_types (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        code VARCHAR(10) NOT NULL,
                        order_index INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
                // Seed default quotation types if table is empty
                const [qtRows] = await this.pool.query('SELECT COUNT(*) as cnt FROM quotation_types') as any[]
                if (qtRows[0].cnt === 0) {
                    const defaults = [
                        { name: 'P&I', code: 'P', order: 0 },
                        { name: 'H&M', code: 'H', order: 1 },
                        { name: 'War Risk', code: 'W', order: 2 },
                        { name: 'FDD', code: 'F', order: 3 },
                        { name: 'Loss of Hire', code: 'L', order: 4 }
                    ]
                    for (const d of defaults) {
                        await this.pool.execute(
                            'INSERT INTO quotation_types (id, name, code, order_index) VALUES (?, ?, ?, ?)',
                            [uuidv4(), d.name, d.code, d.order]
                        )
                    }
                }
                // Add quotation_type_id column to quotations if missing
                const [qtCols] = await this.pool.query(`SHOW COLUMNS FROM quotations LIKE 'quotation_type_id'`) as any[]
                if (qtCols.length === 0) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN quotation_type_id VARCHAR(36) AFTER reference_number')
                    // Migrate existing quotations to P&I type
                    const [piType] = await this.pool.query(`SELECT id FROM quotation_types WHERE code = 'P' LIMIT 1`) as any[]
                    if (piType.length > 0) {
                        await this.pool.execute('UPDATE quotations SET quotation_type_id = ? WHERE quotation_type_id IS NULL', [piType[0].id])
                    }
                }
            }

            // Final collation normalization pass — catches any tables created or altered
            // during migration blocks above (must run after all CREATE/ALTER Table statements).
            // Each table is converted independently so one failure never blocks the rest.
            try {
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                const [mismatchedFinal] = await this.pool.query(`
                    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_COLLATION != 'utf8mb4_unicode_ci'
                    AND TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_NAME ASC
                `) as any[]
                for (const row of (mismatchedFinal as any[])) {
                    try {
                        await this.pool.query(
                            `ALTER TABLE \`${row.TABLE_NAME}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
                        )
                    } catch (tableErr) {
                        console.error(`Migration warning: failed to convert table ${row.TABLE_NAME}:`, tableErr)
                    }
                }
                await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
            } catch (e) {
                console.error('Migration error (final collation normalization):', e)
                try { await this.pool.query('SET FOREIGN_KEY_CHECKS=1') } catch { /* ignore */ }
            }

            // Migration: add ncb/upcc discount type and amount columns
            {
                const [ndtCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'ncb_discount_type'") as any[]
                if ((ndtCol as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN ncb_discount_type VARCHAR(20) DEFAULT 'percentage'")
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN ncb_discount_amount DECIMAL(15,2) NULL')
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN cpc_discount_type VARCHAR(20) DEFAULT 'percentage'")
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN cpc_discount_amount DECIMAL(15,2) NULL')
                }
            }

            // Migration: add description_override to pi_clause_set_items
            {
                const [csiCol] = await this.pool.query("SHOW COLUMNS FROM pi_clause_set_items LIKE 'description_override'") as any[]
                if ((csiCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE pi_clause_set_items ADD COLUMN description_override TEXT DEFAULT NULL')
                }
            }

            // Migration: add hull fields to quotations
            {
                const [avCol] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'agreed_value'") as any[]
                if ((avCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN agreed_value DECIMAL(15,2) DEFAULT NULL')
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN agreed_value_currency VARCHAR(10) DEFAULT 'USD'")
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN hull_clause_id VARCHAR(36) DEFAULT NULL')
                }
            }

            // Migration: create hull tables if they don't exist
            {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS hull_agreed_value_texts (
                    id VARCHAR(36) PRIMARY KEY,
                    text TEXT NOT NULL,
                    default_selected BOOLEAN DEFAULT FALSE,
                    order_index INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')

                await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_agreed_value_items (
                    id VARCHAR(36) PRIMARY KEY,
                    quotation_id VARCHAR(36) NOT NULL,
                    hull_text_id VARCHAR(36) DEFAULT NULL,
                    text TEXT NOT NULL,
                    order_index INT DEFAULT 0,
                    vessel_scope TEXT DEFAULT NULL,
                    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS hull_clauses (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    code VARCHAR(50) NOT NULL,
                    description TEXT,
                    order_index INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS hull_clause_conditions (
                    id VARCHAR(36) PRIMARY KEY,
                    hull_clause_id VARCHAR(36) NOT NULL,
                    condition_number VARCHAR(20) NOT NULL,
                    text TEXT NOT NULL,
                    default_selected BOOLEAN DEFAULT FALSE,
                    order_index INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (hull_clause_id) REFERENCES hull_clauses(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS hull_additional_conditions (
                    id VARCHAR(36) PRIMARY KEY,
                    title VARCHAR(255) NULL,
                    text TEXT NOT NULL,
                    default_selected BOOLEAN DEFAULT FALSE,
                    order_index INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_hull_conditions (
                    id VARCHAR(36) PRIMARY KEY,
                    quotation_id VARCHAR(36) NOT NULL,
                    hull_condition_id VARCHAR(36) NOT NULL,
                    text_override TEXT DEFAULT NULL,
                    order_index INT DEFAULT 0,
                    vessel_scope TEXT DEFAULT NULL,
                    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_hull_additional_conditions (
                    id VARCHAR(36) PRIMARY KEY,
                    quotation_id VARCHAR(36) NOT NULL,
                    hull_additional_condition_id VARCHAR(36) NOT NULL,
                    text_override TEXT DEFAULT NULL,
                    order_index INT DEFAULT 0,
                    vessel_scope TEXT DEFAULT NULL,
                    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query('SET FOREIGN_KEY_CHECKS=1')

                // Migration: Add title column to hull_additional_conditions
                const [hacTitleCol] = await this.pool.query("SHOW COLUMNS FROM hull_additional_conditions LIKE 'title'")
                if ((hacTitleCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE hull_additional_conditions ADD COLUMN title VARCHAR(255) NULL AFTER id')
                }

                // Migration: junction table for additional condition ↔ hull clause (many-to-many)
                await this.pool.query(`CREATE TABLE IF NOT EXISTS hull_additional_condition_clauses (
                    additional_condition_id VARCHAR(36) NOT NULL,
                    hull_clause_id VARCHAR(36) NOT NULL,
                    PRIMARY KEY (additional_condition_id, hull_clause_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            }

            // Migration: add type_scope to warranties and subjectivities
            {
                const [wsCol] = await this.pool.query("SHOW COLUMNS FROM pi_warranties LIKE 'type_scope'") as any[]
                if ((wsCol as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE pi_warranties ADD COLUMN type_scope VARCHAR(10) DEFAULT 'both'")
                }
                const [ssCol] = await this.pool.query("SHOW COLUMNS FROM pi_subjectivities LIKE 'type_scope'") as any[]
                if ((ssCol as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE pi_subjectivities ADD COLUMN type_scope VARCHAR(10) DEFAULT 'both'")
                }
            }

            // Migration: add type_scope to warranty tags and sets, rename 'both' → 'all'
            {
                const [tsCol] = await this.pool.query("SHOW COLUMNS FROM pi_warranty_tags LIKE 'type_scope'") as any[]
                if ((tsCol as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE pi_warranty_tags ADD COLUMN type_scope VARCHAR(10) DEFAULT 'all'")
                }
                const [ssCol2] = await this.pool.query("SHOW COLUMNS FROM pi_warranty_sets LIKE 'type_scope'") as any[]
                if ((ssCol2 as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE pi_warranty_sets ADD COLUMN type_scope VARCHAR(10) DEFAULT 'all'")
                }
                // Rename 'both' → 'all' across all tables
                await this.pool.query("UPDATE pi_warranties SET type_scope = 'all' WHERE type_scope = 'both'")
                await this.pool.query("UPDATE pi_subjectivities SET type_scope = 'all' WHERE type_scope = 'both'")
                await this.pool.query("UPDATE pi_warranty_tags SET type_scope = 'all' WHERE type_scope = 'both'")
                await this.pool.query("UPDATE pi_warranty_sets SET type_scope = 'all' WHERE type_scope = 'both'")
            }

            // Migration: Hull IV extension — condition_section, iv_value, iv_currency, iv_premium_amount
            {
                const [cs1] = await this.pool.query("SHOW COLUMNS FROM hull_clause_conditions LIKE 'condition_section'") as any[]
                if ((cs1 as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE hull_clause_conditions ADD COLUMN condition_section VARCHAR(10) DEFAULT 'both'")
                }
                const [cs2] = await this.pool.query("SHOW COLUMNS FROM quotation_hull_conditions LIKE 'condition_section'") as any[]
                if ((cs2 as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotation_hull_conditions ADD COLUMN condition_section VARCHAR(10) DEFAULT 'both'")
                }
                const [ivv] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'iv_value'") as any[]
                if ((ivv as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN iv_value DECIMAL(15,2) DEFAULT NULL")
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN iv_currency VARCHAR(10) DEFAULT 'USD'")
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN iv_premium_amount DECIMAL(15,2) DEFAULT NULL")
                }
                const [ive] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'iv_enabled'") as any[]
                if ((ive as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN iv_enabled BOOLEAN DEFAULT FALSE")
                }
                const [ivc] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'iv_clause_id'") as any[]
                if ((ivc as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotations ADD COLUMN iv_clause_id VARCHAR(36) DEFAULT NULL")
                }
            }

            // Migration: Hull clause-level section, condition amounts, agreed value sections
            {
                const [hcs] = await this.pool.query("SHOW COLUMNS FROM hull_clauses LIKE 'condition_section'") as any[]
                if ((hcs as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE hull_clauses ADD COLUMN condition_section VARCHAR(10) DEFAULT 'hm'")
                }
                const [ham] = await this.pool.query("SHOW COLUMNS FROM hull_clause_conditions LIKE 'has_amount'") as any[]
                if ((ham as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE hull_clause_conditions ADD COLUMN has_amount BOOLEAN DEFAULT FALSE")
                    await this.pool.query("ALTER TABLE hull_clause_conditions ADD COLUMN amount_placeholder VARCHAR(100) DEFAULT NULL")
                }
                const [qca] = await this.pool.query("SHOW COLUMNS FROM quotation_hull_conditions LIKE 'amount'") as any[]
                if ((qca as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotation_hull_conditions ADD COLUMN amount DECIMAL(15,2) DEFAULT NULL")
                }
                const [avs] = await this.pool.query("SHOW COLUMNS FROM hull_agreed_value_texts LIKE 'section'") as any[]
                if ((avs as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE hull_agreed_value_texts ADD COLUMN section VARCHAR(10) DEFAULT 'hm'")
                }
                const [qas] = await this.pool.query("SHOW COLUMNS FROM quotation_agreed_value_items LIKE 'section'") as any[]
                if ((qas as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotation_agreed_value_items ADD COLUMN section VARCHAR(10) DEFAULT 'hm'")
                }
            }

            // Migration: Hull additional conditions amount support
            {
                const [hacAmt] = await this.pool.query("SHOW COLUMNS FROM hull_additional_conditions LIKE 'has_amount'") as any[]
                if ((hacAmt as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE hull_additional_conditions ADD COLUMN has_amount BOOLEAN DEFAULT FALSE")
                    await this.pool.query("ALTER TABLE hull_additional_conditions ADD COLUMN amount_placeholder VARCHAR(100) DEFAULT NULL")
                }
                const [qhacAmt] = await this.pool.query("SHOW COLUMNS FROM quotation_hull_additional_conditions LIKE 'amount'") as any[]
                if ((qhacAmt as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotation_hull_additional_conditions ADD COLUMN amount DECIMAL(15,2) DEFAULT NULL")
                }
            }

            // Migration: Hull alternatives table + alternative_id columns
            {
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_hull_alternatives (
                        id VARCHAR(36) PRIMARY KEY,
                        quotation_id VARCHAR(36) NOT NULL,
                        hull_clause_id VARCHAR(36) NOT NULL,
                        label VARCHAR(100) DEFAULT NULL,
                        premium_amount DECIMAL(15,2) DEFAULT NULL,
                        order_index INT DEFAULT 0,
                        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
                const [altCol1] = await this.pool.query("SHOW COLUMNS FROM quotation_hull_conditions LIKE 'alternative_id'") as any[]
                if ((altCol1 as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotation_hull_conditions ADD COLUMN alternative_id VARCHAR(36) DEFAULT NULL")
                }
                const [altCol2] = await this.pool.query("SHOW COLUMNS FROM quotation_hull_additional_conditions LIKE 'alternative_id'") as any[]
                if ((altCol2 as any[]).length === 0) {
                    await this.pool.query("ALTER TABLE quotation_hull_additional_conditions ADD COLUMN alternative_id VARCHAR(36) DEFAULT NULL")
                }
                // Migrate existing hull quotations: create a single alternative from hull_clause_id
                const [existingHull] = await this.pool.query(`
                    SELECT q.id, q.hull_clause_id, q.premium_amount
                    FROM quotations q
                    LEFT JOIN quotation_hull_alternatives qha ON qha.quotation_id = q.id
                    WHERE q.hull_clause_id IS NOT NULL AND qha.id IS NULL
                `) as any[]
                if ((existingHull as any[]).length > 0) {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                    try {
                for (const q of existingHull as any[]) {
                    const altId = uuidv4()
                    await this.pool.execute(
                        'INSERT INTO quotation_hull_alternatives (id, quotation_id, hull_clause_id, premium_amount, order_index) VALUES (?, ?, ?, ?, 0)',
                        [altId, q.id, q.hull_clause_id, q.premium_amount ?? null]
                    )
                    // Link existing H&M conditions to this alternative
                    await this.pool.execute(
                        `UPDATE quotation_hull_conditions qhc
                         SET qhc.alternative_id = ?
                         WHERE qhc.quotation_id = ?
                           AND qhc.alternative_id IS NULL
                           AND EXISTS (
                             SELECT 1 FROM hull_clause_conditions hcc
                             WHERE hcc.id = qhc.hull_condition_id AND hcc.hull_clause_id = ?
                           )`,
                        [altId, q.id, q.hull_clause_id]
                    )
                    // Link existing additional conditions to this alternative where applicable
                    await this.pool.execute(
                        `UPDATE quotation_hull_additional_conditions qhac
                         SET qhac.alternative_id = ?
                         WHERE qhac.quotation_id = ?
                           AND qhac.alternative_id IS NULL
                           AND EXISTS (
                             SELECT 1 FROM hull_additional_condition_clauses hacc
                             WHERE hacc.additional_condition_id = qhac.hull_additional_condition_id
                               AND hacc.hull_clause_id = ?
                           )`,
                        [altId, q.id, q.hull_clause_id]
                    )
                }
                    } finally {
                        await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                    }
                }
            }

            // Migration: War Risk tables
          {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS war_conditions (
                    id VARCHAR(36) PRIMARY KEY,
                    text TEXT NOT NULL,
                    default_selected BOOLEAN DEFAULT FALSE,
                    order_index INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_war_conditions (
                    id VARCHAR(36) PRIMARY KEY,
                    quotation_id VARCHAR(36) NOT NULL,
                    war_condition_id VARCHAR(36) NOT NULL,
                    text_override TEXT DEFAULT NULL,
                    order_index INT DEFAULT 0,
                    vessel_scope TEXT DEFAULT NULL,
                    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
            }

            // Migration: P&I alternatives
            {
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS quotation_pi_alternatives (
                        id VARCHAR(36) PRIMARY KEY,
                        quotation_id VARCHAR(36) NOT NULL,
                        label VARCHAR(255) DEFAULT NULL,
                        premium_amount DECIMAL(15,2) DEFAULT NULL,
                        order_index INT DEFAULT 0,
                        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }

                // Add alternative_id to P&I junction tables
                const piAltTables = [
                    'quotation_clauses', 'quotation_additional_clauses',
                    'quotation_warranties', 'quotation_custom_warranties',
                    'quotation_deductibles', 'quotation_text_deductibles',
                    'quotation_exclusions', 'quotation_custom_exclusions'
                ]
                for (const tbl of piAltTables) {
                    const [cols] = await this.pool.query(`SHOW COLUMNS FROM ${tbl} LIKE 'alternative_id'`) as any[]
                    if ((cols as any[]).length === 0) {
                        await this.pool.query(`ALTER TABLE ${tbl} ADD COLUMN alternative_id VARCHAR(36) DEFAULT NULL`)
                    }
                }

                // Add alternative_scope to pi_warranty_sets
                {
                    const [wsCols] = await this.pool.query("SHOW COLUMNS FROM pi_warranty_sets LIKE 'alternative_scope'") as any[]
                    if ((wsCols as any[]).length === 0) {
                        await this.pool.query('ALTER TABLE pi_warranty_sets ADD COLUMN alternative_scope VARCHAR(20) DEFAULT NULL')
                    }
                }
            }

            // Migration: Quotation revision system
            {
                const [revCols] = await this.pool.query("SHOW COLUMNS FROM quotations LIKE 'revision_number'") as any[]
                if ((revCols as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN revision_number INT DEFAULT 0')
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN revision_group_id VARCHAR(36) DEFAULT NULL')
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN is_locked BOOLEAN DEFAULT FALSE')
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN export_snapshot MEDIUMTEXT DEFAULT NULL')
                    // Backfill: set revision_group_id = id for all existing quotations
                    await this.pool.query('UPDATE quotations SET revision_group_id = id WHERE revision_group_id IS NULL')
                    await this.pool.query('CREATE INDEX idx_quotations_revision_group ON quotations(revision_group_id)')
                }
            }

            // --- Entity Addresses + vessel_assureds.address_id ---
            {
                // Ensure entity_addresses table exists (migration fallback)
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS entity_addresses (
                        id VARCHAR(36) PRIMARY KEY,
                        entity_id VARCHAR(36) NOT NULL,
                        label VARCHAR(255) NOT NULL,
                        address_line1 VARCHAR(500) NOT NULL,
                        address_line2 VARCHAR(500),
                        city VARCHAR(255),
                        country VARCHAR(255),
                        postal_code VARCHAR(50),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }
                const [addrCols] = await this.pool.query(
                    "SHOW COLUMNS FROM vessel_assureds LIKE 'address_id'"
                )
                if ((addrCols as any[]).length === 0) {
                    await this.pool.query(
                        'ALTER TABLE vessel_assureds ADD COLUMN address_id VARCHAR(36) DEFAULT NULL'
                    )
                }
            }

            // --- RBAC: user_groups, group_permissions, user_group_members, user_permission_overrides ---
            {
                await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                try {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS user_groups (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        is_system BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS group_permissions (
                        group_id VARCHAR(36) NOT NULL,
                        permission_key VARCHAR(100) NOT NULL,
                        PRIMARY KEY (group_id, permission_key),
                        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS user_group_members (
                        user_id VARCHAR(36) NOT NULL,
                        group_id VARCHAR(36) NOT NULL,
                        PRIMARY KEY (user_id, group_id),
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS user_permission_overrides (
                        user_id VARCHAR(36) NOT NULL,
                        permission_key VARCHAR(100) NOT NULL,
                        granted BOOLEAN NOT NULL DEFAULT TRUE,
                        PRIMARY KEY (user_id, permission_key),
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                } finally {
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                }

                // Seed system groups if missing
                const [existingGroups] = await this.pool.query("SELECT id FROM user_groups WHERE is_system = TRUE")
                if ((existingGroups as any[]).length === 0) {
                    const adminGroupId = uuidv4()
                    const userGroupId = uuidv4()
                    await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
                    try {
                        await this.pool.execute(
                            "INSERT INTO user_groups (id, name, description, is_system) VALUES (?, 'Administrator', 'Full access to all features', TRUE)",
                            [adminGroupId]
                        )
                        await this.pool.execute(
                            "INSERT INTO user_groups (id, name, description, is_system) VALUES (?, 'User', 'Basic read access', TRUE)",
                            [userGroupId]
                        )
                        // Administrator group gets all permissions
                        const { ALL_PERMISSION_KEYS } = await import('../../shared/types')
                        for (const key of ALL_PERMISSION_KEYS) {
                            await this.pool.execute(
                                'INSERT IGNORE INTO group_permissions (group_id, permission_key) VALUES (?, ?)',
                                [adminGroupId, key]
                            )
                        }
                        // User group gets view-only permissions
                        const viewPerms = ALL_PERMISSION_KEYS.filter((k: string) => k.endsWith(':view'))
                        for (const key of viewPerms) {
                            await this.pool.execute(
                                'INSERT IGNORE INTO group_permissions (group_id, permission_key) VALUES (?, ?)',
                                [userGroupId, key]
                            )
                        }
                        // Assign existing admin users to Administrator group, others to User group
                        const [allUsers] = await this.pool.query('SELECT id, role FROM users')
                        for (const u of allUsers as any[]) {
                            const gid = u.role === 'admin' ? adminGroupId : userGroupId
                            await this.pool.execute(
                                'INSERT IGNORE INTO user_group_members (user_id, group_id) VALUES (?, ?)',
                                [u.id, gid]
                            )
                        }
                    } finally {
                        await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
                    }
                }
            }

            // Seed default email templates if table is empty
            {
                const [etRows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM email_templates')
                if ((etRows as any[])[0].cnt === 0) {
                    const seedTemplates = [
                        {
                            name: 'Renewal Reminder',
                            subject: 'Policy Renewal Reminder - {vesselName}',
                            body: 'Dear {customerName},\n\nThis is a reminder that the {policyType} policy (#{policyNumber}) for vessel {vesselName} (IMO: {imoNumber}) is due for renewal on {policyEndDate}.\n\nPlease arrange renewal at your earliest convenience.\n\nBest regards,\n{userName}\n{companyName}',
                            category: 'renewals'
                        },
                        {
                            name: 'Document Request',
                            subject: 'Document Request - {vesselName}',
                            body: 'Dear {customerName},\n\nWe are writing to request the following document for vessel {vesselName} (IMO: {imoNumber}):\n\n- {documentName}\n\nThe document is currently missing from our records. Please provide it at your earliest convenience.\n\nBest regards,\n{userName}\n{companyName}',
                            category: 'documents'
                        },
                        {
                            name: 'Warranty Follow-up',
                            subject: 'Warranty Follow-up - {vesselName}',
                            body: 'Dear {customerName},\n\nThis is a follow-up regarding the warranty for vessel {vesselName} (IMO: {imoNumber}):\n\nWarranty: {warrantyDescription}\nDeadline: {warrantyDeadline}\n\nPlease ensure compliance before the deadline.\n\nBest regards,\n{userName}\n{companyName}',
                            category: 'warranties'
                        }
                    ]
                    for (let i = 0; i < seedTemplates.length; i++) {
                        const t = seedTemplates[i]
                        await this.pool.execute(
                            'INSERT INTO email_templates (id, name, subject, body, category, is_system, order_index) VALUES (?, ?, ?, ?, ?, 1, ?)',
                            [uuidv4(), t.name, t.subject, t.body, t.category, i]
                        )
                    }
                }
            }

            // Add workflow columns to quotations
            {
                const [qCols] = await this.pool.query('SHOW COLUMNS FROM quotations')
                const qColNames = (qCols as any[]).map((c: any) => c.Field)
                if (!qColNames.includes('workflow_step_id')) await this.pool.query('ALTER TABLE quotations ADD COLUMN workflow_step_id VARCHAR(36) NULL')
                if (!qColNames.includes('revision_number')) await this.pool.query('ALTER TABLE quotations ADD COLUMN revision_number INT DEFAULT 0')
                if (!qColNames.includes('revision_group_id')) await this.pool.query('ALTER TABLE quotations ADD COLUMN revision_group_id VARCHAR(36) NULL')
                if (!qColNames.includes('is_locked')) await this.pool.query('ALTER TABLE quotations ADD COLUMN is_locked BOOLEAN DEFAULT FALSE')
                if (!qColNames.includes('export_snapshot')) await this.pool.query('ALTER TABLE quotations ADD COLUMN export_snapshot MEDIUMTEXT NULL')
                if (!qColNames.includes('created_by')) await this.pool.query('ALTER TABLE quotations ADD COLUMN created_by VARCHAR(36) NULL')
            }

            // Seed default workflow steps if table is empty
            {
                const [wsRows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM quotation_workflow_steps')
                if ((wsRows as any[])[0].cnt === 0) {
                    const draftId = uuidv4(), reviewId = uuidv4(), approvedId = uuidv4(), sentId = uuidv4()
                    const seedSteps = [
                        { id: draftId, name: 'Draft', color: '#6b7280', order: 0, canEdit: true, canExport: false, isLockPoint: false, isInitial: true },
                        { id: reviewId, name: 'Under Review', color: '#f59e0b', order: 1, canEdit: true, canExport: true, isLockPoint: false, isInitial: false },
                        { id: approvedId, name: 'Approved', color: '#3b82f6', order: 2, canEdit: true, canExport: true, isLockPoint: false, isInitial: false },
                        { id: sentId, name: 'Sent', color: '#8b5cf6', order: 3, canEdit: false, canExport: true, isLockPoint: true, isInitial: false },
                    ]
                    for (const s of seedSteps) {
                        await this.pool.execute(
                            'INSERT INTO quotation_workflow_steps (id, name, color, order_index, can_edit, can_export, is_lock_point, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [s.id, s.name, s.color, s.order, s.canEdit, s.canExport, s.isLockPoint, s.isInitial]
                        )
                    }
                    // Seed transitions
                    const seedTransitions = [
                        { from: draftId, to: reviewId, perm: null, autoRev: false },
                        { from: draftId, to: approvedId, perm: 'quotations:approve', autoRev: false },
                        { from: draftId, to: sentId, perm: 'quotations:send', autoRev: false },
                        { from: reviewId, to: approvedId, perm: 'quotations:approve', autoRev: false },
                        { from: reviewId, to: draftId, perm: null, autoRev: false },
                        { from: approvedId, to: sentId, perm: null, autoRev: false },
                        { from: approvedId, to: draftId, perm: null, autoRev: false },
                        { from: sentId, to: draftId, perm: null, autoRev: true },
                    ]
                    for (const t of seedTransitions) {
                        await this.pool.execute(
                            'INSERT INTO quotation_workflow_transitions (id, from_step_id, to_step_id, permission_key, auto_create_revision) VALUES (?, ?, ?, ?, ?)',
                            [uuidv4(), t.from, t.to, t.perm, t.autoRev]
                        )
                    }
                    // Set existing quotations to Draft step
                    await this.pool.query('UPDATE quotations SET workflow_step_id = ? WHERE workflow_step_id IS NULL', [draftId])
                }
            }

            // Migration: Seed "Converted" workflow step if it doesn't exist
            {
                const [convRows] = await this.pool.query(
                    "SELECT id FROM quotation_workflow_steps WHERE name = 'Converted'"
                )
                if ((convRows as any[]).length === 0) {
                    const convertedId = uuidv4()
                    const [maxOrdRows] = await this.pool.query(
                        'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM quotation_workflow_steps'
                    )
                    const nextOrder = (maxOrdRows as any[])[0].nextOrder
                    await this.pool.execute(
                        'INSERT INTO quotation_workflow_steps (id, name, color, order_index, can_edit, can_export, is_lock_point, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [convertedId, 'Converted', '#22c55e', nextOrder, false, true, true, false]
                    )
                    // Add transition from Sent → Converted
                    const [sentRows] = await this.pool.query(
                        "SELECT id FROM quotation_workflow_steps WHERE name = 'Sent'"
                    )
                    if ((sentRows as any[]).length > 0) {
                        const sentId = (sentRows as any[])[0].id
                        await this.pool.execute(
                            'INSERT INTO quotation_workflow_transitions (id, from_step_id, to_step_id, permission_key, auto_create_revision) VALUES (?, ?, ?, ?, ?)',
                            [uuidv4(), sentId, convertedId, null, false]
                        )
                    }
                }
            }

            // Ensure policy_documents table exists
            await this.pool.query(`CREATE TABLE IF NOT EXISTS policy_documents (
                id VARCHAR(36) PRIMARY KEY,
                quotation_id VARCHAR(36) NOT NULL,
                vessel_id VARCHAR(36) NOT NULL,
                policy_number VARCHAR(100) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                revision_number INT DEFAULT 0,
                inception_date VARCHAR(20),
                inception_time VARCHAR(10),
                expiry_date VARCHAR(20),
                expiry_time VARCHAR(10),
                timezone VARCHAR(100),
                commission_percent DECIMAL(5,2) NULL,
                show_addresses TINYINT(1) DEFAULT 0,
                bank_id VARCHAR(36) NULL,
                pro_rata TINYINT(1) DEFAULT 0,
                per_annum_premium DECIMAL(15,2) NULL,
                premium_amount DECIMAL(15,2) NULL,
                opening_clause TEXT NULL,
                important_notice TEXT NULL,
                closing_city VARCHAR(255) NULL,
                cancel_replace_text TEXT NULL,
                previous_policy_number VARCHAR(100) NULL,
                previous_policy_date VARCHAR(20) NULL,
                created_by VARCHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`)

            // Migration: add premium_amount to policy_documents if missing
            {
                const [pdPremCol] = await this.pool.query("SHOW COLUMNS FROM policy_documents LIKE 'premium_amount'")
                if ((pdPremCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE policy_documents ADD COLUMN premium_amount DECIMAL(15,2) NULL')
                }
            }
            // Migration: add selected_alternative_id to policy_documents
            {
                const [pdAltCol] = await this.pool.query("SHOW COLUMNS FROM policy_documents LIKE 'selected_alternative_id'")
                if ((pdAltCol as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE policy_documents ADD COLUMN selected_alternative_id VARCHAR(36) NULL')
                }
            }
            // Add exported_at column
            {
                const [cols] = await this.pool.query('SHOW COLUMNS FROM policy_documents LIKE \'exported_at\'')
                if ((cols as any[]).length === 0) {
                    await this.pool.query('ALTER TABLE policy_documents ADD COLUMN exported_at TIMESTAMP NULL')
                }
            }

            // Ensure policy_doc_instalments table exists
            await this.pool.query(`CREATE TABLE IF NOT EXISTS policy_doc_instalments (
                id VARCHAR(36) PRIMARY KEY,
                policy_doc_id VARCHAR(36) NOT NULL,
                instalment_number INT NOT NULL,
                due_date VARCHAR(20),
                premium_amount DECIMAL(15,2) DEFAULT 0,
                commission_amount DECIMAL(15,2) DEFAULT 0,
                is_non_refundable TINYINT(1) DEFAULT 0
            )`)

            // Ensure policy_doc_addresses table exists
            await this.pool.query(`CREATE TABLE IF NOT EXISTS policy_doc_addresses (
                id VARCHAR(36) PRIMARY KEY,
                policy_doc_id VARCHAR(36) NOT NULL,
                entity_id VARCHAR(36) NULL,
                role VARCHAR(100),
                address_text TEXT
            )`)

            // Ensure policy_blue_cards table exists
            await this.pool.query(`CREATE TABLE IF NOT EXISTS policy_blue_cards (
                id VARCHAR(36) PRIMARY KEY,
                policy_doc_id VARCHAR(36) NOT NULL,
                card_type VARCHAR(20) NOT NULL,
                card_number VARCHAR(100),
                inception_date VARCHAR(20),
                expiry_date VARCHAR(20),
                revision_number INT DEFAULT 0,
                issued_date VARCHAR(20)
            )`)

            // Ensure banks table exists
            await this.pool.query(`CREATE TABLE IF NOT EXISTS banks (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                details TEXT,
                order_index INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`)

            // Migrate policy_blue_cards — add owner/port/addressedTo/status columns
            {
                const [bcMigCols] = await this.pool.query('SHOW COLUMNS FROM policy_blue_cards') as any[]
                const bcMigColNames = bcMigCols.map((c: any) => c.Field)
                const bcNewCols: [string, string][] = [
                    ['status', `VARCHAR(20) DEFAULT 'active'`],
                    ['owner_entity_id', 'VARCHAR(36) NULL'],
                    ['owner_name', 'VARCHAR(255) NULL'],
                    ['owner_address', 'TEXT NULL'],
                    ['port_of_registry', 'VARCHAR(255) NULL'],
                    ['addressed_to_flag_id', 'VARCHAR(36) NULL'],
                    ['addressed_to_name', 'VARCHAR(255) NULL'],
                    ['addressed_to_address', 'TEXT NULL'],
                    ['cancel_replace_text', 'TEXT NULL'],
                ]
                for (const [col, def] of bcNewCols) {
                    if (!bcMigColNames.includes(col)) {
                        await this.pool.query(`ALTER TABLE policy_blue_cards ADD COLUMN ${col} ${def}`)
                    }
                }
            }

            // Migration: Add ratification flags and authority details to flag_states
            const [fsCols] = await this.pool.query('SHOW COLUMNS FROM flag_states')
            const fsColNames = (fsCols as any[]).map((c: any) => c.Field)
            if (!fsColNames.includes('ratified_bunker')) {
                await this.pool.query('ALTER TABLE flag_states ADD COLUMN ratified_bunker BOOLEAN DEFAULT FALSE')
            }
            if (!fsColNames.includes('ratified_wreck')) {
                await this.pool.query('ALTER TABLE flag_states ADD COLUMN ratified_wreck BOOLEAN DEFAULT FALSE')
            }
            if (!fsColNames.includes('authority_name')) {
                await this.pool.query('ALTER TABLE flag_states ADD COLUMN authority_name VARCHAR(255) DEFAULT NULL')
            }
            if (!fsColNames.includes('authority_address')) {
                await this.pool.query('ALTER TABLE flag_states ADD COLUMN authority_address TEXT DEFAULT NULL')
            }
            if (!fsColNames.includes('display_name')) {
                await this.pool.query('ALTER TABLE flag_states ADD COLUMN display_name VARCHAR(255) DEFAULT NULL')
            }

            // Ensure flag_state_ports table exists
            await this.pool.query(`CREATE TABLE IF NOT EXISTS flag_state_ports (
                id VARCHAR(36) PRIMARY KEY,
                flag_state_id VARCHAR(36) NOT NULL,
                name VARCHAR(255) NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                INDEX idx_fsp_flag (flag_state_id)
            )`)

            // Migration: add renewed_from_policy_id and renewed_from_policy_number to quotations
            {
                const [qCols] = await this.pool.query('SHOW COLUMNS FROM quotations')
                const qColNames = (qCols as any[]).map((c: any) => c.Field)
                if (!qColNames.includes('renewed_from_policy_id')) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN renewed_from_policy_id VARCHAR(36) DEFAULT NULL')
                }
                if (!qColNames.includes('renewed_from_policy_number')) {
                    await this.pool.query('ALTER TABLE quotations ADD COLUMN renewed_from_policy_number VARCHAR(50) DEFAULT NULL')
                }
            }

            // Migration: Add letter_code column to pi_deductibles if missing
            {
                const [lcCol] = await this.pool.query("SHOW COLUMNS FROM pi_deductibles LIKE 'letter_code'") as any[]
                if (lcCol.length === 0) {
                    await this.pool.query("ALTER TABLE pi_deductibles ADD COLUMN letter_code VARCHAR(10) DEFAULT NULL AFTER title")
                }
            }

            // Migration: Add exchange_rate column to policy_documents if missing
            {
                const [erCol] = await this.pool.query("SHOW COLUMNS FROM policy_documents LIKE 'exchange_rate'") as any[]
                if (erCol.length === 0) {
                    await this.pool.query('ALTER TABLE policy_documents ADD COLUMN exchange_rate DECIMAL(10,6) DEFAULT 1.000000')
                }
            }

            // Migration: notifications table
            try {
                await this.pool.query(`CREATE TABLE IF NOT EXISTS notifications (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    message TEXT DEFAULT NULL,
                    link_type VARCHAR(50) DEFAULT NULL,
                    link_id VARCHAR(36) DEFAULT NULL,
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_notif_user (user_id),
                    INDEX idx_notif_user_read (user_id, is_read),
                    INDEX idx_notif_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
            } catch (e) { console.error('notifications table migration:', e) }

            // Migration: Add parent_note_id, author_user_id, author_username to quotation_notes
            {
                const [pnCols] = await this.pool.query("SHOW COLUMNS FROM quotation_notes LIKE 'parent_note_id'") as any[]
                if (pnCols.length === 0) {
                    await this.pool.query('ALTER TABLE quotation_notes ADD COLUMN parent_note_id VARCHAR(36) DEFAULT NULL')
                    await this.pool.query('ALTER TABLE quotation_notes ADD COLUMN author_user_id VARCHAR(36) DEFAULT NULL')
                    await this.pool.query('ALTER TABLE quotation_notes ADD COLUMN author_username VARCHAR(255) DEFAULT NULL')
                    await this.pool.query('ALTER TABLE quotation_notes ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
                }
            }

            // Migration: Add parent_note_id to vessel_notes
            try {
                const [vnPnCols] = await this.pool.query("SHOW COLUMNS FROM vessel_notes LIKE 'parent_note_id'") as any[]
                if (vnPnCols.length === 0) {
                    await this.pool.query('ALTER TABLE vessel_notes ADD COLUMN parent_note_id VARCHAR(36) DEFAULT NULL')
                }
            } catch (e) { console.error('vessel_notes parent_note_id migration:', e) }

            // Migration: add order_index to pi_warranty_set_items
            try {
                const [wsiCols] = await this.pool.query("SHOW COLUMNS FROM pi_warranty_set_items LIKE 'order_index'") as any[]
                if (wsiCols.length === 0) {
                    await this.pool.query('ALTER TABLE pi_warranty_set_items ADD COLUMN order_index INT DEFAULT 0')
                }
            } catch (e) { console.error('pi_warranty_set_items order_index migration:', e) }

            // Migration: Create notification_groups tables if they don't exist
            try {
                const [ngTables] = await this.pool.query("SHOW TABLES LIKE 'notification_groups'") as any[]
                if (ngTables.length === 0) {
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS notification_groups (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        description TEXT DEFAULT NULL,
                        order_index INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS notification_group_members (
                        group_id VARCHAR(36) NOT NULL,
                        user_id VARCHAR(36) NOT NULL,
                        PRIMARY KEY (group_id, user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                    await this.pool.query(`CREATE TABLE IF NOT EXISTS notification_group_subscriptions (
                        id VARCHAR(36) PRIMARY KEY,
                        group_id VARCHAR(36) NOT NULL,
                        event_type VARCHAR(100) NOT NULL,
                        INDEX idx_ngs_group (group_id),
                        INDEX idx_ngs_event (event_type)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                }
            } catch (e) { console.error('notification_groups migration:', e) }

            // Seed default notification groups
            try {
                await this.seedDefaultNotificationGroups()
            } catch (e) { console.error('seedDefaultNotificationGroups:', e) }

            // Recent Items table
            try {
                await this.pool.query('SET FOREIGN_KEY_CHECKS = 0')
                await this.pool.query(`CREATE TABLE IF NOT EXISTS user_recent_items (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL,
                    item_type VARCHAR(50) NOT NULL,
                    item_id VARCHAR(36) NOT NULL,
                    item_label VARCHAR(255) NOT NULL,
                    item_sublabel VARCHAR(255) DEFAULT NULL,
                    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_uri_user (user_id),
                    UNIQUE KEY uk_uri_user_item (user_id, item_type, item_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
                await this.pool.query('SET FOREIGN_KEY_CHECKS = 1')
            } catch (e) {
                try { await this.pool.query('SET FOREIGN_KEY_CHECKS = 1') } catch {}
                console.error('user_recent_items migration:', e)
            }

            // Dashboard onboarded column
            try {
                const [dboCols] = await this.pool.query('SHOW COLUMNS FROM users LIKE \'dashboard_onboarded\'') as any[]
                if (dboCols.length === 0) {
                    await this.pool.query('ALTER TABLE users ADD COLUMN dashboard_onboarded BOOLEAN DEFAULT FALSE')
                }
            } catch (e) { console.error('dashboard_onboarded migration:', e) }

            // User column preferences table
            try {
                await this.pool.query(`
                    CREATE TABLE IF NOT EXISTS user_column_prefs (
                        user_id VARCHAR(36) NOT NULL,
                        page_key VARCHAR(50) NOT NULL,
                        visible_columns TEXT NOT NULL,
                        PRIMARY KEY (user_id, page_key)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `)
            } catch (e) { console.error('user_column_prefs migration:', e) }

            // Document templates table
            try {
                await this.pool.query(`
                    CREATE TABLE IF NOT EXISTS document_templates (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        description TEXT DEFAULT NULL,
                        category VARCHAR(50) NOT NULL DEFAULT 'general',
                        file_name VARCHAR(255) NOT NULL,
                        file_data LONGBLOB NOT NULL,
                        placeholders TEXT DEFAULT NULL,
                        created_by VARCHAR(36) DEFAULT NULL,
                        order_index INT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `)
            } catch (e) { console.error('document_templates migration:', e) }

            // Saved reports table
            try {
                await this.pool.query(`
                    CREATE TABLE IF NOT EXISTS saved_reports (
                        id VARCHAR(36) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        description TEXT DEFAULT NULL,
                        data_source VARCHAR(50) NOT NULL,
                        config TEXT NOT NULL,
                        created_by VARCHAR(36) DEFAULT NULL,
                        is_shared BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `)
            } catch (e) { console.error('saved_reports migration:', e) }

            // Add body column to document_templates
            try {
                const [dtCols] = await this.pool.query('SHOW COLUMNS FROM document_templates LIKE \'body\'') as any[]
                if (dtCols.length === 0) {
                    await this.pool.query('ALTER TABLE document_templates ADD COLUMN body TEXT DEFAULT NULL')
                }
            } catch (e) { console.error('document_templates body migration:', e) }

            // Make file_name and file_data nullable for rich-text-only templates
            try {
                await this.pool.query('ALTER TABLE document_templates MODIFY COLUMN file_name VARCHAR(255) DEFAULT NULL')
                await this.pool.query('ALTER TABLE document_templates MODIFY COLUMN file_data LONGBLOB DEFAULT NULL')
            } catch (e) { console.error('document_templates nullable file migration:', e) }

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
            const numericAuditKeys: string[] = ['builtYear', 'grossTonnage']
            for (const af of auditFields) {
                if (updates[af.updateKey] !== undefined) {
                    const oldVal = current[af.dbCol] != null ? String(current[af.dbCol]) : null
                    const newVal = updates[af.updateKey] != null ? String(updates[af.updateKey]) : null

                    // Resolve entity UUIDs to names for the Customer field
                    if (af.updateKey === 'customerId') {
                        const idsToResolve = [oldVal, newVal].filter(Boolean) as string[]
                        const nameMap = new Map<string, string>()
                        if (idsToResolve.length > 0) {
                            const placeholders = idsToResolve.map(() => '?').join(',')
                            const [nameRows] = await this.pool.query(
                                `SELECT id, name FROM entities WHERE id IN (${placeholders})`,
                                idsToResolve
                            )
                            for (const r of nameRows as any[]) nameMap.set(r.id, r.name)
                        }
                        const oldName = oldVal ? (nameMap.get(oldVal) ?? oldVal) : null
                        const newName = newVal ? (nameMap.get(newVal) ?? newVal) : null
                        if (oldName !== newName) {
                            await this.addVesselAuditEntry(id, af.label, oldName, newName, who)
                        }
                        continue
                    }

                    // Normalize numeric fields to avoid "4737.00" vs "4737" false positives from MySQL Decimal type
                    const isNumeric = numericAuditKeys.includes(af.updateKey)
                    const oldNorm = isNumeric && oldVal != null ? String(parseFloat(oldVal)) : oldVal
                    const newNorm = isNumeric && newVal != null ? String(parseFloat(newVal)) : newVal
                    if (oldNorm !== newNorm) {
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

    async updateVesselDocumentExpiry(vesselId: string, docTypeId: string, expiryDate: string | null): Promise<void> {
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
            SELECT fs.id, fs.name, fs.display_name as displayName, fs.iso3_code as iso3Code, fs.address, fs.email,
                   fs.ratified_bunker as ratifiedBunker,
                   fs.ratified_wreck as ratifiedWreck,
                   fs.authority_name as authorityName,
                   fs.authority_address as authorityAddress,
                   COUNT(v.id) as vesselCount
            FROM flag_states fs
            LEFT JOIN vessels v ON fs.id = v.flag_state_id
            GROUP BY fs.id, fs.name, fs.iso3_code, fs.address, fs.email,
                     fs.ratified_bunker, fs.ratified_wreck, fs.authority_name, fs.authority_address
            ORDER BY fs.name ASC
        `)
        return (rows as any[]).map(r => ({
            ...r,
            vesselCount: Number(r.vesselCount),
            ratifiedBunker: Boolean(r.ratifiedBunker),
            ratifiedWreck: Boolean(r.ratifiedWreck)
        }))
    }

    async addFlagState(flagState: { name: string; displayName?: string; iso3Code: string; address?: string; email?: string; ratifiedBunker?: boolean; ratifiedWreck?: boolean; authorityName?: string; authorityAddress?: string }): Promise<any> {
        if (!this.pool) throw new Error('No database connection')
        const id = require('crypto').randomUUID()
        await this.pool.execute(
            'INSERT INTO flag_states (id, name, display_name, iso3_code, address, email, ratified_bunker, ratified_wreck, authority_name, authority_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, flagState.name, flagState.displayName || null, flagState.iso3Code.toUpperCase(), flagState.address || null, flagState.email || null, flagState.ratifiedBunker ? 1 : 0, flagState.ratifiedWreck ? 1 : 0, flagState.authorityName || null, flagState.authorityAddress || null]
        )
        return { id, ...flagState, iso3Code: flagState.iso3Code.toUpperCase(), ratifiedBunker: Boolean(flagState.ratifiedBunker), ratifiedWreck: Boolean(flagState.ratifiedWreck), vesselCount: 0 }
    }

    async updateFlagState(id: string, updates: { name?: string; displayName?: string | null; iso3Code?: string; address?: string; email?: string; ratifiedBunker?: boolean; ratifiedWreck?: boolean; authorityName?: string | null; authorityAddress?: string | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName || null) }
        if (updates.iso3Code !== undefined) { fields.push('iso3_code = ?'); values.push(updates.iso3Code.toUpperCase()) }
        if (updates.address !== undefined) { fields.push('address = ?'); values.push(updates.address || null) }
        if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email || null) }
        if (updates.ratifiedBunker !== undefined) { fields.push('ratified_bunker = ?'); values.push(updates.ratifiedBunker ? 1 : 0) }
        if (updates.ratifiedWreck !== undefined) { fields.push('ratified_wreck = ?'); values.push(updates.ratifiedWreck ? 1 : 0) }
        if (updates.authorityName !== undefined) { fields.push('authority_name = ?'); values.push(updates.authorityName || null) }
        if (updates.authorityAddress !== undefined) { fields.push('authority_address = ?'); values.push(updates.authorityAddress || null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE flag_states SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteFlagState(id: string): Promise<void> {
        if (!this.pool) return
        // Clear flag_state_id on vessels referencing this flag state
        await this.pool.execute('UPDATE vessels SET flag_state_id = NULL WHERE flag_state_id = ?', [id])
        // Delete associated ports
        await this.pool.execute('DELETE FROM flag_state_ports WHERE flag_state_id = ?', [id])
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

    // --- Flag State Ports ---
    async getFlagStatePorts(flagStateId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, flag_state_id as flagStateId, name, is_default as isDefault FROM flag_state_ports WHERE flag_state_id = ? ORDER BY name ASC',
            [flagStateId]
        )
        return (rows as any[]).map(r => ({ ...r, isDefault: Boolean(r.isDefault) }))
    }

    async addFlagStatePort(flagStateId: string, name: string, isDefault: boolean): Promise<any> {
        if (!this.pool) throw new Error('No database connection')
        const id = require('crypto').randomUUID()
        if (isDefault) {
            await this.pool.execute('UPDATE flag_state_ports SET is_default = FALSE WHERE flag_state_id = ?', [flagStateId])
        }
        await this.pool.execute(
            'INSERT INTO flag_state_ports (id, flag_state_id, name, is_default) VALUES (?, ?, ?, ?)',
            [id, flagStateId, name, isDefault ? 1 : 0]
        )
        return { id, flagStateId, name, isDefault }
    }

    async updateFlagStatePort(id: string, name: string, isDefault: boolean): Promise<void> {
        if (!this.pool) return
        if (isDefault) {
            const [rows] = await this.pool.query('SELECT flag_state_id FROM flag_state_ports WHERE id = ?', [id])
            const port = (rows as any[])[0]
            if (port) {
                await this.pool.execute('UPDATE flag_state_ports SET is_default = FALSE WHERE flag_state_id = ?', [port.flag_state_id])
            }
        }
        await this.pool.execute('UPDATE flag_state_ports SET name = ?, is_default = ? WHERE id = ?', [name, isDefault ? 1 : 0, id])
    }

    async deleteFlagStatePort(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM flag_state_ports WHERE id = ?', [id])
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
        let sql = 'SELECT id, vessel_id as vesselId, entity_id as entityId, role, address_id as addressId FROM vessel_assureds'
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

    // --- Entity Addresses ---
    async getEntityAddresses(entityId?: string): Promise<EntityAddress[]> {
        if (!this.pool) return []
        const q = entityId
            ? 'SELECT * FROM entity_addresses WHERE entity_id = ? ORDER BY created_at'
            : 'SELECT * FROM entity_addresses ORDER BY created_at'
        const params = entityId ? [entityId] : []
        const [rows] = await this.pool.query(q, params)
        return (rows as any[]).map((r) => ({
            id: r.id,
            entityId: r.entity_id,
            label: r.label,
            addressLine1: r.address_line1,
            addressLine2: r.address_line2 || undefined,
            city: r.city || undefined,
            country: r.country || undefined,
            postalCode: r.postal_code || undefined
        }))
    }

    async addEntityAddress(
        addr: Omit<EntityAddress, 'id'>
    ): Promise<EntityAddress> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute(
                `INSERT INTO entity_addresses (id, entity_id, label, address_line1, address_line2, city, country, postal_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    addr.entityId,
                    addr.label,
                    addr.addressLine1,
                    addr.addressLine2 || null,
                    addr.city || null,
                    addr.country || null,
                    addr.postalCode || null
                ]
            )
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, ...addr }
    }

    async updateEntityAddress(
        id: string,
        updates: Partial<Omit<EntityAddress, 'id' | 'entityId'>>
    ): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const vals: any[] = []
        if (updates.label !== undefined) {
            fields.push('label = ?')
            vals.push(updates.label)
        }
        if (updates.addressLine1 !== undefined) {
            fields.push('address_line1 = ?')
            vals.push(updates.addressLine1)
        }
        if (updates.addressLine2 !== undefined) {
            fields.push('address_line2 = ?')
            vals.push(updates.addressLine2 || null)
        }
        if (updates.city !== undefined) {
            fields.push('city = ?')
            vals.push(updates.city || null)
        }
        if (updates.country !== undefined) {
            fields.push('country = ?')
            vals.push(updates.country || null)
        }
        if (updates.postalCode !== undefined) {
            fields.push('postal_code = ?')
            vals.push(updates.postalCode || null)
        }
        if (fields.length === 0) return
        vals.push(id)
        await this.pool.execute(
            `UPDATE entity_addresses SET ${fields.join(', ')} WHERE id = ?`,
            vals
        )
    }

    async deleteEntityAddress(id: string): Promise<void> {
        if (!this.pool) return
        // Clear references from vessel_assureds first
        await this.pool.execute(
            'UPDATE vessel_assureds SET address_id = NULL WHERE address_id = ?',
            [id]
        )
        await this.pool.execute('DELETE FROM entity_addresses WHERE id = ?', [id])
    }

    async updateVesselAssuredAddress(
        id: string,
        addressId: string | null
    ): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE vessel_assureds SET address_id = ? WHERE id = ?',
            [addressId, id]
        )
    }

    // --- RBAC: User Groups & Permissions ---

    async getUserGroups(): Promise<UserGroup[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, description, is_system as isSystem, created_at as createdAt FROM user_groups ORDER BY is_system DESC, name ASC')
        return (rows as any[]).map(r => ({ ...r, isSystem: Boolean(r.isSystem) }))
    }

    async addUserGroup(name: string, description?: string): Promise<UserGroup> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO user_groups (id, name, description, is_system) VALUES (?, ?, ?, FALSE)',
            [id, name, description || null]
        )
        return { id, name, description, isSystem: false }
    }

    async updateUserGroup(id: string, name: string, description?: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE user_groups SET name = ?, description = ? WHERE id = ? AND is_system = FALSE', [name, description || null, id])
    }

    async deleteUserGroup(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM user_groups WHERE id = ? AND is_system = FALSE', [id])
    }

    async getGroupPermissions(groupId: string): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT permission_key FROM group_permissions WHERE group_id = ?', [groupId])
        return (rows as any[]).map(r => r.permission_key)
    }

    async setGroupPermissions(groupId: string, permissionKeys: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM group_permissions WHERE group_id = ?', [groupId])
            for (const key of permissionKeys) {
                await this.pool.execute('INSERT INTO group_permissions (group_id, permission_key) VALUES (?, ?)', [groupId, key])
            }
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    async getUserGroupIds(userId: string): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT group_id FROM user_group_members WHERE user_id = ?', [userId])
        return (rows as any[]).map(r => r.group_id)
    }

    async setUserGroups(userId: string, groupIds: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM user_group_members WHERE user_id = ?', [userId])
            for (const gid of groupIds) {
                await this.pool.execute('INSERT INTO user_group_members (user_id, group_id) VALUES (?, ?)', [userId, gid])
            }
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    async getUserPermissionOverrides(userId: string): Promise<{ permissionKey: string; granted: boolean }[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT permission_key as permissionKey, granted FROM user_permission_overrides WHERE user_id = ?', [userId])
        return (rows as any[]).map(r => ({ ...r, granted: Boolean(r.granted) }))
    }

    async setUserPermissionOverrides(userId: string, overrides: { permissionKey: string; granted: boolean }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM user_permission_overrides WHERE user_id = ?', [userId])
            for (const o of overrides) {
                await this.pool.execute('INSERT INTO user_permission_overrides (user_id, permission_key, granted) VALUES (?, ?, ?)', [userId, o.permissionKey, o.granted ? 1 : 0])
            }
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    /** Resolve effective permissions for a user: union of group perms + user overrides */
    async resolveUserPermissions(userId: string): Promise<string[]> {
        if (!this.pool) return []
        // Get all permissions from all groups the user belongs to
        const [groupPerms] = await this.pool.query(
            `SELECT DISTINCT gp.permission_key
             FROM group_permissions gp
             INNER JOIN user_group_members ugm ON ugm.group_id = gp.group_id
             WHERE ugm.user_id = ?`,
            [userId]
        )
        const perms = new Set((groupPerms as any[]).map(r => r.permission_key))

        // Apply per-user overrides
        const [overrides] = await this.pool.query(
            'SELECT permission_key, granted FROM user_permission_overrides WHERE user_id = ?',
            [userId]
        )
        for (const o of overrides as any[]) {
            if (o.granted) perms.add(o.permission_key)
            else perms.delete(o.permission_key)
        }
        return Array.from(perms)
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
            'SELECT id, username, password_hash as passwordHash, role, theme_preference as themePreference, sanctions_threshold as sanctionsThreshold, last_app_version as lastAppVersion, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, sidebar_collapsed as sidebarCollapsed, collapsed_groups as collapsedGroups, dashboard_onboarded as dashboardOnboarded, created_at as createdAt, last_login_at as lastLoginAt FROM users WHERE username = ?',
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
            'SELECT id, username, role, theme_preference as themePreference, sanctions_threshold as sanctionsThreshold, last_app_version as lastAppVersion, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, sidebar_collapsed as sidebarCollapsed, collapsed_groups as collapsedGroups, dashboard_onboarded as dashboardOnboarded, created_at as createdAt, last_login_at as lastLoginAt FROM users ORDER BY username ASC'
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

    async updateUserDashboardOnboarded(userId: string, onboarded: boolean): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE users SET dashboard_onboarded = ? WHERE id = ?',
            [onboarded ? 1 : 0, userId]
        )
    }

    async getUserById(userId: string): Promise<User | null> {
        if (!this.pool) return null
        const [rows]: any[] = await this.pool.query(
            'SELECT id, username, password_hash as passwordHash, role, theme_preference as themePreference, sanctions_threshold as sanctionsThreshold, last_app_version as lastAppVersion, window_width as windowWidth, window_height as windowHeight, window_x as windowX, window_y as windowY, sidebar_collapsed as sidebarCollapsed, collapsed_groups as collapsedGroups, dashboard_onboarded as dashboardOnboarded, created_at as createdAt FROM users WHERE id = ?',
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
    async getDashboardActivity(): Promise<{ recentVessels: any[]; recentEntities: any[]; recentAuditEntries: any[]; weekRenewals: any[] }> {
        if (!this.pool) return { recentVessels: [], recentEntities: [], recentAuditEntries: [], weekRenewals: [] }
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
                al.field_name as fieldName,
                CASE WHEN al.field_name = 'Flag State'
                    THEN COALESCE(fs.name, al.new_value)
                    ELSE al.new_value
                END as newValue,
                al.changed_at as changedAt
            FROM vessel_audit_log al
            JOIN vessels v ON v.id = al.vessel_id
            LEFT JOIN flag_states fs ON al.field_name = 'Flag State' AND fs.id = al.new_value
            ORDER BY al.changed_at DESC
            LIMIT 8
        `)
        const [weekRenewals] = await this.pool.query(`
            SELECT v.name as vesselName, v.imo_number as imoNumber,
                pt.name as policyTypeName, vdp.policy_number as policyNumber,
                vpv.value_date as endDate
            FROM vessel_dynamic_policies vdp
            JOIN vessels v ON vdp.vessel_id = v.id AND v.is_active = TRUE
            JOIN policy_types pt ON vdp.policy_type_id = pt.id
            JOIN vessel_policy_values vpv ON vpv.policy_id = vdp.id
            JOIN policy_type_characteristics ptc ON vpv.characteristic_id = ptc.id
            WHERE vdp.status = 'active'
              AND ptc.field_type = 'date'
              AND LOWER(ptc.name) LIKE '%end%'
              AND vpv.value_date IS NOT NULL
              AND vpv.value_date >= CURDATE()
              AND vpv.value_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ORDER BY vpv.value_date ASC
        `)
        return {
            recentVessels: (recentVessels as any[]).map(r => ({ ...r, isActive: Boolean(r.isActive) })),
            recentEntities: recentEntities as any[],
            recentAuditEntries: recentAuditEntries as any[],
            weekRenewals: weekRenewals as any[]
        }
    }

    // --- Dashboard Data Quality ---
    async getDataQualityAlerts(): Promise<{ vesselsNoCustomer: number; entitiesNoEmail: number; entitiesNoPhone: number; policiesNoEndDate: number }> {
        if (!this.pool) return { vesselsNoCustomer: 0, entitiesNoEmail: 0, entitiesNoPhone: 0, policiesNoEndDate: 0 }
        const [[r1]] = await this.pool.query(
            'SELECT COUNT(*) as cnt FROM vessels WHERE is_active = TRUE AND customer_id IS NULL'
        ) as any
        const [[r2]] = await this.pool.query(
            "SELECT COUNT(*) as cnt FROM entities WHERE email IS NULL OR email = ''"
        ) as any
        const [[r3]] = await this.pool.query(
            "SELECT COUNT(*) as cnt FROM entities WHERE phone IS NULL OR phone = ''"
        ) as any
        const [[r4]] = await this.pool.query(`
            SELECT COUNT(*) as cnt FROM vessel_dynamic_policies vdp
            WHERE vdp.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM vessel_policy_values vpv
                JOIN policy_type_characteristics ptc ON vpv.characteristic_id = ptc.id
                WHERE vpv.policy_id = vdp.id
                  AND ptc.field_type = 'date'
                  AND LOWER(ptc.name) LIKE '%end%'
                  AND vpv.value_date IS NOT NULL
              )
        `) as any
        return {
            vesselsNoCustomer: Number(r1?.cnt ?? 0),
            entitiesNoEmail: Number(r2?.cnt ?? 0),
            entitiesNoPhone: Number(r3?.cnt ?? 0),
            policiesNoEndDate: Number(r4?.cnt ?? 0)
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
                pt.name as policyTypeName,
                (SELECT COUNT(*) FROM survey_warranty_reminders swr WHERE swr.warranty_id = sw.id) as reminderCount,
                (SELECT swr2.sent_at FROM survey_warranty_reminders swr2 WHERE swr2.warranty_id = sw.id ORDER BY swr2.sent_at DESC LIMIT 1) as lastReminderDate,
                (SELECT swr3.next_reminder_date FROM survey_warranty_reminders swr3 WHERE swr3.warranty_id = sw.id ORDER BY swr3.created_at DESC LIMIT 1) as nextReminderDate
            FROM survey_warranties sw
            LEFT JOIN vessel_dynamic_policies vdp ON vdp.id = sw.policy_id
            LEFT JOIN policy_types pt ON pt.id = vdp.policy_type_id
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
            [id, data.vesselId, data.policyId || null, data.description, data.deadlineType, data.deadlineDays ?? null, data.deadlineEvent || null, data.inceptionDate, data.notes || null]
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
                swr.logged_by as loggedBy, swr.created_at as createdAt
            FROM survey_warranty_reminders swr
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

    async completeWarrantyAndSurvey(warrantyId: string, completionNotes: string | null, userId: string): Promise<void> {
        if (!this.pool) return
        // 1. Complete the warranty
        await this.pool.query(
            `UPDATE survey_warranties SET status = 'completed', completed_at = NOW(), completion_notes = ? WHERE id = ?`,
            [completionNotes, warrantyId]
        )
        // 2. Look up the linked survey
        const [rows] = await this.pool.query(
            `SELECT condition_survey_id FROM survey_warranties WHERE id = ?`,
            [warrantyId]
        )
        const warranty = (rows as any[])[0]
        if (warranty?.condition_survey_id) {
            const surveyId = warranty.condition_survey_id
            // 3. Close all open defects on that survey
            await this.pool.query(
                `UPDATE survey_defects SET status = 'CLOSED', closed_at = NOW(), closed_by = ? WHERE survey_id = ? AND status = 'OPEN'`,
                [userId, surveyId]
            )
            // 4. Mark the survey as completed
            await this.pool.query(
                `UPDATE condition_surveys SET completed_at = NOW(), completed_by = ? WHERE id = ? AND completed_at IS NULL`,
                [userId, surveyId]
            )
        }
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
            const [items] = await this.pool.query('SELECT clause_id, description_override FROM pi_clause_set_items WHERE set_id = ?', [set.id])
            set.clauseIds = (items as any[]).map(i => i.clause_id)
            const overrides: Record<string, string> = {}
            for (const item of items as any[]) {
                if (item.description_override) overrides[item.clause_id] = item.description_override
            }
            if (Object.keys(overrides).length > 0) set.descriptionOverrides = overrides
        }
        return sets
    }

    async addPIClauseSet(name: string, clauseIds: string[], descriptionOverrides?: Record<string, string>): Promise<PIClauseSet> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO pi_clause_sets (id, name) VALUES (?, ?)', [id, name])
        for (const clauseId of clauseIds) {
            const override = descriptionOverrides?.[clauseId] || null
            await this.pool.execute('INSERT INTO pi_clause_set_items (id, set_id, clause_id, description_override) VALUES (?, ?, ?, ?)', [uuidv4(), id, clauseId, override])
        }
        return { id, name, clauseIds, descriptionOverrides }
    }

    async updatePIClauseSet(id: string, name: string, clauseIds: string[], descriptionOverrides?: Record<string, string>): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_clause_sets SET name = ? WHERE id = ?', [name, id])
        await this.pool.execute('DELETE FROM pi_clause_set_items WHERE set_id = ?', [id])
        for (const clauseId of clauseIds) {
            const override = descriptionOverrides?.[clauseId] || null
            await this.pool.execute('INSERT INTO pi_clause_set_items (id, set_id, clause_id, description_override) VALUES (?, ?, ?, ?)', [uuidv4(), id, clauseId, override])
        }
    }

    async deletePIClauseSet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_clause_sets WHERE id = ?', [id])
    }

    // ==================== P&I Warranties ====================

    async getPIWarranties(): Promise<PIWarranty[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query("SELECT id, text, is_cargo_related as isCargoRelated, default_selected as defaultSelected, COALESCE(type_scope, 'all') as typeScope, order_index as `order` FROM pi_warranties ORDER BY order_index ASC")
        const warranties = (rows as any[]).map(r => ({
            ...r,
            isCargoRelated: Boolean(r.isCargoRelated),
            defaultSelected: Boolean(r.defaultSelected),
            typeScope: r.typeScope || 'all',
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
            'INSERT INTO pi_warranties (id, text, is_cargo_related, default_selected, type_scope, order_index) VALUES (?, ?, ?, ?, ?, ?)',
            [id, warranty.text, warranty.isCargoRelated || false, warranty.defaultSelected || false, warranty.typeScope || 'all', order]
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
        if (updates.typeScope !== undefined) { fields.push('type_scope = ?'); values.push(updates.typeScope) }
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

    // ==================== P&I Warranty Sets ====================

    async getPIWarrantySets(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query("SELECT id, name, default_selected as defaultSelected, alternative_scope as alternativeScope, COALESCE(type_scope, 'all') as typeScope FROM pi_warranty_sets ORDER BY name ASC")
        const sets = rows as any[]
        for (const set of sets) {
            set.defaultSelected = !!set.defaultSelected
            set.alternativeScope = set.alternativeScope || null
            set.typeScope = set.typeScope || 'all'
            const [items] = await this.pool.query('SELECT warranty_id FROM pi_warranty_set_items WHERE set_id = ? ORDER BY order_index ASC', [set.id])
            set.warrantyIds = (items as any[]).map(i => i.warranty_id)
        }
        return sets
    }

    async addPIWarrantySet(name: string, warrantyIds: string[], defaultSelected?: boolean): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO pi_warranty_sets (id, name, default_selected) VALUES (?, ?, ?)', [id, name, defaultSelected ? 1 : 0])
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        const [existing] = await this.pool.query('SELECT id FROM pi_warranties') as any[]
        const validIds = new Set((existing as any[]).map((r: any) => r.id))
        let orderIdx = 0
        for (const wid of warrantyIds) {
            if (validIds.has(wid)) {
                await this.pool.execute('INSERT INTO pi_warranty_set_items (id, set_id, warranty_id, order_index) VALUES (?, ?, ?, ?)', [uuidv4(), id, wid, orderIdx++])
            }
        }
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        return { id, name, warrantyIds: warrantyIds.filter(w => validIds.has(w)), defaultSelected: !!defaultSelected }
    }

    async updatePIWarrantySet(id: string, name: string, warrantyIds: string[], defaultSelected?: boolean): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_warranty_sets SET name = ?, default_selected = ? WHERE id = ?', [name, defaultSelected ? 1 : 0, id])
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        await this.pool.execute('DELETE FROM pi_warranty_set_items WHERE set_id = ?', [id])
        const [existing] = await this.pool.query('SELECT id FROM pi_warranties') as any[]
        const validIds = new Set((existing as any[]).map((r: any) => r.id))
        let updOrderIdx = 0
        for (const wid of warrantyIds) {
            if (validIds.has(wid)) {
                await this.pool.execute('INSERT INTO pi_warranty_set_items (id, set_id, warranty_id, order_index) VALUES (?, ?, ?, ?)', [uuidv4(), id, wid, updOrderIdx++])
            }
        }
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
    }

    async deletePIWarrantySet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_warranty_sets WHERE id = ?', [id])
    }

    // ==================== P&I Deductibles ====================

    async getPIDeductibles(): Promise<PIDeductible[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, title, letter_code as letterCode, description, default_amount as defaultAmount, default_currency as defaultCurrency, has_secondary as hasSecondary, secondary_description as secondaryDescription, secondary_default_amount as secondaryDefaultAmount, order_index as `order` FROM pi_deductibles ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, hasSecondary: Boolean(r.hasSecondary), defaultAmount: Number(r.defaultAmount), secondaryDefaultAmount: r.secondaryDefaultAmount ? Number(r.secondaryDefaultAmount) : undefined }))
    }

    async addPIDeductible(ded: Omit<PIDeductible, 'id'>): Promise<PIDeductible> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_deductibles')
        const order = maxRow[0].nextOrder
        await this.pool.execute(
            'INSERT INTO pi_deductibles (id, title, letter_code, description, default_amount, default_currency, has_secondary, secondary_description, secondary_default_amount, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, ded.title || '', ded.letterCode || null, ded.description, ded.defaultAmount, ded.defaultCurrency || 'USD', ded.hasSecondary || false, ded.secondaryDescription || null, ded.secondaryDefaultAmount || null, order]
        )
        return { ...ded, id, order }
    }

    async updatePIDeductible(id: string, updates: Partial<PIDeductible>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
        if (updates.letterCode !== undefined) { fields.push('letter_code = ?'); values.push(updates.letterCode || null) }
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

    // ==================== P&I Text Deductibles (Master) ====================

    async getPITextDeductibles(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, title, text, default_included as defaultIncluded, order_index as `order` FROM pi_text_deductibles ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, defaultIncluded: Boolean(r.defaultIncluded) }))
    }

    async addPITextDeductible(data: { title?: string; text: string; defaultIncluded?: boolean }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_text_deductibles')
        const order = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO pi_text_deductibles (id, title, text, default_included, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, data.title || '', data.text, data.defaultIncluded ? 1 : 0, order])
        return { id, title: data.title || '', text: data.text, defaultIncluded: !!data.defaultIncluded, order }
    }

    async updatePITextDeductible(id: string, updates: { title?: string; text?: string; defaultIncluded?: boolean }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.defaultIncluded !== undefined) { fields.push('default_included = ?'); values.push(updates.defaultIncluded ? 1 : 0) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE pi_text_deductibles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePITextDeductible(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_text_deductibles WHERE id = ?', [id])
    }

    async reorderPITextDeductibles(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_text_deductibles SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Exclusions ====================

    async getPIExclusions(): Promise<PIExclusion[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text, is_cargo_related as isCargoRelated, order_index as `order` FROM pi_exclusions ORDER BY order_index ASC')
        // Fetch vessel type mappings
        const [vtRows] = await this.pool.query('SELECT exclusion_id, vessel_type_id FROM pi_exclusion_vessel_type_map') as any[]
        const vtMap: Record<string, string[]> = {}
        for (const r of vtRows) {
            if (!vtMap[r.exclusion_id]) vtMap[r.exclusion_id] = []
            vtMap[r.exclusion_id].push(r.vessel_type_id)
        }
        return (rows as any[]).map(r => ({ ...r, isCargoRelated: !!r.isCargoRelated, vesselTypeIds: vtMap[r.id] || [] }))
    }

    async addPIExclusion(exclusion: { text: string; isCargoRelated?: boolean; vesselTypeIds?: string[] }): Promise<PIExclusion> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_exclusions')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO pi_exclusions (id, text, is_cargo_related, order_index) VALUES (?, ?, ?, ?)', [id, exclusion.text, exclusion.isCargoRelated || false, order])
        if (exclusion.vesselTypeIds?.length) {
            for (const vtId of exclusion.vesselTypeIds) {
                await this.pool.execute('INSERT INTO pi_exclusion_vessel_type_map (exclusion_id, vessel_type_id) VALUES (?, ?)', [id, vtId])
            }
        }
        return { id, text: exclusion.text, isCargoRelated: exclusion.isCargoRelated || false, vesselTypeIds: exclusion.vesselTypeIds || [], order }
    }

    async updatePIExclusion(id: string, updates: { text?: string; isCargoRelated?: boolean; vesselTypeIds?: string[] }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.isCargoRelated !== undefined) { fields.push('is_cargo_related = ?'); values.push(updates.isCargoRelated) }
        if (fields.length > 0) {
            values.push(id)
            await this.pool.execute(`UPDATE pi_exclusions SET ${fields.join(', ')} WHERE id = ?`, values)
        }
        if (updates.vesselTypeIds !== undefined) {
            await this.pool.execute('DELETE FROM pi_exclusion_vessel_type_map WHERE exclusion_id = ?', [id])
            for (const vtId of updates.vesselTypeIds) {
                await this.pool.execute('INSERT INTO pi_exclusion_vessel_type_map (exclusion_id, vessel_type_id) VALUES (?, ?)', [id, vtId])
            }
        }
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
        const [rows] = await this.pool.query('SELECT id, title, code, text, order_index as `order`, default_selected as defaultSelected FROM pi_additional_clauses ORDER BY order_index ASC')
        return rows as PIAdditionalClause[]
    }

    async addPIAdditionalClause(title: string | null, code: string | null, text: string): Promise<PIAdditionalClause> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_additional_clauses')
        const order = maxRow[0].nextOrder
        await this.pool.execute('INSERT INTO pi_additional_clauses (id, title, code, text, order_index) VALUES (?, ?, ?, ?, ?)', [id, title || null, code || null, text, order])
        return { id, title: title || undefined, code: code || undefined, text, order }
    }

    async updatePIAdditionalClause(id: string, title: string | null, code: string | null, text: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_additional_clauses SET title = ?, code = ?, text = ? WHERE id = ?', [title || null, code || null, text, id])
    }

    async deletePIAdditionalClause(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_additional_clauses WHERE id = ?', [id])
    }

    async togglePIAdditionalClauseDefault(id: string, defaultSelected: boolean): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_additional_clauses SET default_selected = ? WHERE id = ?', [defaultSelected, id])
    }

    async reorderPIAdditionalClauses(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE pi_additional_clauses SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== P&I Additional Clause Sets ====================

    async piGetAdditionalClauseSets(): Promise<PIAdditionalClauseSet[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, default_selected as defaultSelected FROM pi_additional_clause_sets ORDER BY name ASC')
        const sets = rows as PIAdditionalClauseSet[]
        for (const s of sets) {
            const [items] = await this.pool.query('SELECT clause_id FROM pi_additional_clause_set_items WHERE set_id = ? ORDER BY order_index ASC', [s.id])
            s.clauseIds = (items as any[]).map(r => r.clause_id)
        }
        return sets
    }

    async piAddAdditionalClauseSet(name: string, clauseIds: string[], defaultSelected?: boolean): Promise<PIAdditionalClauseSet> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO pi_additional_clause_sets (id, name, default_selected) VALUES (?, ?, ?)', [id, name, defaultSelected || false])
        for (let i = 0; i < clauseIds.length; i++) {
            await this.pool.execute('INSERT INTO pi_additional_clause_set_items (id, set_id, clause_id, order_index) VALUES (?, ?, ?, ?)', [uuidv4(), id, clauseIds[i], i])
        }
        return { id, name, clauseIds }
    }

    async piUpdateAdditionalClauseSet(id: string, name: string, clauseIds: string[], defaultSelected?: boolean): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE pi_additional_clause_sets SET name = ?, default_selected = ? WHERE id = ?', [name, defaultSelected || false, id])
        await this.pool.execute('DELETE FROM pi_additional_clause_set_items WHERE set_id = ?', [id])
        for (let i = 0; i < clauseIds.length; i++) {
            await this.pool.execute('INSERT INTO pi_additional_clause_set_items (id, set_id, clause_id, order_index) VALUES (?, ?, ?, ?)', [uuidv4(), id, clauseIds[i], i])
        }
    }

    async piDeleteAdditionalClauseSet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_additional_clause_sets WHERE id = ?', [id])
    }

    // ==================== Quotation Vessels ====================

    async getQuotationVessels(quotationId: string): Promise<QuotationVessel[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT qv.id, qv.quotation_id as quotationId, qv.vessel_id as vesselId, qv.vessel_label as vesselLabel,
                    qv.order_index as \`order\`,
                    COALESCE(v.name, qv.name) as name,
                    COALESCE(v.imo_number, qv.imo_number) as imoNumber,
                    COALESCE(v.built_year, qv.built_year) as builtYear,
                    COALESCE(v.gross_tonnage, qv.gross_tonnage) as grossTonnage,
                    qv.flag, qv.vessel_type as vesselType, qv.classification, qv.call_sign as callSign,
                    qv.premium_amount as premiumAmount
             FROM quotation_vessels qv
             LEFT JOIN vessels v ON qv.vessel_id = v.id
             WHERE qv.quotation_id = ?
             ORDER BY qv.order_index ASC`,
            [quotationId]
        )
        return (rows as any[]).map(r => ({
            ...r,
            builtYear: r.builtYear != null ? Number(r.builtYear) : undefined,
            grossTonnage: r.grossTonnage != null ? Number(r.grossTonnage) : undefined,
            premiumAmount: r.premiumAmount != null ? Number(r.premiumAmount) : undefined
        }))
    }

    async addQuotationVessel(data: { quotationId: string; vesselId?: string; vesselLabel: string; order: number; name?: string; imoNumber?: string; builtYear?: number; grossTonnage?: number; flag?: string; vesselType?: string; classification?: string; callSign?: string }): Promise<QuotationVessel> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO quotation_vessels (id, quotation_id, vessel_id, vessel_label, order_index, name, imo_number, built_year, gross_tonnage, flag, vessel_type, classification, call_sign)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.quotationId, data.vesselId || null, data.vesselLabel, data.order, data.name || null, data.imoNumber || null, data.builtYear || null, data.grossTonnage || null, data.flag || null, data.vesselType || null, data.classification || null, data.callSign || null]
        )
        return { id, quotationId: data.quotationId, vesselId: data.vesselId, vesselLabel: data.vesselLabel, order: data.order, name: data.name, imoNumber: data.imoNumber, builtYear: data.builtYear, grossTonnage: data.grossTonnage, flag: data.flag, vesselType: data.vesselType, classification: data.classification, callSign: data.callSign }
    }

    async updateQuotationVessel(id: string, data: Partial<{ name: string; imoNumber: string; builtYear: number; grossTonnage: number; flag: string; vesselType: string; classification: string; callSign: string; vesselId: string; vesselLabel: string; premiumAmount: number }>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        const colMap: Record<string, string> = { name: 'name', imoNumber: 'imo_number', builtYear: 'built_year', grossTonnage: 'gross_tonnage', flag: 'flag', vesselType: 'vessel_type', classification: 'classification', callSign: 'call_sign', vesselId: 'vessel_id', vesselLabel: 'vessel_label', premiumAmount: 'premium_amount' }
        for (const [key, col] of Object.entries(colMap)) {
            if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key] ?? null) }
        }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_vessels SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationVessel(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_vessels WHERE id = ?', [id])
    }

    async reorderQuotationVessels(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_vessels SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
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

    // ==================== Trading Warranty Templates ====================

    async getTradingWarrantyTemplates(): Promise<TradingWarrantyTemplate[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, text, order_index AS `order` FROM trading_warranty_templates ORDER BY order_index ASC')
        return rows as TradingWarrantyTemplate[]
    }

    async addTradingWarrantyTemplate(name: string, text: string): Promise<TradingWarrantyTemplate> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM trading_warranty_templates')
        const nextOrder = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute(
            'INSERT INTO trading_warranty_templates (id, name, text, order_index) VALUES (?, ?, ?, ?)',
            [id, name, text, nextOrder]
        )
        return { id, name, text, order: nextOrder }
    }

    async updateTradingWarrantyTemplate(id: string, updates: Partial<{ name: string; text: string }>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE trading_warranty_templates SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteTradingWarrantyTemplate(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM trading_warranty_templates WHERE id = ?', [id])
    }

    async reorderTradingWarrantyTemplates(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE trading_warranty_templates SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // ==================== Trading Custom Texts ====================

    async getTradingCustomTexts(): Promise<TradingCustomText[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, text, order_index AS `order` FROM trading_custom_texts ORDER BY order_index ASC')
        return rows as TradingCustomText[]
    }

    async addTradingCustomText(name: string, text: string): Promise<TradingCustomText> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM trading_custom_texts')
        const nextOrder = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute(
            'INSERT INTO trading_custom_texts (id, name, text, order_index) VALUES (?, ?, ?, ?)',
            [id, name, text, nextOrder]
        )
        return { id, name, text, order: nextOrder }
    }

    async updateTradingCustomText(id: string, updates: Partial<{ name: string; text: string }>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE trading_custom_texts SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteTradingCustomText(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM trading_custom_texts WHERE id = ?', [id])
    }

    async reorderTradingCustomTexts(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE trading_custom_texts SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // ==================== Premium Text Templates (NCB / UPCC) ====================

    async getPremiumTextTemplates(type?: string): Promise<PremiumTextTemplate[]> {
        if (!this.pool) return []
        if (type) {
            const [rows] = await this.pool.query('SELECT id, name, text, type, order_index AS `order` FROM premium_text_templates WHERE type = ? ORDER BY order_index ASC', [type])
            return rows as PremiumTextTemplate[]
        }
        const [rows] = await this.pool.query('SELECT id, name, text, type, order_index AS `order` FROM premium_text_templates ORDER BY type ASC, order_index ASC')
        return rows as PremiumTextTemplate[]
    }

    async addPremiumTextTemplate(data: { name: string; text: string; type: string }): Promise<PremiumTextTemplate> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM premium_text_templates WHERE type = ?', [data.type])
        const nextOrder = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute(
            'INSERT INTO premium_text_templates (id, name, text, type, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, data.name, data.text, data.type, nextOrder]
        )
        return { id, name: data.name, text: data.text, type: data.type as 'ncb' | 'upcc', order: nextOrder }
    }

    async updatePremiumTextTemplate(id: string, updates: Partial<{ name: string; text: string }>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE premium_text_templates SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deletePremiumTextTemplate(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM premium_text_templates WHERE id = ?', [id])
    }

    async reorderPremiumTextTemplates(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE premium_text_templates SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // ==================== Quotation Types ====================

    async getQuotationTypes(): Promise<QuotationType[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, name, code, order_index as orderIndex, created_at as createdAt FROM quotation_types ORDER BY order_index ASC'
        )
        return rows as QuotationType[]
    }

    async addQuotationType(data: { name: string; code: string }): Promise<QuotationType> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM quotation_types') as any[]
        const orderIndex = maxRow[0].nextOrder
        await this.pool.execute(
            'INSERT INTO quotation_types (id, name, code, order_index) VALUES (?, ?, ?, ?)',
            [id, data.name, data.code, orderIndex]
        )
        return { id, name: data.name, code: data.code, orderIndex }
    }

    async updateQuotationType(id: string, updates: { name?: string; code?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.code !== undefined) { fields.push('code = ?'); values.push(updates.code) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_types SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationType(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_types WHERE id = ?', [id])
    }

    async reorderQuotationTypes(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE quotation_types SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // ==================== Quotations ====================

    async getQuotations(): Promise<Quotation[]> {
        if (!this.pool) return []
        // First get the latest revision IDs efficiently
        const [latestIds] = await this.pool.query(`
            SELECT id FROM quotations q
            WHERE revision_number = (
                SELECT MAX(revision_number) FROM quotations q2
                WHERE q2.revision_group_id = q.revision_group_id
            )
        `)
        const idSet = new Set((latestIds as any[]).map(r => r.id))
        if (idSet.size === 0) return []

        const [rows] = await this.pool.query(`
            SELECT q.id, q.reference_number as referenceNumber,
                q.quotation_type_id as quotationTypeId, qt.name as quotationTypeName, qt.code as quotationTypeCode,
                q.quotation_date as quotationDate,
                q.policy_type_id as policyTypeId, pt.name as policyTypeName,
                q.is_renewal as isRenewal, q.status,
                q.premium_amount as premiumAmount, q.premium_currency as premiumCurrency,
                q.co_name as coName, q.title as title,
                q.revision_number as revisionNumber, q.revision_group_id as revisionGroupId, q.is_locked as isLocked,
                q.created_at as createdAt, q.updated_at as updatedAt, q.created_by as createdBy,
                q.workflow_step_id as workflowStepId, qws.name as workflowStepName, qws.color as workflowStepColor
            FROM quotations q
            LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
            LEFT JOIN policy_types pt ON q.policy_type_id = pt.id
            LEFT JOIN quotation_workflow_steps qws ON q.workflow_step_id = qws.id
            ORDER BY q.created_at DESC
        `)
        // Filter to latest revisions in JS (faster than correlated subquery)
        const filtered = (rows as any[]).filter(r => idSet.has(r.id))

        // Batch load vessel names and counts
        const qIds = filtered.map(r => r.id)
        if (qIds.length === 0) return []
        const [vesselRows] = await this.pool.query(`
            SELECT qv.quotation_id, COALESCE(v.name, qv.name) as vesselName, qv.order_index
            FROM quotation_vessels qv
            LEFT JOIN vessels v ON qv.vessel_id = v.id
            WHERE qv.quotation_id IN (${qIds.map(() => '?').join(',')})
            ORDER BY qv.order_index ASC
        `, qIds)
        const vesselMap = new Map<string, string>()
        const vesselCountMap = new Map<string, number>()
        for (const v of vesselRows as any[]) {
            if (!vesselMap.has(v.quotation_id)) vesselMap.set(v.quotation_id, v.vesselName)
            vesselCountMap.set(v.quotation_id, (vesselCountMap.get(v.quotation_id) || 0) + 1)
        }

        return filtered.map(r => ({
            ...r,
            vesselName: vesselMap.get(r.id) || null,
            vesselCount: vesselCountMap.get(r.id) || 0,
            piClauseNames: null,
            hullClauseCodes: null,
            isRenewal: Boolean(r.isRenewal),
            isLocked: Boolean(r.isLocked),
            premiumAmount: r.premiumAmount ? Number(r.premiumAmount) : undefined,
            revisionNumber: Number(r.revisionNumber || 0)
        }))
    }

    async getQuotation(id: string): Promise<Quotation | null> {
        if (!this.pool) return null
        const [rows] = await this.pool.query(`
            SELECT q.id, q.reference_number as referenceNumber,
                q.quotation_type_id as quotationTypeId, qt.name as quotationTypeName, qt.code as quotationTypeCode,
                q.quotation_date as quotationDate,
                q.policy_type_id as policyTypeId, pt.name as policyTypeName,
                q.vessel_id as vesselId,
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
                q.trading_custom_mode as tradingCustomMode,
                q.trading_custom_wording as tradingCustomWording,
                q.sanctions_clause_version as sanctionsClauseVersion,
                q.vdr_deductible_enabled as vdrDeductibleEnabled,
                q.deductible_aggregate_enabled as deductibleAggregateEnabled,
                q.deductible_aggregate_text as deductibleAggregateText,
                q.validity_days as validityDays,
                q.premium_additional_text as premiumAdditionalText,
                q.ncb_enabled as ncbEnabled, q.ncb_discount_type as ncbDiscountType, q.ncb_discount_percent as ncbDiscountPercent, q.ncb_discount_amount as ncbDiscountAmount, q.ncb_text as ncbText,
                q.cpc_enabled as upccEnabled, q.cpc_discount_type as upccDiscountType, q.cpc_discount_percent as upccDiscountPercent, q.cpc_discount_amount as upccDiscountAmount, q.cpc_text as upccText,
                q.non_refundable_type as nonRefundableType, q.non_refundable_percent as nonRefundablePercent,
                q.agreed_value as agreedValue, q.agreed_value_currency as agreedValueCurrency,
                q.iv_enabled as ivEnabled, q.iv_value as ivValue, q.iv_currency as ivCurrency, q.iv_premium_amount as ivPremiumAmount,
                q.hull_clause_id as hullClauseId, q.iv_clause_id as ivClauseId,
                q.co_name as coName, q.title as title,
                q.section_texts_override as sectionTextsOverrideRaw, q.sanctions_text_override as sanctionsTextOverride, q.section_order as sectionOrderRaw,
                q.revision_number as revisionNumber, q.revision_group_id as revisionGroupId, q.is_locked as isLocked, q.export_snapshot as exportSnapshotRaw,
                q.workflow_step_id as workflowStepId, qws.name as workflowStepName, qws.color as workflowStepColor,
                q.renewed_from_policy_id as renewedFromPolicyId, q.renewed_from_policy_number as renewedFromPolicyNumber,
                q.created_at as createdAt, q.updated_at as updatedAt, q.created_by as createdBy
            FROM quotations q
            LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
            LEFT JOIN policy_types pt ON q.policy_type_id = pt.id
            LEFT JOIN quotation_workflow_steps qws ON q.workflow_step_id = qws.id
            WHERE q.id = ?
        `, [id])
        const arr = rows as any[]
        if (arr.length === 0) return null
        const r = arr[0]
        return {
            ...r,
            isRenewal: Boolean(r.isRenewal),
            vdrDeductibleEnabled: Boolean(r.vdrDeductibleEnabled),
            ncbEnabled: Boolean(r.ncbEnabled),
            upccEnabled: Boolean(r.upccEnabled),
            tradingShowDdqList: r.tradingShowDdqList == null ? true : Boolean(r.tradingShowDdqList),
            tradingShowDdqWarranties: r.tradingShowDdqWarranties == null ? true : Boolean(r.tradingShowDdqWarranties),
            tradingShowIsrael: r.tradingShowIsrael == null ? true : Boolean(r.tradingShowIsrael),
            tradingCustomMode: Boolean(r.tradingCustomMode),
            limitOfLiabilityAmount: r.limitOfLiabilityAmount ? Number(r.limitOfLiabilityAmount) : undefined,
            premiumAmount: r.premiumAmount ? Number(r.premiumAmount) : undefined,
            ncbDiscountType: r.ncbDiscountType || 'percentage',
            ncbDiscountPercent: r.ncbDiscountPercent ? Number(r.ncbDiscountPercent) : undefined,
            ncbDiscountAmount: r.ncbDiscountAmount ? Number(r.ncbDiscountAmount) : undefined,
            upccDiscountType: r.upccDiscountType || 'percentage',
            upccDiscountPercent: r.upccDiscountPercent ? Number(r.upccDiscountPercent) : undefined,
            upccDiscountAmount: r.upccDiscountAmount ? Number(r.upccDiscountAmount) : undefined,
            agreedValue: r.agreedValue ? Number(r.agreedValue) : undefined,
            agreedValueCurrency: r.agreedValueCurrency || 'USD',
            ivEnabled: Boolean(r.ivEnabled),
            ivValue: r.ivValue ? Number(r.ivValue) : undefined,
            ivCurrency: r.ivCurrency || 'USD',
            ivPremiumAmount: r.ivPremiumAmount ? Number(r.ivPremiumAmount) : undefined,
            validityDays: r.validityDays ? Number(r.validityDays) : 14,
            sectionTextsOverride: r.sectionTextsOverrideRaw ? (() => { try { return JSON.parse(r.sectionTextsOverrideRaw) } catch { return undefined } })() : undefined,
            sectionTextsOverrideRaw: undefined,
            sectionOrder: r.sectionOrderRaw ? (() => { try { return JSON.parse(r.sectionOrderRaw) } catch { return undefined } })() : undefined,
            sectionOrderRaw: undefined,
            revisionNumber: Number(r.revisionNumber || 0),
            revisionGroupId: r.revisionGroupId || r.id,
            isLocked: Boolean(r.isLocked),
            exportSnapshot: r.exportSnapshotRaw || undefined,
            exportSnapshotRaw: undefined
        } as Quotation
    }

    async addQuotation(q: Partial<Quotation>): Promise<Quotation> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        // Auto-generate reference: Q/{type_code}/{global_sequential}
        let referenceNumber = q.referenceNumber || null
        if (!referenceNumber && q.quotationTypeId) {
            const [typeRow] = await this.pool.query('SELECT code FROM quotation_types WHERE id = ?', [q.quotationTypeId]) as any[]
            const typeCode = typeRow.length > 0 ? typeRow[0].code : '?'
            const [countRow] = await this.pool.query('SELECT COUNT(*) as cnt FROM quotations') as any[]
            const seq = (countRow[0].cnt || 0) + 1
            referenceNumber = `Q/${typeCode}/${seq}`
        }
        await this.pool.execute(`
            INSERT INTO quotations (id, reference_number, quotation_type_id, quotation_date, policy_type_id, vessel_id, is_renewal, status, period_text, validity_days, sanctions_clause_version, vdr_deductible_enabled, created_by, revision_group_id, revision_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `, [
            id, referenceNumber, q.quotationTypeId || null, q.quotationDate || null, q.policyTypeId || null, q.vesselId || null,
            q.isRenewal || false, q.status || 'draft', q.periodText || null, q.validityDays || 14,
            q.sanctionsClauseVersion || 'standard', q.vdrDeductibleEnabled !== false, q.createdBy || null, id
        ])
        return { ...q, id, status: q.status || 'draft', sanctionsClauseVersion: q.sanctionsClauseVersion || 'standard', vdrDeductibleEnabled: q.vdrDeductibleEnabled !== false, validityDays: q.validityDays || 14, isRenewal: q.isRenewal || false, ncbEnabled: q.ncbEnabled || false, upccEnabled: q.upccEnabled || false, referenceNumber: referenceNumber || '' } as Quotation
    }

    async updateQuotation(id: string, updates: Partial<Quotation>): Promise<void> {
        if (!this.pool) return
        const fieldMap: Record<string, string> = {
            referenceNumber: 'reference_number', quotationTypeId: 'quotation_type_id', quotationDate: 'quotation_date', policyTypeId: 'policy_type_id',
            vesselId: 'vessel_id', isRenewal: 'is_renewal', status: 'status', periodText: 'period_text',
            limitOfLiabilityAmount: 'limit_of_liability_amount', limitOfLiabilityCurrency: 'limit_of_liability_currency',
            limitOfLiabilityText: 'limit_of_liability_text', premiumAmount: 'premium_amount', premiumCurrency: 'premium_currency',
            numInstalments: 'num_instalments', tradingWarrantyIntro: 'trading_warranty_intro',
            tradingShowDdqList: 'trading_show_ddq_list', tradingShowDdqWarranties: 'trading_show_ddq_warranties',
            tradingShowIsrael: 'trading_show_israel', tradingCustomText: 'trading_custom_text',
            tradingCustomMode: 'trading_custom_mode', tradingCustomWording: 'trading_custom_wording',
            sanctionsClauseVersion: 'sanctions_clause_version', vdrDeductibleEnabled: 'vdr_deductible_enabled',
            deductibleAggregateEnabled: 'deductible_aggregate_enabled', deductibleAggregateText: 'deductible_aggregate_text', validityDays: 'validity_days',
            premiumAdditionalText: 'premium_additional_text',
            ncbEnabled: 'ncb_enabled', ncbDiscountType: 'ncb_discount_type', ncbDiscountPercent: 'ncb_discount_percent', ncbDiscountAmount: 'ncb_discount_amount', ncbText: 'ncb_text',
            upccEnabled: 'cpc_enabled', upccDiscountType: 'cpc_discount_type', upccDiscountPercent: 'cpc_discount_percent', upccDiscountAmount: 'cpc_discount_amount', upccText: 'cpc_text',
            nonRefundableType: 'non_refundable_type', nonRefundablePercent: 'non_refundable_percent',
            agreedValue: 'agreed_value', agreedValueCurrency: 'agreed_value_currency',
            ivEnabled: 'iv_enabled', ivValue: 'iv_value', ivCurrency: 'iv_currency', ivPremiumAmount: 'iv_premium_amount',
            hullClauseId: 'hull_clause_id', ivClauseId: 'iv_clause_id',
            coName: 'co_name', title: 'title',
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
        // Handle JSON-serialized sectionOrder
        if (updates.sectionOrder !== undefined) {
            fields.push('section_order = ?')
            values.push(updates.sectionOrder ? JSON.stringify(updates.sectionOrder) : null)
        }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotations SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotation(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotations WHERE id = ?', [id])
    }

    // ==================== Quotation Revisions & Duplication ====================

    /** Deep-clone all junction tables from sourceId to newId, remapping vessel/alternative IDs */
    private async cloneQuotationJunctions(sourceId: string, newId: string): Promise<void> {
        if (!this.pool) return

        // Clone quotation_vessels first (need ID mapping for vessel_scope)
        const vesselIdMap: Record<string, string> = {}
        const [srcVessels] = await this.pool.query('SELECT * FROM quotation_vessels WHERE quotation_id = ?', [sourceId])
        for (const v of srcVessels as any[]) {
            const newVId = uuidv4()
            vesselIdMap[v.id] = newVId
            await this.pool.execute(
                `INSERT INTO quotation_vessels (id, quotation_id, vessel_id, vessel_label, order_index, name, imo_number, built_year, gross_tonnage, flag, vessel_type, classification, call_sign, premium_amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newVId, newId, v.vessel_id, v.vessel_label, v.order_index, v.name, v.imo_number, v.built_year, v.gross_tonnage, v.flag, v.vessel_type, v.classification, v.call_sign, v.premium_amount]
            )
        }

        // Clone quotation_hull_alternatives (need ID mapping for alternative_id)
        const altIdMap: Record<string, string> = {}
        const [srcAlts] = await this.pool.query('SELECT * FROM quotation_hull_alternatives WHERE quotation_id = ?', [sourceId])
        for (const a of srcAlts as any[]) {
            const newAId = uuidv4()
            altIdMap[a.id] = newAId
            await this.pool.execute(
                `INSERT INTO quotation_hull_alternatives (id, quotation_id, hull_clause_id, label, premium_amount, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
                [newAId, newId, a.hull_clause_id, a.label, a.premium_amount, a.order_index]
            )
        }

        // Helper to remap vessel_scope JSON
        const remapScope = (scope: string | null): string | null => {
            if (!scope) return null
            try {
                const ids = JSON.parse(scope)
                if (!Array.isArray(ids)) return scope
                return JSON.stringify(ids.map((id: string) => vesselIdMap[id] || id))
            } catch { return scope }
        }

        // Clone quotation_pi_alternatives (need ID mapping for alternative_id on P&I tables)
        const piAltIdMap: Record<string, string> = {}
        const [srcPIAlts] = await this.pool.query('SELECT * FROM quotation_pi_alternatives WHERE quotation_id = ?', [sourceId])
        for (const a of srcPIAlts as any[]) {
            const newAId = uuidv4()
            piAltIdMap[a.id] = newAId
            await this.pool.execute(
                `INSERT INTO quotation_pi_alternatives (id, quotation_id, label, premium_amount, order_index) VALUES (?, ?, ?, ?, ?)`,
                [newAId, newId, a.label, a.premium_amount, a.order_index]
            )
        }

        // Helper to remap alternative_id (merged hull + PI maps)
        const combinedAltMap = { ...altIdMap, ...piAltIdMap }
        const remapAlt = (altId: string | null): string | null => {
            if (!altId) return null
            return combinedAltMap[altId] || altId
        }

        // Tables with vessel_scope only (no alternative_id)
        const scopeTables = [
            { table: 'quotation_subjectivities', cols: 'quotation_id, pi_subjectivity_id, text, is_custom, is_auto_populated, order_index, vessel_scope' },
            { table: 'quotation_agreed_value_items', cols: 'quotation_id, hull_text_id, text, section, order_index, vessel_scope' },
            { table: 'quotation_war_conditions', cols: 'quotation_id, war_condition_id, text_override, order_index, vessel_scope' },
        ]

        for (const { table, cols } of scopeTables) {
            const colArr = cols.split(', ')
            const [srcRows] = await this.pool.query(`SELECT * FROM ${table} WHERE quotation_id = ?`, [sourceId])
            for (const row of srcRows as any[]) {
                const newRowId = uuidv4()
                const values = colArr.map(c => {
                    if (c === 'quotation_id') return newId
                    if (c === 'vessel_scope') return remapScope(row[c])
                    return row[c]
                })
                await this.pool.execute(
                    `INSERT INTO ${table} (id, ${cols}) VALUES (?, ${colArr.map(() => '?').join(', ')})`,
                    [newRowId, ...values]
                )
            }
        }

        // Tables with alternative_id + vessel_scope (hull conditions + P&I tables)
        const altScopeTables = [
            { table: 'quotation_hull_conditions', cols: 'quotation_id, hull_condition_id, text_override, condition_section, amount, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_hull_additional_conditions', cols: 'quotation_id, hull_additional_condition_id, text_override, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_clauses', cols: 'quotation_id, pi_clause_id, description_override, vessel_scope, alternative_id' },
            { table: 'quotation_additional_clauses', cols: 'quotation_id, pi_additional_clause_id, custom_text, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_warranties', cols: 'quotation_id, pi_warranty_id, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_custom_warranties', cols: 'quotation_id, text, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_deductibles', cols: 'quotation_id, pi_deductible_id, title, description, amount, currency, secondary_amount, secondary_description, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_text_deductibles', cols: 'quotation_id, pi_text_deductible_id, title, text, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_exclusions', cols: 'quotation_id, pi_exclusion_id, custom_text, vessel_scope, alternative_id' },
            { table: 'quotation_custom_exclusions', cols: 'quotation_id, text, order_index, vessel_scope, alternative_id' },
            { table: 'quotation_survey_warranties', cols: 'quotation_id, template_id, text, deadline_value, days_value, event_value, custom_text, order_index, vessel_scope, alternative_id' },
        ]

        for (const { table, cols } of altScopeTables) {
            const colArr = cols.split(', ')
            const [srcRows] = await this.pool.query(`SELECT * FROM ${table} WHERE quotation_id = ?`, [sourceId])
            for (const row of srcRows as any[]) {
                const newRowId = uuidv4()
                const values = colArr.map(c => {
                    if (c === 'quotation_id') return newId
                    if (c === 'vessel_scope') return remapScope(row[c])
                    if (c === 'alternative_id') return remapAlt(row[c])
                    return row[c]
                })
                await this.pool.execute(
                    `INSERT INTO ${table} (id, ${cols}) VALUES (?, ${colArr.map(() => '?').join(', ')})`,
                    [newRowId, ...values]
                )
            }
        }

        // Simple tables (no vessel_scope, no alternative_id)
        const simpleTables = [
            { table: 'quotation_assureds', cols: 'quotation_id, entity_id, name, role, vessel_label, order_index' },
            { table: 'quotation_sub_limits', cols: 'quotation_id, text, amount, currency' },
            { table: 'quotation_custom_sections', cols: 'quotation_id, title, text, order_index' },
            { table: 'quotation_excluded_countries', cols: 'quotation_id, name, list_type' },
            { table: 'quotation_instalments', cols: 'quotation_id, instalment_number, days_from_inception, description, non_refundable, non_refundable_percent' },
            { table: 'quotation_information', cols: 'quotation_id, text, order_index' },
            { table: 'quotation_notes', cols: 'quotation_id, title, content, order_index' },
        ]

        for (const { table, cols } of simpleTables) {
            const colArr = cols.split(', ')
            const [srcRows] = await this.pool.query(`SELECT * FROM ${table} WHERE quotation_id = ?`, [sourceId])
            for (const row of srcRows as any[]) {
                const newRowId = uuidv4()
                const values = colArr.map(c => c === 'quotation_id' ? newId : row[c])
                await this.pool.execute(
                    `INSERT INTO ${table} (id, ${cols}) VALUES (?, ${colArr.map(() => '?').join(', ')})`,
                    [newRowId, ...values]
                )
            }
        }
    }

    async createQuotationRevision(sourceId: string): Promise<Quotation> {
        if (!this.pool) throw new Error('DB not connected')

        const source = await this.getQuotation(sourceId)
        if (!source) throw new Error('Source quotation not found')
        // Locked quotations CAN be revised — that's the purpose of revisions
        // (create a new unlocked copy from a locked/sent/converted original)

        const newId = uuidv4()
        const revisionGroupId = source.revisionGroupId || source.id
        const newRevisionNumber = (source.revisionNumber || 0) + 1

        // Build revision reference: strip existing -RN suffix, append new one
        const baseRef = (source.referenceNumber || '').replace(/-R\d+$/, '')
        const newRef = `${baseRef}-R${newRevisionNumber}`

        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            // Lock the source quotation and ensure it has the revision_group_id set
            await this.pool.execute('UPDATE quotations SET is_locked = TRUE, revision_group_id = ? WHERE id = ?', [revisionGroupId, sourceId])

            // Clone the main quotation row
            await this.pool.execute(`
                INSERT INTO quotations (
                    id, reference_number, quotation_type_id, quotation_date, policy_type_id, vessel_id,
                    is_renewal, status, period_text, limit_of_liability_amount, limit_of_liability_currency,
                    limit_of_liability_text, premium_amount, premium_currency, num_instalments,
                    trading_warranty_intro, trading_show_ddq_list, trading_show_ddq_warranties, trading_show_israel,
                    trading_custom_text, sanctions_clause_version, vdr_deductible_enabled,
                    deductible_aggregate_enabled, deductible_aggregate_text, validity_days,
                    premium_additional_text, ncb_enabled, ncb_discount_type, ncb_discount_percent,
                    ncb_discount_amount, ncb_text, cpc_enabled, cpc_discount_type, cpc_discount_percent,
                    cpc_discount_amount, cpc_text, non_refundable_type, non_refundable_percent,
                    agreed_value, agreed_value_currency, iv_enabled, iv_value, iv_currency, iv_premium_amount,
                    hull_clause_id, iv_clause_id, co_name, title,
                    section_texts_override, sanctions_text_override, section_order,
                    revision_number, revision_group_id, is_locked, export_snapshot, created_by
                )
                SELECT
                    ?, ?, quotation_type_id, quotation_date, policy_type_id, vessel_id,
                    is_renewal, 'draft', period_text, limit_of_liability_amount, limit_of_liability_currency,
                    limit_of_liability_text, premium_amount, premium_currency, num_instalments,
                    trading_warranty_intro, trading_show_ddq_list, trading_show_ddq_warranties, trading_show_israel,
                    trading_custom_text, sanctions_clause_version, vdr_deductible_enabled,
                    deductible_aggregate_enabled, deductible_aggregate_text, validity_days,
                    premium_additional_text, ncb_enabled, ncb_discount_type, ncb_discount_percent,
                    ncb_discount_amount, ncb_text, cpc_enabled, cpc_discount_type, cpc_discount_percent,
                    cpc_discount_amount, cpc_text, non_refundable_type, non_refundable_percent,
                    agreed_value, agreed_value_currency, iv_enabled, iv_value, iv_currency, iv_premium_amount,
                    hull_clause_id, iv_clause_id, co_name, title,
                    section_texts_override, sanctions_text_override, section_order,
                    ?, ?, FALSE, NULL, created_by
                FROM quotations WHERE id = ?
            `, [newId, newRef, newRevisionNumber, revisionGroupId, sourceId])

            await this.cloneQuotationJunctions(sourceId, newId)
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }

        return (await this.getQuotation(newId))!
    }

    async stripNonSelectedAlternative(quotationId: string, keepAlternativeId: string): Promise<void> {
        if (!this.pool || !keepAlternativeId) return
        // Delete items from non-selected P&I alternatives
        // Keep items where alternativeId = keepAlternativeId OR alternativeId IS NULL (shared)
        const tables = [
            'quotation_clauses',
            'quotation_warranties',
            'quotation_custom_warranties',
            'quotation_deductibles',
            'quotation_text_deductibles',
            'quotation_exclusions',
            'quotation_custom_exclusions'
        ]
        for (const table of tables) {
            try {
                await this.pool.execute(
                    `DELETE FROM ${table} WHERE quotation_id = ? AND alternative_id IS NOT NULL AND alternative_id != ?`,
                    [quotationId, keepAlternativeId]
                )
            } catch { /* table might not have alternative_id column */ }
        }
        // Delete the PI alternatives themselves (keep only the selected one)
        try {
            await this.pool.execute(
                'DELETE FROM quotation_pi_alternatives WHERE quotation_id = ? AND id != ?',
                [quotationId, keepAlternativeId]
            )
        } catch { /* ignore */ }
        // Set remaining items' alternativeId to NULL (they're no longer scoped since there's only one)
        for (const table of tables) {
            try {
                await this.pool.execute(
                    `UPDATE ${table} SET alternative_id = NULL WHERE quotation_id = ? AND alternative_id = ?`,
                    [quotationId, keepAlternativeId]
                )
            } catch { /* ignore */ }
        }
    }

    async duplicateQuotation(sourceId: string): Promise<Quotation> {
        if (!this.pool) throw new Error('DB not connected')

        const source = await this.getQuotation(sourceId)
        if (!source) throw new Error('Source quotation not found')

        const newId = uuidv4()

        // Auto-generate new reference number
        let newRef: string | null = null
        if (source.quotationTypeId) {
            const [typeRow] = await this.pool.query('SELECT code FROM quotation_types WHERE id = ?', [source.quotationTypeId]) as any[]
            const typeCode = typeRow.length > 0 ? typeRow[0].code : '?'
            const [countRow] = await this.pool.query('SELECT COUNT(*) as cnt FROM quotations') as any[]
            const seq = (countRow[0].cnt || 0) + 1
            newRef = `Q/${typeCode}/${seq}`
        }

        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            // Clone the main quotation row — new revision group, revision 0, draft status
            await this.pool.execute(`
                INSERT INTO quotations (
                    id, reference_number, quotation_type_id, quotation_date, policy_type_id, vessel_id,
                    is_renewal, status, period_text, limit_of_liability_amount, limit_of_liability_currency,
                    limit_of_liability_text, premium_amount, premium_currency, num_instalments,
                    trading_warranty_intro, trading_show_ddq_list, trading_show_ddq_warranties, trading_show_israel,
                    trading_custom_text, sanctions_clause_version, vdr_deductible_enabled,
                    deductible_aggregate_enabled, deductible_aggregate_text, validity_days,
                    premium_additional_text, ncb_enabled, ncb_discount_type, ncb_discount_percent,
                    ncb_discount_amount, ncb_text, cpc_enabled, cpc_discount_type, cpc_discount_percent,
                    cpc_discount_amount, cpc_text, non_refundable_type, non_refundable_percent,
                    agreed_value, agreed_value_currency, iv_enabled, iv_value, iv_currency, iv_premium_amount,
                    hull_clause_id, iv_clause_id, co_name, title,
                    section_texts_override, sanctions_text_override, section_order,
                    revision_number, revision_group_id, is_locked, export_snapshot, created_by
                )
                SELECT
                    ?, ?, quotation_type_id, CURDATE(), policy_type_id, vessel_id,
                    is_renewal, 'draft', period_text, limit_of_liability_amount, limit_of_liability_currency,
                    limit_of_liability_text, premium_amount, premium_currency, num_instalments,
                    trading_warranty_intro, trading_show_ddq_list, trading_show_ddq_warranties, trading_show_israel,
                    trading_custom_text, sanctions_clause_version, vdr_deductible_enabled,
                    deductible_aggregate_enabled, deductible_aggregate_text, validity_days,
                    premium_additional_text, ncb_enabled, ncb_discount_type, ncb_discount_percent,
                    ncb_discount_amount, ncb_text, cpc_enabled, cpc_discount_type, cpc_discount_percent,
                    cpc_discount_amount, cpc_text, non_refundable_type, non_refundable_percent,
                    agreed_value, agreed_value_currency, iv_enabled, iv_value, iv_currency, iv_premium_amount,
                    hull_clause_id, iv_clause_id, co_name, NULL,
                    section_texts_override, sanctions_text_override, section_order,
                    0, ?, FALSE, NULL, created_by
                FROM quotations WHERE id = ?
            `, [newId, newRef, newId, sourceId])

            await this.cloneQuotationJunctions(sourceId, newId)
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }

        return (await this.getQuotation(newId))!
    }

    async renewPolicy(policyId: string, createdBy: string): Promise<string> {
        if (!this.pool) throw new Error('DB not connected')

        // 1. Load policy document
        const policy = await this.getPolicyDocumentById(policyId)
        if (!policy) throw new Error('Policy not found')

        // 2. Load the linked quotation (full record)
        const source = await this.getQuotation(policy.quotationId)
        if (!source) throw new Error('Linked quotation not found')

        const newId = uuidv4()

        // Auto-generate new reference number
        let newRef: string | null = null
        if (source.quotationTypeId) {
            const [typeRow] = await this.pool.query('SELECT code FROM quotation_types WHERE id = ?', [source.quotationTypeId]) as any[]
            const typeCode = typeRow.length > 0 ? typeRow[0].code : '?'
            const [countRow] = await this.pool.query('SELECT COUNT(*) as cnt FROM quotations') as any[]
            const seq = (countRow[0].cnt || 0) + 1
            newRef = `Q/${typeCode}/${seq}`
        }

        // Calculate new period: add 1 year to inception/expiry
        const addOneYear = (dateStr: string): string => {
            const d = new Date(dateStr)
            d.setFullYear(d.getFullYear() + 1)
            return d.toISOString().split('T')[0]
        }

        let newPeriodText = source.periodText || null
        if (policy.inceptionDate && policy.expiryDate) {
            const newInception = addOneYear(policy.inceptionDate)
            const newExpiry = addOneYear(policy.expiryDate)
            newPeriodText = `${newInception} to ${newExpiry}`
        }

        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            // 3. Clone the main quotation row
            await this.pool.execute(`
                INSERT INTO quotations (
                    id, reference_number, quotation_type_id, quotation_date, policy_type_id, vessel_id,
                    is_renewal, status, period_text, limit_of_liability_amount, limit_of_liability_currency,
                    limit_of_liability_text, premium_amount, premium_currency, num_instalments,
                    trading_warranty_intro, trading_show_ddq_list, trading_show_ddq_warranties, trading_show_israel,
                    trading_custom_text, sanctions_clause_version, vdr_deductible_enabled,
                    deductible_aggregate_enabled, deductible_aggregate_text, validity_days,
                    premium_additional_text, ncb_enabled, ncb_discount_type, ncb_discount_percent,
                    ncb_discount_amount, ncb_text, cpc_enabled, cpc_discount_type, cpc_discount_percent,
                    cpc_discount_amount, cpc_text, non_refundable_type, non_refundable_percent,
                    agreed_value, agreed_value_currency, iv_enabled, iv_value, iv_currency, iv_premium_amount,
                    hull_clause_id, iv_clause_id, co_name, title,
                    section_texts_override, sanctions_text_override, section_order,
                    revision_number, revision_group_id, is_locked, export_snapshot, created_by,
                    renewed_from_policy_id, renewed_from_policy_number,
                    trading_custom_mode, trading_custom_wording
                )
                SELECT
                    ?, ?, quotation_type_id, CURDATE(), policy_type_id, vessel_id,
                    TRUE, 'draft', ?, limit_of_liability_amount, limit_of_liability_currency,
                    limit_of_liability_text, premium_amount, premium_currency, num_instalments,
                    trading_warranty_intro, trading_show_ddq_list, trading_show_ddq_warranties, trading_show_israel,
                    trading_custom_text, sanctions_clause_version, vdr_deductible_enabled,
                    deductible_aggregate_enabled, deductible_aggregate_text, validity_days,
                    premium_additional_text, ncb_enabled, ncb_discount_type, ncb_discount_percent,
                    ncb_discount_amount, ncb_text, cpc_enabled, cpc_discount_type, cpc_discount_percent,
                    cpc_discount_amount, cpc_text, non_refundable_type, non_refundable_percent,
                    agreed_value, agreed_value_currency, iv_enabled, iv_value, iv_currency, iv_premium_amount,
                    hull_clause_id, iv_clause_id, co_name, NULL,
                    section_texts_override, sanctions_text_override, section_order,
                    0, ?, FALSE, NULL, ?,
                    ?, ?,
                    trading_custom_mode, trading_custom_wording
                FROM quotations WHERE id = ?
            `, [newId, newRef, newPeriodText, newId, createdBy, policyId, policy.policyNumber || null, source.id])

            // 4. Clone all junction tables
            await this.cloneQuotationJunctions(source.id, newId)

            // 5. Refresh vessel details from current DB data
            const [qVessels] = await this.pool.query(
                'SELECT id, vessel_id FROM quotation_vessels WHERE quotation_id = ?', [newId]
            )
            for (const qv of qVessels as any[]) {
                if (!qv.vessel_id) continue
                const [vRows] = await this.pool.query(
                    'SELECT name, imo_number, built_year, gross_tonnage, flag_state_id, vessel_type, classification_society, call_sign FROM vessels WHERE id = ?',
                    [qv.vessel_id]
                )
                const v = (vRows as any[])[0]
                if (!v) continue
                // Resolve flag name
                let flagName = v.flag_state_id || ''
                if (v.flag_state_id) {
                    const [fRows] = await this.pool.query('SELECT name FROM flag_states WHERE id = ?', [v.flag_state_id])
                    if ((fRows as any[]).length > 0) flagName = (fRows as any[])[0].name
                }
                // Resolve classification name
                let className = v.classification_society || ''
                if (v.classification_society) {
                    const [cRows] = await this.pool.query('SELECT name FROM classification_societies WHERE id = ?', [v.classification_society])
                    if ((cRows as any[]).length > 0) className = (cRows as any[])[0].name
                }
                await this.pool.execute(
                    `UPDATE quotation_vessels SET name = ?, imo_number = ?, built_year = ?, gross_tonnage = ?, flag = ?, vessel_type = ?, classification = ?, call_sign = ? WHERE id = ?`,
                    [v.name, v.imo_number, v.built_year, v.gross_tonnage, flagName, v.vessel_type, className, v.call_sign, qv.id]
                )
            }
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }

        return newId
    }

    async getQuotationRevisions(revisionGroupId: string): Promise<Quotation[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT q.id, q.reference_number as referenceNumber,
                q.quotation_type_id as quotationTypeId, qt.name as quotationTypeName, qt.code as quotationTypeCode,
                q.quotation_date as quotationDate,
                q.status, q.revision_number as revisionNumber, q.revision_group_id as revisionGroupId, q.is_locked as isLocked,
                q.created_at as createdAt
            FROM quotations q
            LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
            WHERE q.revision_group_id = ?
            ORDER BY q.revision_number DESC
        `, [revisionGroupId])
        return (rows as any[]).map(r => ({
            ...r,
            isLocked: Boolean(r.isLocked),
            revisionNumber: Number(r.revisionNumber || 0)
        }))
    }

    async saveExportSnapshot(quotationId: string, snapshot: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE quotations SET export_snapshot = ? WHERE id = ?', [snapshot, quotationId])
    }

    async clearExportSnapshot(quotationId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE quotations SET export_snapshot = NULL WHERE id = ?', [quotationId])
    }

    // ==================== Quotation Sub-Tables ====================

    // -- Quotation Assureds --
    async getQuotationAssureds(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT qa.id, qa.quotation_id as quotationId, qa.entity_id as entityId, qa.name, qa.role, qa.vessel_label as vesselLabel, qa.order_index as 'order'
             FROM quotation_assureds qa WHERE qa.quotation_id = ? ORDER BY qa.order_index`, [quotationId])
        return rows as any[]
    }

    async addQuotationAssured(data: { quotationId: string; entityId?: string; name: string; role?: string; vesselLabel?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_assureds (id, quotation_id, entity_id, name, role, vessel_label, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.entityId || null, data.name, data.role || null, data.vesselLabel || null, data.order || 0])
        return { id, ...data }
    }

    async updateQuotationAssured(id: string, updates: { name?: string; role?: string; vesselLabel?: string; order?: number }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role) }
        if (updates.vesselLabel !== undefined) { fields.push('vessel_label = ?'); values.push(updates.vesselLabel || null) }
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
    async getQuotationClauses(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, pi_clause_id as piClauseId, vessel_scope as vesselScope, alternative_id as alternativeId FROM quotation_clauses WHERE quotation_id = ?', [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async getQuotationClauseOverrides(quotationId: string): Promise<Record<string, string>> {
        if (!this.pool) return {}
        const [rows] = await this.pool.query('SELECT pi_clause_id, description_override, alternative_id FROM quotation_clauses WHERE quotation_id = ? AND description_override IS NOT NULL', [quotationId])
        const overrides: Record<string, string> = {}
        for (const r of rows as any[]) {
            if (r.description_override) {
                // Key by clauseId::altId for alt-specific overrides
                const key = r.alternative_id ? `${r.pi_clause_id}::${r.alternative_id}` : r.pi_clause_id
                overrides[key] = r.description_override
            }
        }
        return overrides
    }

    async setQuotationClauses(quotationId: string, clauseIds: string[], descriptionOverrides?: Record<string, string>): Promise<void> {
        if (!this.pool) return
        // Preserve existing vessel_scope and alternative_id values before delete+re-insert
        const [existing] = await this.pool.query('SELECT pi_clause_id, vessel_scope, alternative_id FROM quotation_clauses WHERE quotation_id = ?', [quotationId]) as any[]
        const scopeMap: Record<string, { vs: string | null; alt: string | null }> = {}
        for (const r of existing) { scopeMap[r.pi_clause_id] = { vs: r.vessel_scope, alt: r.alternative_id } }
        await this.pool.execute('DELETE FROM quotation_clauses WHERE quotation_id = ?', [quotationId])
        for (const cid of clauseIds) {
            const override = descriptionOverrides?.[cid] || null
            const saved = scopeMap[cid]
            await this.pool.execute('INSERT INTO quotation_clauses (id, quotation_id, pi_clause_id, description_override, vessel_scope, alternative_id) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), quotationId, cid, override, saved?.vs || null, saved?.alt || null])
        }
    }

    async addQuotationClause(quotationId: string, piClauseId: string, alternativeId?: string | null): Promise<any> {
        if (!this.pool) return null
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_clauses (id, quotation_id, pi_clause_id, alternative_id) VALUES (?, ?, ?, ?)',
            [id, quotationId, piClauseId, alternativeId || null]
        )
        return { id, quotationId, piClauseId, alternativeId: alternativeId || null }
    }

    async deleteQuotationClause(quotationId: string, piClauseId: string, alternativeId?: string | null): Promise<void> {
        if (!this.pool) return
        if (alternativeId) {
            await this.pool.execute('DELETE FROM quotation_clauses WHERE quotation_id = ? AND pi_clause_id = ? AND alternative_id = ?', [quotationId, piClauseId, alternativeId])
        } else {
            await this.pool.execute('DELETE FROM quotation_clauses WHERE quotation_id = ? AND pi_clause_id = ? AND (alternative_id IS NULL)', [quotationId, piClauseId])
        }
    }

    async updateQuotationClauseOverride(quotationId: string, clauseId: string, descriptionOverride: string | null, alternativeId?: string | null): Promise<void> {
        if (!this.pool) return
        if (alternativeId !== undefined) {
            if (alternativeId) {
                await this.pool.execute('UPDATE quotation_clauses SET description_override = ? WHERE quotation_id = ? AND pi_clause_id = ? AND alternative_id = ?', [descriptionOverride, quotationId, clauseId, alternativeId])
            } else {
                await this.pool.execute('UPDATE quotation_clauses SET description_override = ? WHERE quotation_id = ? AND pi_clause_id = ? AND alternative_id IS NULL', [descriptionOverride, quotationId, clauseId])
            }
        } else {
            await this.pool.execute('UPDATE quotation_clauses SET description_override = ? WHERE quotation_id = ? AND pi_clause_id = ?', [descriptionOverride, quotationId, clauseId])
        }
    }

    async piMigrateSharedToAlternative(quotationId: string, alternativeId: string): Promise<void> {
        if (!this.pool) return
        // Migrate all shared (NULL alternative_id) items to the given alternative
        const tables = [
            'quotation_clauses',
            'quotation_warranties',
            'quotation_deductibles',
            'quotation_text_deductibles',
            'quotation_exclusions',
            'quotation_custom_exclusions',
            'quotation_custom_warranties',
            'quotation_additional_clauses'
        ]
        for (const table of tables) {
            try {
                await this.pool.execute(`UPDATE ${table} SET alternative_id = ? WHERE quotation_id = ? AND alternative_id IS NULL`, [alternativeId, quotationId])
            } catch { /* table may not have alternative_id column */ }
        }
    }

    // -- Quotation Additional Clauses --
    async getQuotationAdditionalClauses(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_additional_clause_id as piAdditionalClauseId, custom_text as customText, order_index as 'order', vessel_scope as vesselScope, alternative_id as alternativeId
             FROM quotation_additional_clauses WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async addQuotationAdditionalClause(data: { quotationId: string; piAdditionalClauseId?: string; customText?: string; order?: number; vesselScope?: string[] }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_additional_clauses (id, quotation_id, pi_additional_clause_id, custom_text, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.piAdditionalClauseId || null, data.customText || null, data.order || 0, data.vesselScope ? JSON.stringify(data.vesselScope) : null])
        return { id, ...data }
    }

    async deleteQuotationAdditionalClause(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_additional_clauses WHERE id = ?', [id])
    }

    // -- Quotation Warranties --
    async getQuotationWarranties(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, pi_warranty_id as piWarrantyId, order_index as `order`, vessel_scope as vesselScope, alternative_id as alternativeId FROM quotation_warranties WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async updateQuotationWarrantyVesselScope(quotationId: string, piWarrantyId: string, vesselScope: string[] | null): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE quotation_warranties SET vessel_scope = ? WHERE quotation_id = ? AND pi_warranty_id = ?', [vesselScope ? JSON.stringify(vesselScope) : null, quotationId, piWarrantyId])
    }

    async updateQuotationClauseVesselScope(quotationId: string, piClauseId: string, vesselScope: string[] | null): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE quotation_clauses SET vessel_scope = ? WHERE quotation_id = ? AND pi_clause_id = ?', [vesselScope ? JSON.stringify(vesselScope) : null, quotationId, piClauseId])
    }

    async setQuotationWarranties(quotationId: string, warrantyIds: string[]): Promise<void> {
        if (!this.pool) return
        // Preserve existing vessel_scope and alternative_id values before delete+re-insert
        const [existing] = await this.pool.query('SELECT pi_warranty_id, vessel_scope, alternative_id FROM quotation_warranties WHERE quotation_id = ?', [quotationId]) as any[]
        const scopeMap: Record<string, { vs: string | null; alt: string | null }> = {}
        for (const r of existing) { scopeMap[r.pi_warranty_id] = { vs: r.vessel_scope, alt: r.alternative_id } }
        await this.pool.execute('DELETE FROM quotation_warranties WHERE quotation_id = ?', [quotationId])
        for (let i = 0; i < warrantyIds.length; i++) {
            const saved = scopeMap[warrantyIds[i]]
            await this.pool.execute('INSERT INTO quotation_warranties (id, quotation_id, pi_warranty_id, order_index, vessel_scope, alternative_id) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), quotationId, warrantyIds[i], i, saved?.vs || null, saved?.alt || null])
        }
    }

    // -- Quotation Custom Warranties --
    async getQuotationCustomWarranties(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, text, order_index as `order`, vessel_scope as vesselScope, alternative_id as alternativeId FROM quotation_custom_warranties WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async addQuotationCustomWarranty(data: { quotationId: string; text: string; order?: number; vesselScope?: string[] }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('INSERT INTO quotation_custom_warranties (id, quotation_id, text, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?)',
                [id, data.quotationId, data.text, data.order ?? 0, data.vesselScope ? JSON.stringify(data.vesselScope) : null])
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, quotationId: data.quotationId, text: data.text, order: data.order ?? 0, vesselScope: data.vesselScope || null }
    }

    async updateQuotationCustomWarranty(id: string, updates: { text?: string; vesselScope?: string[] | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.vesselScope !== undefined) { fields.push('vessel_scope = ?'); values.push(updates.vesselScope ? JSON.stringify(updates.vesselScope) : null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_custom_warranties SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationCustomWarranty(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_custom_warranties WHERE id = ?', [id])
    }

    async reorderQuotationCustomWarranties(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_custom_warranties SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // -- Quotation Deductibles --
    async getQuotationDeductibles(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_deductible_id as piDeductibleId, title, description, amount, currency,
                secondary_amount as secondaryAmount, secondary_description as secondaryDescription, order_index as 'order', vessel_scope as vesselScope, alternative_id as alternativeId
             FROM quotation_deductibles WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, amount: Number(r.amount), secondaryAmount: r.secondaryAmount ? Number(r.secondaryAmount) : undefined, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async addQuotationDeductible(data: { quotationId: string; piDeductibleId?: string; title?: string; description: string; amount: number; currency: string; secondaryAmount?: number; secondaryDescription?: string; order?: number; vesselScope?: string[] }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_deductibles (id, quotation_id, pi_deductible_id, title, description, amount, currency, secondary_amount, secondary_description, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.piDeductibleId || null, data.title || '', data.description, data.amount, data.currency, data.secondaryAmount || null, data.secondaryDescription || null, data.order || 0, data.vesselScope ? JSON.stringify(data.vesselScope) : null])
        return { id, ...data }
    }

    async updateQuotationDeductible(id: string, updates: { title?: string; description?: string; amount?: number; currency?: string; secondaryAmount?: number; secondaryDescription?: string; vesselScope?: string[] | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.amount !== undefined) { fields.push('amount = ?'); values.push(updates.amount) }
        if (updates.currency !== undefined) { fields.push('currency = ?'); values.push(updates.currency) }
        if (updates.secondaryAmount !== undefined) { fields.push('secondary_amount = ?'); values.push(updates.secondaryAmount) }
        if (updates.secondaryDescription !== undefined) { fields.push('secondary_description = ?'); values.push(updates.secondaryDescription) }
        if (updates.vesselScope !== undefined) { fields.push('vessel_scope = ?'); values.push(updates.vesselScope ? JSON.stringify(updates.vesselScope) : null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_deductibles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationDeductible(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_deductibles WHERE id = ?', [id])
    }

    async reorderQuotationDeductibles(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_deductibles SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // -- Quotation Text Deductibles --
    async getQuotationTextDeductibles(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_text_deductible_id as piTextDeductibleId, title, text, order_index as 'order', vessel_scope as vesselScope, alternative_id as alternativeId FROM quotation_text_deductibles WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async addQuotationTextDeductible(data: { quotationId: string; piTextDeductibleId?: string; title?: string; text: string; order?: number; vesselScope?: string[] }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('INSERT INTO quotation_text_deductibles (id, quotation_id, pi_text_deductible_id, title, text, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [id, data.quotationId, data.piTextDeductibleId || null, data.title || '', data.text, data.order ?? 0, data.vesselScope ? JSON.stringify(data.vesselScope) : null])
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, quotationId: data.quotationId, piTextDeductibleId: data.piTextDeductibleId, title: data.title || '', text: data.text, order: data.order ?? 0, vesselScope: data.vesselScope || null }
    }

    async updateQuotationTextDeductible(id: string, updates: { title?: string; text?: string; vesselScope?: string[] | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.vesselScope !== undefined) { fields.push('vessel_scope = ?'); values.push(updates.vesselScope ? JSON.stringify(updates.vesselScope) : null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_text_deductibles SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationTextDeductible(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_text_deductibles WHERE id = ?', [id])
    }

    async reorderQuotationTextDeductibles(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_text_deductibles SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // -- Quotation Exclusions --
    async getQuotationExclusions(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_exclusion_id as piExclusionId, custom_text as customText, vessel_scope as vesselScope, alternative_id as alternativeId
             FROM quotation_exclusions WHERE quotation_id = ?`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async setQuotationExclusions(quotationId: string, items: { piExclusionId?: string; customText?: string }[]): Promise<void> {
        if (!this.pool) return
        // Preserve existing vessel_scope and alternative_id values before delete+re-insert
        const [existing] = await this.pool.query('SELECT pi_exclusion_id, vessel_scope, alternative_id FROM quotation_exclusions WHERE quotation_id = ?', [quotationId]) as any[]
        const scopeMap: Record<string, { vs: string | null; alt: string | null }> = {}
        for (const r of existing) { if (r.pi_exclusion_id) scopeMap[r.pi_exclusion_id] = { vs: r.vessel_scope, alt: r.alternative_id } }
        await this.pool.execute('DELETE FROM quotation_exclusions WHERE quotation_id = ?', [quotationId])
        for (const item of items) {
            const saved = item.piExclusionId ? scopeMap[item.piExclusionId] : undefined
            await this.pool.execute('INSERT INTO quotation_exclusions (id, quotation_id, pi_exclusion_id, custom_text, vessel_scope, alternative_id) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), quotationId, item.piExclusionId || null, item.customText || null, saved?.vs || null, saved?.alt || null])
        }
    }

    async addQuotationExclusion(quotationId: string, piExclusionId: string, alternativeId?: string | null): Promise<any> {
        if (!this.pool) return null
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_exclusions (id, quotation_id, pi_exclusion_id, alternative_id) VALUES (?, ?, ?, ?)',
            [id, quotationId, piExclusionId, alternativeId || null])
        return { id, quotationId, piExclusionId, alternativeId: alternativeId || null }
    }

    async deleteQuotationExclusion(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_exclusions WHERE id = ?', [id])
    }

    // -- Quotation Custom Exclusions --
    async getQuotationCustomExclusions(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, text, order_index as `order`, vessel_scope as vesselScope, alternative_id as alternativeId FROM quotation_custom_exclusions WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null }))
    }

    async addQuotationCustomExclusion(data: { quotationId: string; text: string; order?: number; vesselScope?: string[] }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_custom_exclusions (id, quotation_id, text, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?)',
            [id, data.quotationId, data.text, data.order ?? 0, data.vesselScope ? JSON.stringify(data.vesselScope) : null])
        return { id, quotationId: data.quotationId, text: data.text, order: data.order ?? 0, vesselScope: data.vesselScope || null }
    }

    async updateQuotationCustomExclusion(id: string, updates: { text?: string; vesselScope?: string[] | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.vesselScope !== undefined) { fields.push('vessel_scope = ?'); values.push(updates.vesselScope ? JSON.stringify(updates.vesselScope) : null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_custom_exclusions SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationCustomExclusion(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_custom_exclusions WHERE id = ?', [id])
    }

    async reorderQuotationCustomExclusions(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_custom_exclusions SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // -- Quotation Custom Sections --
    async getQuotationCustomSections(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, title, text, order_index as `order` FROM quotation_custom_sections WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return rows as any[]
    }

    async addQuotationCustomSection(data: { quotationId: string; title: string; text?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO quotation_custom_sections (id, quotation_id, title, text, order_index) VALUES (?, ?, ?, ?, ?)',
            [id, data.quotationId, data.title, data.text || null, data.order ?? 0])
        return { id, quotationId: data.quotationId, title: data.title, text: data.text || null, order: data.order ?? 0 }
    }

    async updateQuotationCustomSection(id: string, updates: { title?: string; text?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_custom_sections SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationCustomSection(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_custom_sections WHERE id = ?', [id])
    }

    async reorderQuotationCustomSections(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_custom_sections SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // -- Section Order Defaults --
    async getSectionOrderDefaults(): Promise<string[]> {
        const val = await this.getSetting('section_order_defaults')
        if (!val) return []
        try { return JSON.parse(val) } catch { return [] }
    }

    async setSectionOrderDefaults(order: string[], updatedBy?: string): Promise<void> {
        await this.setSetting('section_order_defaults', JSON.stringify(order), updatedBy)
    }

    async getSectionOrderDefaultsByType(typeCode: string): Promise<string[]> {
        const val = await this.getSetting(`section_order_defaults_${typeCode}`)
        if (!val) return []
        try { return JSON.parse(val) } catch { return [] }
    }

    async setSectionOrderDefaultsByType(typeCode: string, order: string[]): Promise<void> {
        await this.setSetting(`section_order_defaults_${typeCode}`, JSON.stringify(order))
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

    // -- Master Subjectivities (PI) --
    async getPISubjectivities(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            "SELECT id, text, COALESCE(type_scope, 'all') as typeScope, order_index as `order` FROM pi_subjectivities ORDER BY order_index ASC")
        const subjs = rows as any[]
        // Load doc type links
        for (const s of subjs) {
            const [links] = await this.pool.query(
                'SELECT doc_type_id as docTypeId FROM pi_subjectivity_doc_types WHERE subjectivity_id = ?', [s.id])
            s.docTypeIds = (links as any[]).map(l => l.docTypeId)
        }
        return subjs
    }

    async addPISubjectivity(data: { text: string; docTypeIds?: string[]; typeScope?: string; order?: number }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute('INSERT INTO pi_subjectivities (id, text, type_scope, order_index) VALUES (?, ?, ?, ?)',
            [id, data.text, data.typeScope || 'all', data.order || 0])
        if (data.docTypeIds && data.docTypeIds.length > 0) {
            for (const dtId of data.docTypeIds) {
                await this.pool.execute('INSERT INTO pi_subjectivity_doc_types (id, subjectivity_id, doc_type_id) VALUES (?, ?, ?)',
                    [uuidv4(), id, dtId])
            }
        }
        return { id, text: data.text, docTypeIds: data.docTypeIds || [], typeScope: data.typeScope || 'all', order: data.order || 0 }
    }

    async updatePISubjectivity(id: string, data: { text: string; docTypeIds?: string[]; typeScope?: string }): Promise<void> {
        if (!this.pool) return
        const fields = ['text = ?']
        const vals: any[] = [data.text]
        if (data.typeScope !== undefined) { fields.push('type_scope = ?'); vals.push(data.typeScope) }
        vals.push(id)
        await this.pool.execute(`UPDATE pi_subjectivities SET ${fields.join(', ')} WHERE id = ?`, vals)
        // Replace doc type links
        await this.pool.execute('DELETE FROM pi_subjectivity_doc_types WHERE subjectivity_id = ?', [id])
        if (data.docTypeIds && data.docTypeIds.length > 0) {
            for (const dtId of data.docTypeIds) {
                await this.pool.execute('INSERT INTO pi_subjectivity_doc_types (id, subjectivity_id, doc_type_id) VALUES (?, ?, ?)',
                    [uuidv4(), id, dtId])
            }
        }
    }

    async deletePISubjectivity(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM pi_subjectivities WHERE id = ?', [id])
    }

    async reorderPISubjectivities(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE pi_subjectivities SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // -- Quotation Subjectivities --
    async getQuotationSubjectivities(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, pi_subjectivity_id as piSubjectivityId, text, is_custom as isCustom, is_auto_populated as isAutoPopulated, order_index as 'order', vessel_scope as vesselScope FROM quotation_subjectivities WHERE quotation_id = ? ORDER BY order_index`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, isCustom: Boolean(r.isCustom), isAutoPopulated: Boolean(r.isAutoPopulated), vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null }))
    }

    async addQuotationSubjectivity(data: { quotationId: string; piSubjectivityId?: string; text: string; isCustom?: boolean; isAutoPopulated?: boolean; order?: number; vesselScope?: string[] }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_subjectivities (id, quotation_id, pi_subjectivity_id, text, is_custom, is_auto_populated, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.piSubjectivityId || null, data.text, data.isCustom ? 1 : 0, data.isAutoPopulated ? 1 : 0, data.order || 0, data.vesselScope ? JSON.stringify(data.vesselScope) : null])
        return { id, ...data }
    }

    async updateQuotationSubjectivity(id: string, data: { text?: string; order?: number; vesselScope?: string[] | null }): Promise<void> {
        if (!this.pool) return
        const sets: string[] = []
        const vals: any[] = []
        if (data.text !== undefined) { sets.push('text = ?'); vals.push(data.text) }
        if (data.order !== undefined) { sets.push('order_index = ?'); vals.push(data.order) }
        if (data.vesselScope !== undefined) { sets.push('vessel_scope = ?'); vals.push(data.vesselScope ? JSON.stringify(data.vesselScope) : null) }
        if (sets.length === 0) return
        vals.push(id)
        await this.pool.execute(`UPDATE quotation_subjectivities SET ${sets.join(', ')} WHERE id = ?`, vals)
    }

    async deleteQuotationSubjectivity(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_subjectivities WHERE id = ?', [id])
    }

    // -- Generic vessel scope update for any quotation item table --
    async updateQuotationItemVesselScope(table: string, id: string, vesselScope: string[] | null): Promise<void> {
        if (!this.pool) return
        const allowedTables = ['quotation_warranties', 'quotation_custom_warranties', 'quotation_deductibles', 'quotation_text_deductibles', 'quotation_subjectivities', 'quotation_clauses', 'quotation_additional_clauses', 'quotation_exclusions', 'quotation_custom_exclusions']
        if (!allowedTables.includes(table)) return
        await this.pool.execute(`UPDATE ${table} SET vessel_scope = ? WHERE id = ?`, [vesselScope ? JSON.stringify(vesselScope) : null, id])
    }

    // -- Quotation Instalments --
    async getQuotationInstalments(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, quotation_id as quotationId, instalment_number as instalmentNumber, days_from_inception as daysFromInception
             FROM quotation_instalments WHERE quotation_id = ? ORDER BY instalment_number`, [quotationId])
        return (rows as any[]).map(r => ({ ...r, instalmentNumber: Number(r.instalmentNumber), daysFromInception: Number(r.daysFromInception) }))
    }

    async setQuotationInstalments(quotationId: string, instalments: { instalmentNumber: number; daysFromInception: number }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_instalments WHERE quotation_id = ?', [quotationId])
        for (const inst of instalments) {
            await this.pool.execute(
                'INSERT INTO quotation_instalments (id, quotation_id, instalment_number, days_from_inception) VALUES (?, ?, ?, ?)',
                [uuidv4(), quotationId, inst.instalmentNumber, inst.daysFromInception])
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
            `SELECT id, quotation_id as quotationId, title, content, order_index as 'order',
             parent_note_id AS parentNoteId, author_user_id AS authorUserId, author_username AS authorUsername,
             created_at AS createdAt
             FROM quotation_notes WHERE quotation_id = ? ORDER BY created_at ASC, order_index ASC`, [quotationId])
        return rows as any[]
    }

    async addQuotationNote(data: { quotationId: string; title: string; content?: string; order?: number; parentNoteId?: string; authorUserId?: string; authorUsername?: string }): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_notes (id, quotation_id, title, content, order_index, parent_note_id, author_user_id, author_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, data.quotationId, data.title, data.content || null, data.order || 0, data.parentNoteId || null, data.authorUserId || null, data.authorUsername || null])
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
        const [rows] = await this.pool.query("SELECT id, name, COALESCE(type_scope, 'all') as typeScope, order_index as `order` FROM pi_warranty_tags ORDER BY order_index ASC")
        return (rows as any[]).map(r => ({ ...r, typeScope: r.typeScope || 'all' })) as PIWarrantyTag[]
    }

    async addPIWarrantyTag(name: string): Promise<PIWarrantyTag> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow]: any[] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM pi_warranty_tags')
        const order = maxRow[0].nextOrder
        await this.pool.execute("INSERT INTO pi_warranty_tags (id, name, type_scope, order_index) VALUES (?, ?, ?, ?)", [id, name, 'all', order])
        return { id, name, typeScope: 'all' as const, order }
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

    // ==================== Banks ====================

    async getBanks(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, details, order_index AS `order` FROM banks ORDER BY order_index ASC')
        return rows as any[]
    }

    async addBank(name: string, details: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM banks')
        const nextOrder = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO banks (id, name, details, order_index) VALUES (?, ?, ?, ?)', [id, name, details, nextOrder])
        return { id, name, details, order: nextOrder }
    }

    async updateBank(id: string, updates: Partial<{ name: string; details: string }>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.details !== undefined) { fields.push('details = ?'); values.push(updates.details) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE banks SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteBank(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM banks WHERE id = ?', [id])
    }

    async reorderBanks(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE banks SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // ==================== Policy Documents ====================

    async getPoliciesList(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT pd.id, pd.quotation_id as quotationId, pd.vessel_id as vesselId,
                    pd.policy_number as policyNumber, pd.status,
                    pd.revision_number as revisionNumber,
                    pd.inception_date as inceptionDate, pd.inception_time as inceptionTime,
                    pd.expiry_date as expiryDate, pd.expiry_time as expiryTime,
                    pd.timezone, pd.premium_amount as premiumAmount,
                    pd.commission_percent as commissionPercent,
                    pd.created_at as createdAt,
                    pd.exported_at as exportedAt,
                    v.name as vesselName, v.imo_number as imoNumber,
                    e.name as customerName,
                    qt.code as quotationTypeCode, qt.name as quotationTypeName,
                    qt.id as policyTypeId, qt.name as policyTypeName,
                    b.name as brokerName
             FROM policy_documents pd
             LEFT JOIN vessels v ON pd.vessel_id = v.id
             LEFT JOIN entities e ON v.customer_id = e.id
             LEFT JOIN quotations q ON pd.quotation_id = q.id
             LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
             LEFT JOIN banks b ON pd.bank_id = b.id
             WHERE pd.revision_number = (
                SELECT MAX(pd2.revision_number) FROM policy_documents pd2
                WHERE pd2.policy_number = pd.policy_number
             )
             ORDER BY pd.created_at DESC`
        )
        return (rows as any[]).map(r => ({
            ...r,
            revisionNumber: Number(r.revisionNumber || 0),
            premiumAmount: r.premiumAmount != null ? Number(r.premiumAmount) : undefined,
            commissionPercent: r.commissionPercent != null ? Number(r.commissionPercent) : undefined
        }))
    }

    async getPolicyDocumentById(id: string): Promise<any> {
        if (!this.pool) return null
        const [rows] = await this.pool.query(`
            SELECT pd.*, qt.code as quotationTypeCode, qt.name as quotationTypeName,
                   v.name as vesselName, v.imo_number as imoNumber, v.vessel_type as vesselType,
                   v.flag_state_id as flagStateId, v.built_year as builtYear, v.gross_tonnage as grossTonnage,
                   v.classification_society as classificationSociety, v.fleet_id as fleetId, v.customer_type as customerType, v.call_sign as callSign,
                   fs.name as flagStateName, fs.iso3_code as flagIso3Code,
                   e.name as customerName,
                   b.name as bankName, b.details as bankDetails,
                   f.name as fleetName,
                   u.username as createdByName
            FROM policy_documents pd
            LEFT JOIN quotations q ON pd.quotation_id = q.id
            LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
            LEFT JOIN vessels v ON pd.vessel_id = v.id
            LEFT JOIN flag_states fs ON v.flag_state_id = fs.id
            LEFT JOIN entities e ON v.customer_id = e.id
            LEFT JOIN banks b ON pd.bank_id = b.id
            LEFT JOIN fleets f ON v.fleet_id = f.id
            LEFT JOIN users u ON pd.created_by = u.id
            WHERE pd.id = ?
        `, [id])
        const r = (rows as any[])[0]
        if (!r) return null
        return {
            ...r,
            showAddresses: Boolean(r.show_addresses),
            proRata: Boolean(r.pro_rata),
            commissionPercent: r.commission_percent ? Number(r.commission_percent) : null,
            perAnnumPremium: r.per_annum_premium ? Number(r.per_annum_premium) : null,
            premiumAmount: r.premium_amount ? Number(r.premium_amount) : 0,
            selectedAlternativeId: r.selected_alternative_id || null,
            revisionNumber: Number(r.revision_number || 0),
            quotationId: r.quotation_id,
            vesselId: r.vessel_id,
            policyNumber: r.policy_number,
            inceptionDate: r.inception_date,
            inceptionTime: r.inception_time,
            expiryDate: r.expiry_date,
            expiryTime: r.expiry_time,
            bankId: r.bank_id,
            cancelReplaceText: r.cancel_replace_text || null,
            previousPolicyNumber: r.previous_policy_number || null,
            previousPolicyDate: r.previous_policy_date || null,
            openingClause: r.opening_clause || null,
            importantNotice: r.important_notice || null,
            closingCity: r.closing_city || null,
            createdBy: r.created_by || null,
            exportedAt: r.exported_at || null,
            createdAt: r.created_at,
            exchangeRate: r.exchange_rate ? Number(r.exchange_rate) : 1,
            flagIso3Code: r.flagIso3Code || null,
            fleetId: r.fleetId || null,
            fleetName: r.fleetName || null,
            classificationSociety: r.classificationSociety || null,
            customerType: r.customerType || null,
            createdByName: r.createdByName || null,
        }
    }

    async getPolicyInstalments(policyId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT id, policy_doc_id as policyDocId, instalment_number as instalmentNumber,
                   due_date as dueDate, premium_amount as premiumAmount,
                   commission_amount as commissionAmount, is_non_refundable as isNonRefundable
            FROM policy_doc_instalments
            WHERE policy_doc_id = ?
            ORDER BY instalment_number ASC
        `, [policyId])
        return (rows as any[]).map(r => ({
            ...r,
            premiumAmount: r.premiumAmount ? Number(r.premiumAmount) : 0,
            commissionAmount: r.commissionAmount ? Number(r.commissionAmount) : 0,
            isNonRefundable: Boolean(r.isNonRefundable),
        }))
    }

    async getPolicyAddresses(policyId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT pda.id, pda.policy_doc_id as policyDocId, pda.entity_id as entityId,
                   pda.role, pda.address_text as addressText,
                   e.name as entityName
            FROM policy_doc_addresses pda
            LEFT JOIN entities e ON pda.entity_id = e.id
            WHERE pda.policy_doc_id = ?
        `, [policyId])
        return rows as any[]
    }

    async getPolicyRevisions(policyNumber: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT pd.id, pd.policy_number as policyNumber, pd.revision_number as revisionNumber,
                   pd.status, pd.created_at as createdAt, pd.exported_at as exportedAt,
                   u.username as createdByName
            FROM policy_documents pd
            LEFT JOIN users u ON pd.created_by = u.id
            WHERE pd.policy_number = ?
            ORDER BY pd.revision_number DESC
        `, [policyNumber])
        return (rows as any[]).map(r => ({ ...r, revisionNumber: Number(r.revisionNumber || 0) }))
    }

    async getPolicyBlueCards(policyId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(`
            SELECT id, policy_doc_id as policyDocId, card_type as cardType,
                   card_number as cardNumber, inception_date as inceptionDate,
                   expiry_date as expiryDate, revision_number as revisionNumber,
                   issued_date as issuedDate, status,
                   owner_entity_id as ownerEntityId, owner_name as ownerName,
                   owner_address as ownerAddress, port_of_registry as portOfRegistry,
                   addressed_to_flag_id as addressedToFlagId,
                   addressed_to_name as addressedToName,
                   addressed_to_address as addressedToAddress,
                   cancel_replace_text as cancelReplaceText
            FROM policy_blue_cards
            WHERE policy_doc_id = ?
            ORDER BY card_type ASC, revision_number DESC
        `, [policyId])
        return (rows as any[]).map(r => ({
            ...r,
            revisionNumber: Number(r.revisionNumber || 0),
            status: r.status || 'active',
        }))
    }

    async addPolicyBlueCard(data: {
        policyId: string
        cardType: string
        cardNumber: string
        inceptionDate: string
        expiryDate: string
        revisionNumber: number
        issuedDate: string
        status?: string
        ownerEntityId?: string
        ownerName?: string
        ownerAddress?: string
        portOfRegistry?: string
        addressedToFlagId?: string
        addressedToName?: string
        addressedToAddress?: string
        cancelReplaceText?: string
    }): Promise<any> {
        if (!this.pool) return null
        const id = uuidv4()
        await this.pool.execute(`
            INSERT INTO policy_blue_cards (id, policy_doc_id, card_type, card_number,
                inception_date, expiry_date, revision_number, issued_date, status,
                owner_entity_id, owner_name, owner_address, port_of_registry,
                addressed_to_flag_id, addressed_to_name, addressed_to_address,
                cancel_replace_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, data.policyId, data.cardType, data.cardNumber,
            data.inceptionDate, data.expiryDate, data.revisionNumber,
            data.issuedDate, data.status || 'active',
            data.ownerEntityId || null, data.ownerName || null,
            data.ownerAddress || null, data.portOfRegistry || null,
            data.addressedToFlagId || null, data.addressedToName || null,
            data.addressedToAddress || null, data.cancelReplaceText || null,
        ])
        return { id, ...data, status: data.status || 'active' }
    }

    async updatePolicyBlueCard(id: string, data: Record<string, any>): Promise<void> {
        if (!this.pool) return
        const sets: string[] = []
        const vals: any[] = []
        const fieldMap: Record<string, string> = {
            cardNumber: 'card_number',
            inceptionDate: 'inception_date',
            expiryDate: 'expiry_date',
            issuedDate: 'issued_date',
            ownerEntityId: 'owner_entity_id',
            ownerName: 'owner_name',
            ownerAddress: 'owner_address',
            portOfRegistry: 'port_of_registry',
            addressedToFlagId: 'addressed_to_flag_id',
            addressedToName: 'addressed_to_name',
            addressedToAddress: 'addressed_to_address',
            cancelReplaceText: 'cancel_replace_text',
        }
        for (const [key, col] of Object.entries(fieldMap)) {
            if (key in data) {
                sets.push(`${col} = ?`)
                vals.push(data[key] ?? null)
            }
        }
        if (sets.length === 0) return
        vals.push(id)
        await this.pool.execute(
            `UPDATE policy_blue_cards SET ${sets.join(', ')} WHERE id = ?`,
            vals
        )
    }

    async supersedePolicyBlueCard(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            `UPDATE policy_blue_cards SET status = 'superseded' WHERE id = ?`,
            [id]
        )
    }

    async updatePolicyDocument(id: string, fields: Record<string, any>): Promise<void> {
        if (!this.pool) return
        const fieldMap: Record<string, string> = {
            inceptionDate: 'inception_date',
            inceptionTime: 'inception_time',
            expiryDate: 'expiry_date',
            expiryTime: 'expiry_time',
            timezone: 'timezone',
            premiumAmount: 'premium_amount',
            perAnnumPremium: 'per_annum_premium',
            commissionPercent: 'commission_percent',
            bankId: 'bank_id',
            showAddresses: 'show_addresses',
            proRata: 'pro_rata',
            status: 'status',
            cancelReplaceText: 'cancel_replace_text',
            previousPolicyNumber: 'previous_policy_number',
            previousPolicyDate: 'previous_policy_date',
            openingClause: 'opening_clause',
            importantNotice: 'important_notice',
            closingCity: 'closing_city',
            quotationId: 'quotation_id',
            selectedAlternativeId: 'selected_alternative_id',
            exportedAt: 'exported_at',
            exchangeRate: 'exchange_rate',
        }
        const sets: string[] = []
        const vals: any[] = []
        for (const [key, col] of Object.entries(fieldMap)) {
            if (key in fields) {
                sets.push(`${col} = ?`)
                vals.push(fields[key] ?? null)
            }
        }
        if (sets.length === 0) return
        vals.push(id)
        await this.pool.execute(
            `UPDATE policy_documents SET ${sets.join(', ')} WHERE id = ?`,
            vals
        )
    }

    async setPolicyInstalments(policyId: string, instalments: { instalmentNumber: number; dueDate: string; premiumAmount: number; commissionAmount: number; isNonRefundable: boolean }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM policy_doc_instalments WHERE policy_doc_id = ?', [policyId])
        for (const inst of instalments) {
            await this.pool.execute(`
                INSERT INTO policy_doc_instalments (id, policy_doc_id, instalment_number, due_date, premium_amount, commission_amount, is_non_refundable)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [uuidv4(), policyId, inst.instalmentNumber, inst.dueDate, inst.premiumAmount, inst.commissionAmount, inst.isNonRefundable ? 1 : 0])
        }
    }

    async setPolicyAddresses(policyId: string, addresses: { entityId: string; role: string; addressText: string }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM policy_doc_addresses WHERE policy_doc_id = ?', [policyId])
        for (const addr of addresses) {
            await this.pool.execute(`
                INSERT INTO policy_doc_addresses (id, policy_doc_id, entity_id, role, address_text)
                VALUES (?, ?, ?, ?, ?)
            `, [uuidv4(), policyId, addr.entityId || null, addr.role || '', addr.addressText || ''])
        }
    }

    async createPolicyRevision(policyId: string, createdBy: string): Promise<string> {
        if (!this.pool) throw new Error('DB not connected')
        const existing = await this.getPolicyDocumentById(policyId)
        if (!existing) throw new Error('Policy not found')

        const newId = uuidv4()
        // Get max revision for this policy number to avoid duplicates
        const [maxRevRows] = await this.pool.query(
            'SELECT COALESCE(MAX(revision_number), 0) as maxRev FROM policy_documents WHERE policy_number = ?',
            [existing.policyNumber]
        )
        const newRevision = ((maxRevRows as any[])[0]?.maxRev || 0) + 1

        // Auto-generate cancel and replace text
        const today = new Date().toISOString().split('T')[0]
        const cancelText = `This policy ${existing.policyNumber} cancels and replaces policy ${existing.policyNumber} dated ${today}`

        // Insert new revision with selected_alternative_id preserved
        await this.pool.execute(`
            INSERT INTO policy_documents (id, quotation_id, vessel_id, policy_number, status,
                revision_number, inception_date, inception_time, expiry_date, expiry_time,
                timezone, commission_percent, show_addresses, bank_id, pro_rata,
                per_annum_premium, premium_amount, selected_alternative_id, opening_clause,
                important_notice, closing_city, cancel_replace_text,
                previous_policy_number, previous_policy_date, created_by)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newId, existing.quotationId, existing.vesselId, existing.policyNumber, newRevision,
            existing.inceptionDate, existing.inceptionTime, existing.expiryDate, existing.expiryTime,
            existing.timezone, existing.commissionPercent, existing.showAddresses ? 1 : 0,
            existing.bankId, existing.proRata ? 1 : 0, existing.perAnnumPremium, existing.premiumAmount,
            existing.selectedAlternativeId || existing.selected_alternative_id || null,
            existing.opening_clause || null, existing.important_notice || null,
            existing.closing_city || null, cancelText,
            existing.policyNumber, today,
            createdBy
        ])

        // Copy instalments
        const instalments = await this.getPolicyInstalments(policyId)
        for (const inst of instalments) {
            await this.pool.execute(`
                INSERT INTO policy_doc_instalments (id, policy_doc_id, instalment_number, due_date, premium_amount, commission_amount, is_non_refundable)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [uuidv4(), newId, inst.instalmentNumber, inst.dueDate, inst.premiumAmount, inst.commissionAmount, inst.isNonRefundable ? 1 : 0])
        }

        // Copy addresses
        const addresses = await this.getPolicyAddresses(policyId)
        for (const addr of addresses) {
            await this.pool.execute(`
                INSERT INTO policy_doc_addresses (id, policy_doc_id, entity_id, role, address_text)
                VALUES (?, ?, ?, ?, ?)
            `, [uuidv4(), newId, addr.entityId || null, addr.role || '', addr.addressText || ''])
        }

        // Copy active blue cards
        const blueCards = await this.getPolicyBlueCards(policyId)
        for (const bc of blueCards.filter((b: any) => b.status === 'active')) {
            await this.pool.execute(`
                INSERT INTO policy_blue_cards (id, policy_doc_id, card_type, card_number,
                    inception_date, expiry_date, revision_number, issued_date, status,
                    owner_entity_id, owner_name, owner_address, port_of_registry,
                    addressed_to_flag_id, addressed_to_name, addressed_to_address, cancel_replace_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                uuidv4(), newId, bc.cardType, bc.cardNumber,
                bc.inceptionDate, bc.expiryDate, bc.revisionNumber || 0, bc.issuedDate,
                bc.ownerEntityId || null, bc.ownerName || null, bc.ownerAddress || null,
                bc.portOfRegistry || null, bc.addressedToFlagId || null,
                bc.addressedToName || null, bc.addressedToAddress || null,
                bc.cancelReplaceText || null
            ])
        }

        // Mark old policy as superseded (blue cards on old policy stay as-is for historical reference)
        await this.pool.execute(
            `UPDATE policy_documents SET status = 'superseded' WHERE id = ?`,
            [policyId]
        )

        return newId
    }

    async deletePolicyDocument(id: string): Promise<void> {
        if (!this.pool) return
        // Delete related records first (no FK cascade since no FK constraints)
        await this.pool.execute('DELETE FROM policy_doc_instalments WHERE policy_doc_id = ?', [id])
        await this.pool.execute('DELETE FROM policy_doc_addresses WHERE policy_doc_id = ?', [id])
        await this.pool.execute('DELETE FROM policy_blue_cards WHERE policy_doc_id = ?', [id])
        await this.pool.execute('DELETE FROM policy_documents WHERE id = ?', [id])
    }

    async convertQuotationToPolicy(quotationId: string, options: {
        vesselIds: string[]
        inceptionDate: string
        inceptionTime: string
        expiryDate: string
        expiryTime: string
        timezone: string
        instalments: { dueDate: string; premiumAmount: number; commissionAmount: number; isNonRefundable: boolean }[]
        commissionPercent: number | null
        bankId: string | null
        showAddresses: boolean
        blueCards: string[]
        createdBy: string
        selectedAlternativeId?: string | null
        exchangeRate?: number
    }): Promise<any[]> {
        if (!this.pool) throw new Error('DB not connected')

        const quotation = await this.getQuotation(quotationId)
        if (!quotation) throw new Error('Quotation not found')

        // Get quotation type code for policy number generation
        const typeCode = quotation.quotationTypeCode || 'P'

        // Generate policy numbers: type + inverted year (swap pairs) + 4-digit serial
        // 2026 → swap "20" and "26" → "2620"
        const yearStr = String(new Date().getFullYear())
        const invertedYear = yearStr.slice(2) + yearStr.slice(0, 2)

        // Get next serial number (global across all types)
        // Extract serial from right side of policy number (after type code + 4-digit year = 5 chars)
        const [serialRow] = await this.pool.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(policy_number, 6) AS UNSIGNED)), 0) as maxSerial
             FROM policy_documents WHERE LENGTH(policy_number) >= 9 AND policy_number REGEXP '^[A-Z][0-9]{4,}'`
        )
        let nextSerial = ((serialRow as any[])[0]?.maxSerial || 0) + 1
        // If corrupted data exists, just count total + 1
        if (nextSerial > 99999) {
            const [countRow] = await this.pool.query('SELECT COUNT(*) as cnt FROM policy_documents')
            nextSerial = ((countRow as any[])[0]?.cnt || 0) + 1
        }

        const createdPolicies: any[] = []
        const vessels = await this.getQuotationVessels(quotationId)

        for (const vid of options.vesselIds) {
            const vessel = vessels.find(v => v.vesselId === vid || v.id === vid)
            // Resolve actual vessel_id (vid might be quotation_vessels junction ID or actual vessel ID)
            const actualVesselId = vessel?.vesselId || vid
            const policyNumber = typeCode + invertedYear + String(nextSerial).padStart(4, '0')
            const policyId = uuidv4()

            // Get payable premium: sum of instalments (most accurate) or vessel premium or quotation premium
            const instalmentSum = options.instalments.reduce((sum, inst) => sum + (inst.premiumAmount || 0), 0)
            const premiumAmount = instalmentSum > 0 ? instalmentSum : (vessel?.premiumAmount || quotation.premiumAmount || 0)

            await this.pool.execute(`
                INSERT INTO policy_documents (id, quotation_id, vessel_id, policy_number, status,
                    revision_number, inception_date, inception_time, expiry_date, expiry_time,
                    timezone, commission_percent, show_addresses, bank_id, pro_rata,
                    per_annum_premium, premium_amount, selected_alternative_id, created_by, exchange_rate)
                VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NULL, ?, ?, ?, ?)
            `, [policyId, quotationId, actualVesselId, policyNumber,
                options.inceptionDate, options.inceptionTime, options.expiryDate, options.expiryTime,
                options.timezone, options.commissionPercent, options.showAddresses, options.bankId,
                premiumAmount, options.selectedAlternativeId || null, options.createdBy, options.exchangeRate || 1])

            // Create instalments
            for (let i = 0; i < options.instalments.length; i++) {
                const inst = options.instalments[i]
                await this.pool.execute(`
                    INSERT INTO policy_doc_instalments (id, policy_doc_id, instalment_number,
                        due_date, premium_amount, commission_amount, is_non_refundable)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [uuidv4(), policyId, i + 1, inst.dueDate, inst.premiumAmount,
                    inst.commissionAmount, inst.isNonRefundable])
            }

            // Create addresses from vessel assureds
            const [assureds] = await this.pool.query(`
                SELECT va.entity_id, va.role, e.name as entityName,
                    COALESCE(ea.address_line1, '') as addressText
                FROM vessel_assureds va
                JOIN entities e ON va.entity_id = e.id
                LEFT JOIN entity_addresses ea ON va.address_id = ea.id
                WHERE va.vessel_id = ?
                ORDER BY va.id
            `, [actualVesselId])
            for (const assured of assureds as any[]) {
                await this.pool.execute(`
                    INSERT INTO policy_doc_addresses (id, policy_doc_id, entity_id, role, address_text)
                    VALUES (?, ?, ?, ?, ?)
                `, [uuidv4(), policyId, assured.entity_id, assured.role, assured.addressText || ''])
            }

            // Create blue cards (P&I only)
            if (options.blueCards.length > 0) {
                for (const cardType of options.blueCards) {
                    const cardNumber = policyNumber + '/' + cardType
                    await this.pool.execute(`
                        INSERT INTO policy_blue_cards (id, policy_doc_id, card_type, card_number,
                            inception_date, expiry_date, revision_number, issued_date)
                        VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_DATE)
                    `, [uuidv4(), policyId, cardType, cardNumber,
                        options.inceptionDate, options.expiryDate])
                }
            }

            createdPolicies.push({ id: policyId, policyNumber, vesselId: actualVesselId })
            nextSerial++
        }

        // Auto-move quotation to "Converted" workflow step
        try {
            const [convertedSteps] = await this.pool.query(
                "SELECT id FROM quotation_workflow_steps WHERE LOWER(name) = 'converted' LIMIT 1"
            )
            const convertedStep = (convertedSteps as any[])[0]
            if (convertedStep) {
                await this.pool.execute(
                    'UPDATE quotations SET workflow_step_id = ? WHERE id = ?',
                    [convertedStep.id, quotationId]
                )
            }
        } catch { /* ignore if step doesn't exist */ }

        return createdPolicies
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
                    pt.name as policyTypeName, pt.id as policyTypeId, vdp.policy_number as policyNumber,
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

    // --- Renewal Pipeline ---
    async getRenewalPipeline(dateFrom: string, dateTo: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT vdp.id, vdp.vessel_id as vesselId, v.name as vesselName, v.imo_number as imoNumber,
                    pt.name as policyTypeName, pt.id as policyTypeId,
                    vdp.policy_number as policyNumber,
                    vdp.status, vdp.renewal_status_id as renewalStatusId,
                    rst.name as renewalStatusName, rst.color as renewalStatusColor,
                    vpv.value_date as endDate,
                    e.name as customerName, v.customer_type as customerType,
                    f.name as fleetName,
                    vdp.currency as currency,
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
             WHERE v.is_active = TRUE AND vdp.status = 'active'
               AND ptc.field_type = 'date'
               AND LOWER(ptc.name) LIKE '%end%'
               AND vpv.value_date IS NOT NULL
               AND vpv.value_date >= ?
               AND vpv.value_date <= ?
             ORDER BY vpv.value_date ASC, v.name ASC`,
            [dateFrom, dateTo]
        )
        return rows as any[]
    }

    // --- Policy Renewal Notes ---
    async getPolicyRenewalNotes(policyId: string, _policyNumber?: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, policy_id as policyId, policy_number as policyNumber, note, created_by_user_id as createdByUserId, created_by_username as createdByUsername, created_at as createdAt FROM policy_renewal_notes WHERE policy_id = ? ORDER BY created_at ASC',
            [policyId]
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
            'SELECT id, vessel_id as vesselId, note, created_by_user_id as createdByUserId, created_by_username as createdByUsername, created_at as createdAt, parent_note_id as parentNoteId FROM vessel_notes WHERE vessel_id = ? ORDER BY created_at ASC',
            [vesselId]
        )
        return rows as any[]
    }

    async addVesselNote(vesselId: string, note: string, userId: string, username: string, parentNoteId?: string): Promise<any> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        const now = new Date()
        await this.pool.execute(
            'INSERT INTO vessel_notes (id, vessel_id, note, created_by_user_id, created_by_username, created_at, parent_note_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, vesselId, note.trim(), userId, username, now, parentNoteId || null]
        )
        return { id, vesselId, note: note.trim(), createdByUserId: userId, createdByUsername: username, createdAt: now.toISOString(), parentNoteId: parentNoteId || null }
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

    // --- File Path Remap ---

    async getVesselFilePaths(vesselId: string): Promise<any[]> {
        if (!this.pool) return []
        const [docRows] = await this.pool.query(
            `SELECT vd.id, 'document' as source, vd.file_path as filePath,
                    COALESCE(dt.name, vcd.name, 'Custom') as label
             FROM vessel_documents vd
             LEFT JOIN document_types dt ON dt.id = vd.document_type_id
             LEFT JOIN vessel_custom_doc_types vcd ON vcd.id = vd.document_type_id
             WHERE vd.vessel_id = ? AND vd.file_path IS NOT NULL AND vd.file_path != ''
             ORDER BY dt.name, vcd.name`,
            [vesselId]
        )
        const [attRows] = await this.pool.query(
            `SELECT sa.id, 'attachment' as source, sa.file_path as filePath,
                    CONCAT('Survey ', DATE_FORMAT(cs.survey_date, '%Y-%m-%d'), ' – ', sa.file_name) as label
             FROM survey_attachments sa
             JOIN condition_surveys cs ON cs.id = sa.survey_id
             WHERE cs.vessel_id = ? AND sa.file_path IS NOT NULL AND sa.file_path != ''
             ORDER BY cs.survey_date DESC, sa.file_name`,
            [vesselId]
        )
        return [...(docRows as any[]), ...(attRows as any[])]
    }

    async remapVesselFilePaths(remaps: { source: string; id: string; newPath: string }[]): Promise<void> {
        if (!this.pool || remaps.length === 0) return
        for (const remap of remaps) {
            if (remap.source === 'document') {
                await this.pool.execute('UPDATE vessel_documents SET file_path = ? WHERE id = ?', [remap.newPath, remap.id])
            } else if (remap.source === 'attachment') {
                await this.pool.execute('UPDATE survey_attachments SET file_path = ? WHERE id = ?', [remap.newPath, remap.id])
            }
        }
    }

    // --- War Breach Records ---

    async saveWarBreachRecord(record: {
        coverNoteNo: string
        currency: string
        breachDetails: string
        baseDays: number
        settingsJson: string
        vesselsJson: string
        totalNetDue: number
    }): Promise<{ id: string }> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO war_breach_records (id, cover_note_no, currency, breach_details, base_days, settings_json, vessels_json, total_net_due)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, record.coverNoteNo || null, record.currency || null, record.breachDetails || null,
             record.baseDays, record.settingsJson, record.vesselsJson, record.totalNetDue]
        )
        return { id }
    }

    async getWarBreachRecords(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, cover_note_no AS coverNoteNo, currency, breach_details AS breachDetails,
                    base_days AS baseDays, settings_json AS settingsJson, vessels_json AS vesselsJson,
                    total_net_due AS totalNetDue, created_at AS createdAt
             FROM war_breach_records ORDER BY created_at DESC`
        )
        return rows as any[]
    }

    async deleteWarBreachRecord(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM war_breach_records WHERE id = ?', [id])
    }

    // ==================== Hull Agreed Value Texts ====================

    async getHullAgreedValueTexts(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text, default_selected as defaultSelected, section, order_index as `order` FROM hull_agreed_value_texts ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, defaultSelected: Boolean(r.defaultSelected), section: r.section || 'hm' }))
    }

    async addHullAgreedValueText(text: string, defaultSelected: boolean, section?: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const sec = section || 'hm'
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM hull_agreed_value_texts')
        const order = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO hull_agreed_value_texts (id, text, default_selected, section, order_index) VALUES (?, ?, ?, ?, ?)', [id, text, defaultSelected, sec, order])
        return { id, text, defaultSelected, section: sec, order }
    }

    async updateHullAgreedValueText(id: string, updates: { text?: string; defaultSelected?: boolean; section?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.defaultSelected !== undefined) { fields.push('default_selected = ?'); values.push(updates.defaultSelected) }
        if (updates.section !== undefined) { fields.push('section = ?'); values.push(updates.section) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE hull_agreed_value_texts SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteHullAgreedValueText(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM hull_agreed_value_texts WHERE id = ?', [id])
    }

    async reorderHullAgreedValueTexts(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE hull_agreed_value_texts SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Hull Clauses ====================

    async getHullClauses(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, code, description, condition_section as conditionSection, order_index as `order` FROM hull_clauses ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, conditionSection: r.conditionSection || 'hm' }))
    }

    async addHullClause(name: string, code: string, description?: string, conditionSection?: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const sec = conditionSection || 'hm'
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM hull_clauses')
        const order = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO hull_clauses (id, name, code, description, condition_section, order_index) VALUES (?, ?, ?, ?, ?, ?)', [id, name, code, description || null, sec, order])
        return { id, name, code, description, conditionSection: sec, order }
    }

    async updateHullClause(id: string, updates: { name?: string; code?: string; description?: string; conditionSection?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.code !== undefined) { fields.push('code = ?'); values.push(updates.code) }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
        if (updates.conditionSection !== undefined) { fields.push('condition_section = ?'); values.push(updates.conditionSection) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE hull_clauses SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteHullClause(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM hull_clauses WHERE id = ?', [id])
    }

    async reorderHullClauses(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE hull_clauses SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Hull Clause Conditions ====================

    async getHullClauseConditions(hullClauseId?: string): Promise<any[]> {
        if (!this.pool) return []
        if (hullClauseId) {
            const [rows] = await this.pool.query('SELECT id, hull_clause_id as hullClauseId, condition_number as conditionNumber, text, default_selected as defaultSelected, condition_section as conditionSection, has_amount as hasAmount, amount_placeholder as amountPlaceholder, order_index as `order` FROM hull_clause_conditions WHERE hull_clause_id = ? ORDER BY order_index ASC', [hullClauseId])
            return (rows as any[]).map(r => ({ ...r, defaultSelected: Boolean(r.defaultSelected), hasAmount: Boolean(r.hasAmount), conditionSection: r.conditionSection || 'both' }))
        }
        const [rows] = await this.pool.query('SELECT id, hull_clause_id as hullClauseId, condition_number as conditionNumber, text, default_selected as defaultSelected, condition_section as conditionSection, has_amount as hasAmount, amount_placeholder as amountPlaceholder, order_index as `order` FROM hull_clause_conditions ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, defaultSelected: Boolean(r.defaultSelected), hasAmount: Boolean(r.hasAmount), conditionSection: r.conditionSection || 'both' }))
    }

    async addHullClauseCondition(hullClauseId: string, conditionNumber: string, text: string, defaultSelected: boolean, conditionSection: string = 'both', hasAmount: boolean = false, amountPlaceholder?: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM hull_clause_conditions WHERE hull_clause_id = ?', [hullClauseId])
        const order = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO hull_clause_conditions (id, hull_clause_id, condition_number, text, default_selected, condition_section, has_amount, amount_placeholder, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, hullClauseId, conditionNumber, text, defaultSelected, conditionSection, hasAmount, amountPlaceholder || null, order])
        return { id, hullClauseId, conditionNumber, text, defaultSelected, conditionSection, hasAmount, amountPlaceholder, order }
    }

    async updateHullClauseCondition(id: string, updates: { conditionNumber?: string; text?: string; defaultSelected?: boolean; conditionSection?: string; hasAmount?: boolean; amountPlaceholder?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.conditionNumber !== undefined) { fields.push('condition_number = ?'); values.push(updates.conditionNumber) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.defaultSelected !== undefined) { fields.push('default_selected = ?'); values.push(updates.defaultSelected) }
        if (updates.conditionSection !== undefined) { fields.push('condition_section = ?'); values.push(updates.conditionSection) }
        if (updates.hasAmount !== undefined) { fields.push('has_amount = ?'); values.push(updates.hasAmount) }
        if (updates.amountPlaceholder !== undefined) { fields.push('amount_placeholder = ?'); values.push(updates.amountPlaceholder || null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE hull_clause_conditions SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteHullClauseCondition(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM hull_clause_conditions WHERE id = ?', [id])
    }

    async reorderHullClauseConditions(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE hull_clause_conditions SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Hull Additional Conditions ====================

    async getHullAdditionalConditions(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, title, text, default_selected as defaultSelected, order_index as `order`, has_amount as hasAmount, amount_placeholder as amountPlaceholder FROM hull_additional_conditions ORDER BY order_index ASC')
        const [links] = await this.pool.query('SELECT additional_condition_id, hull_clause_id FROM hull_additional_condition_clauses')
        const linkMap: Record<string, string[]> = {}
        for (const l of links as any[]) {
            if (!linkMap[l.additional_condition_id]) linkMap[l.additional_condition_id] = []
            linkMap[l.additional_condition_id].push(l.hull_clause_id)
        }
        return (rows as any[]).map(r => ({ ...r, defaultSelected: Boolean(r.defaultSelected), hasAmount: Boolean(r.hasAmount), hullClauseIds: linkMap[r.id] || [] }))
    }

    async addHullAdditionalCondition(title: string | null, text: string, defaultSelected: boolean, hullClauseIds?: string[], hasAmount?: boolean, amountPlaceholder?: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM hull_additional_conditions')
        const order = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO hull_additional_conditions (id, title, text, default_selected, order_index, has_amount, amount_placeholder) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, title || null, text, defaultSelected, order, hasAmount || false, amountPlaceholder || null])
        if (hullClauseIds && hullClauseIds.length > 0) {
            for (const cid of hullClauseIds) {
                await this.pool.execute('INSERT INTO hull_additional_condition_clauses (additional_condition_id, hull_clause_id) VALUES (?, ?)', [id, cid])
            }
        }
        return { id, title: title || undefined, text, defaultSelected, order, hullClauseIds: hullClauseIds || [], hasAmount: hasAmount || false, amountPlaceholder: amountPlaceholder || undefined }
    }

    async updateHullAdditionalCondition(id: string, updates: { title?: string | null; text?: string; defaultSelected?: boolean; hullClauseIds?: string[]; hasAmount?: boolean; amountPlaceholder?: string }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title || null) }
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.defaultSelected !== undefined) { fields.push('default_selected = ?'); values.push(updates.defaultSelected) }
        if (updates.hasAmount !== undefined) { fields.push('has_amount = ?'); values.push(updates.hasAmount) }
        if (updates.amountPlaceholder !== undefined) { fields.push('amount_placeholder = ?'); values.push(updates.amountPlaceholder || null) }
        if (fields.length > 0) {
            values.push(id)
            await this.pool.execute(`UPDATE hull_additional_conditions SET ${fields.join(', ')} WHERE id = ?`, values)
        }
        if (updates.hullClauseIds !== undefined) {
            await this.pool.execute('DELETE FROM hull_additional_condition_clauses WHERE additional_condition_id = ?', [id])
            for (const cid of updates.hullClauseIds) {
                await this.pool.execute('INSERT INTO hull_additional_condition_clauses (additional_condition_id, hull_clause_id) VALUES (?, ?)', [id, cid])
            }
        }
    }

    async deleteHullAdditionalCondition(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM hull_additional_condition_clauses WHERE additional_condition_id = ?', [id])
        await this.pool.execute('DELETE FROM hull_additional_conditions WHERE id = ?', [id])
    }

    async reorderHullAdditionalConditions(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE hull_additional_conditions SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Quotation Agreed Value Items ====================

    async getQuotationAgreedValueItems(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, hull_text_id as hullTextId, text, section, order_index as `order`, vessel_scope as vesselScope FROM quotation_agreed_value_items WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, section: r.section || 'hm', vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null }))
    }

    async setQuotationAgreedValueItems(quotationId: string, items: { hullTextId?: string; text: string; section?: string; vesselScope?: string[] | null }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM quotation_agreed_value_items WHERE quotation_id = ?', [quotationId])
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                await this.pool.execute(
                    'INSERT INTO quotation_agreed_value_items (id, quotation_id, hull_text_id, text, section, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), quotationId, item.hullTextId || null, item.text, item.section || 'hm', i, item.vesselScope ? JSON.stringify(item.vesselScope) : null]
                )
            }
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    // ==================== Quotation Hull Alternatives ====================

    async getQuotationHullAlternatives(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, quotation_id as quotationId, hull_clause_id as hullClauseId, label, premium_amount as premiumAmount, order_index as `order` FROM quotation_hull_alternatives WHERE quotation_id = ? ORDER BY order_index ASC',
            [quotationId]
        )
        return (rows as any[]).map(r => ({ ...r, premiumAmount: r.premiumAmount ? Number(r.premiumAmount) : undefined }))
    }

    async addQuotationHullAlternative(quotationId: string, hullClauseId: string, label?: string): Promise<any> {
        if (!this.pool) return null
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM quotation_hull_alternatives WHERE quotation_id = ?', [quotationId])
        const order = (maxRow as any[])[0].nextOrder
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute(
                'INSERT INTO quotation_hull_alternatives (id, quotation_id, hull_clause_id, label, order_index) VALUES (?, ?, ?, ?, ?)',
                [id, quotationId, hullClauseId, label || null, order]
            )
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, quotationId, hullClauseId, label: label || undefined, premiumAmount: undefined, order }
    }

    async updateQuotationHullAlternative(id: string, updates: { hullClauseId?: string; label?: string; premiumAmount?: number | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.hullClauseId !== undefined) { fields.push('hull_clause_id = ?'); values.push(updates.hullClauseId) }
        if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label || null) }
        if (updates.premiumAmount !== undefined) { fields.push('premium_amount = ?'); values.push(updates.premiumAmount ?? null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_hull_alternatives SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationHullAlternative(id: string): Promise<void> {
        if (!this.pool) return
        // Also clean up conditions and additional conditions linked to this alternative
        await this.pool.execute('DELETE FROM quotation_hull_conditions WHERE alternative_id = ?', [id])
        await this.pool.execute('DELETE FROM quotation_hull_additional_conditions WHERE alternative_id = ?', [id])
        await this.pool.execute('DELETE FROM quotation_hull_alternatives WHERE id = ?', [id])
    }

    async reorderQuotationHullAlternatives(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_hull_alternatives SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Quotation P&I Alternatives ====================

    async getQuotationPIAlternatives(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT id, quotation_id as quotationId, label, premium_amount as premiumAmount, order_index as `order` FROM quotation_pi_alternatives WHERE quotation_id = ? ORDER BY order_index ASC',
            [quotationId]
        )
        return (rows as any[]).map(r => ({ ...r, premiumAmount: r.premiumAmount ? Number(r.premiumAmount) : undefined }))
    }

    async addQuotationPIAlternative(quotationId: string, label?: string): Promise<any> {
        if (!this.pool) return null
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM quotation_pi_alternatives WHERE quotation_id = ?', [quotationId])
        const order = (maxRow as any[])[0].nextOrder
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute(
                'INSERT INTO quotation_pi_alternatives (id, quotation_id, label, order_index) VALUES (?, ?, ?, ?)',
                [id, quotationId, label || null, order]
            )
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, quotationId, label: label || undefined, premiumAmount: undefined, order }
    }

    async updateQuotationPIAlternative(id: string, updates: { label?: string; premiumAmount?: number | null }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label || null) }
        if (updates.premiumAmount !== undefined) { fields.push('premium_amount = ?'); values.push(updates.premiumAmount ?? null) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_pi_alternatives SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationPIAlternative(id: string): Promise<void> {
        if (!this.pool) return
        // Clean up alternative_id references on P&I junction tables
        const piAltTables = ['quotation_clauses', 'quotation_additional_clauses', 'quotation_warranties', 'quotation_custom_warranties', 'quotation_deductibles', 'quotation_text_deductibles', 'quotation_exclusions', 'quotation_custom_exclusions']
        for (const tbl of piAltTables) {
            await this.pool.execute(`DELETE FROM ${tbl} WHERE alternative_id = ?`, [id])
        }
        await this.pool.execute('DELETE FROM quotation_pi_alternatives WHERE id = ?', [id])
    }

    async reorderQuotationPIAlternatives(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_pi_alternatives SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    async updateQuotationItemAlternativeId(table: string, id: string, alternativeId: string | null): Promise<void> {
        if (!this.pool) return
        const allowedTables = ['quotation_clauses', 'quotation_additional_clauses', 'quotation_warranties', 'quotation_custom_warranties', 'quotation_deductibles', 'quotation_text_deductibles', 'quotation_exclusions', 'quotation_custom_exclusions']
        if (!allowedTables.includes(table)) throw new Error('Invalid table')
        await this.pool.execute(`UPDATE ${table} SET alternative_id = ? WHERE id = ?`, [alternativeId, id])
    }

    // ==================== Quotation Hull Conditions ====================

    async getQuotationHullConditions(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, hull_condition_id as hullConditionId, text_override as textOverride, condition_section as conditionSection, amount, order_index as `order`, vessel_scope as vesselScope, alternative_id as alternativeId FROM quotation_hull_conditions WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, amount: r.amount ? Number(r.amount) : undefined, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, conditionSection: r.conditionSection || 'both', alternativeId: r.alternativeId || null }))
    }

    async setQuotationHullConditions(quotationId: string, items: { hullConditionId: string; textOverride?: string; conditionSection?: string; amount?: number; vesselScope?: string[] | null; alternativeId?: string | null }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM quotation_hull_conditions WHERE quotation_id = ?', [quotationId])
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                await this.pool.execute(
                    'INSERT INTO quotation_hull_conditions (id, quotation_id, hull_condition_id, text_override, condition_section, amount, order_index, vessel_scope, alternative_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), quotationId, item.hullConditionId, item.textOverride || null, item.conditionSection || 'both', item.amount ?? null, i, item.vesselScope ? JSON.stringify(item.vesselScope) : null, item.alternativeId || null]
                )
            }
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    // ==================== Quotation Hull Additional Conditions ====================

    async getQuotationHullAdditionalConditions(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, hull_additional_condition_id as hullAdditionalConditionId, text_override as textOverride, order_index as `order`, vessel_scope as vesselScope, alternative_id as alternativeId, amount FROM quotation_hull_additional_conditions WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null, alternativeId: r.alternativeId || null, amount: r.amount != null ? Number(r.amount) : null }))
    }

    async setQuotationHullAdditionalConditions(quotationId: string, items: { hullAdditionalConditionId: string; textOverride?: string; vesselScope?: string[] | null; alternativeId?: string | null; amount?: number | null }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM quotation_hull_additional_conditions WHERE quotation_id = ?', [quotationId])
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                await this.pool.execute(
                    'INSERT INTO quotation_hull_additional_conditions (id, quotation_id, hull_additional_condition_id, text_override, order_index, vessel_scope, alternative_id, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), quotationId, item.hullAdditionalConditionId, item.textOverride || null, i, item.vesselScope ? JSON.stringify(item.vesselScope) : null, item.alternativeId || null, item.amount != null ? item.amount : null]
                )
            }
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    // ==================== War Risk Conditions ====================

    async getWarConditions(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, text, default_selected as defaultSelected, order_index as `order` FROM war_conditions ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, defaultSelected: Boolean(r.defaultSelected) }))
    }

    async addWarCondition(text: string, defaultSelected: boolean): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM war_conditions')
        const order = (maxRow as any[])[0]?.nextOrder || 0
        await this.pool.execute('INSERT INTO war_conditions (id, text, default_selected, order_index) VALUES (?, ?, ?, ?)', [id, text, defaultSelected, order])
        return { id, text, defaultSelected, order }
    }

    async updateWarCondition(id: string, updates: { text?: string; defaultSelected?: boolean }): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.text !== undefined) { fields.push('text = ?'); values.push(updates.text) }
        if (updates.defaultSelected !== undefined) { fields.push('default_selected = ?'); values.push(updates.defaultSelected) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE war_conditions SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteWarCondition(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM war_conditions WHERE id = ?', [id])
    }

    async reorderWarConditions(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE war_conditions SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // ==================== Quotation War Conditions ====================

    async getQuotationWarConditions(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, quotation_id as quotationId, war_condition_id as warConditionId, text_override as textOverride, order_index as `order`, vessel_scope as vesselScope FROM quotation_war_conditions WHERE quotation_id = ? ORDER BY order_index ASC', [quotationId])
        return (rows as any[]).map(r => ({ ...r, vesselScope: r.vesselScope ? JSON.parse(r.vesselScope) : null }))
    }

    async setQuotationWarConditions(quotationId: string, items: { warConditionId: string; textOverride?: string; vesselScope?: string[] | null }[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute('DELETE FROM quotation_war_conditions WHERE quotation_id = ?', [quotationId])
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                await this.pool.execute(
                    'INSERT INTO quotation_war_conditions (id, quotation_id, war_condition_id, text_override, order_index, vessel_scope) VALUES (?, ?, ?, ?, ?, ?)',
                    [uuidv4(), quotationId, item.warConditionId, item.textOverride || null, i, item.vesselScope ? JSON.stringify(item.vesselScope) : null]
                )
            }
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    // ==================== War Risk Settings ====================

    async getWarSettings(): Promise<any> {
        if (!this.pool) return { jwlaCode: 'JWLA032', jwlaDate: 'December 18, 2023', tcText: 'Al-Bahriah Hull War Terms & Conditions 01 January 2025', tradingWarrantyText: 'Worldwide, subject to JWC Hull War, Piracy, Terrorism and Related Perils Listed Areas {jwla_date} {jwla_code}.' }
        const [rows] = await this.pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'war_settings'")
        const arr = rows as any[]
        if (arr.length > 0) return JSON.parse(arr[0].setting_value)
        return { jwlaCode: 'JWLA032', jwlaDate: 'December 18, 2023', tcText: 'Al-Bahriah Hull War Terms & Conditions 01 January 2025', tradingWarrantyText: 'Worldwide, subject to JWC Hull War, Piracy, Terrorism and Related Perils Listed Areas {jwla_date} {jwla_code}.' }
    }

    async setWarSettings(settings: any): Promise<void> {
        if (!this.pool) return
        const json = JSON.stringify(settings)
        await this.pool.execute("INSERT INTO app_settings (setting_key, setting_value) VALUES ('war_settings', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [json, json])
    }

    // ==================== Analytics Presets ====================

    async getAnalyticsPresets(userId: string): Promise<AnalyticsPreset[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.execute(
            'SELECT id, user_id AS userId, name, filters, created_at AS createdAt FROM analytics_presets WHERE user_id = ? ORDER BY name',
            [userId]
        )
        return (rows as any[]).map(r => ({
            ...r,
            filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters
        }))
    }

    async addAnalyticsPreset(preset: { userId: string; name: string; filters: AnalyticsFilters }): Promise<AnalyticsPreset> {
        if (!this.pool) throw new Error('No DB')
        const id = uuidv4()
        await this.pool.execute('SET FOREIGN_KEY_CHECKS=0')
        try {
            await this.pool.execute(
                'INSERT INTO analytics_presets (id, user_id, name, filters) VALUES (?, ?, ?, ?)',
                [id, preset.userId, preset.name, JSON.stringify(preset.filters)]
            )
        } finally {
            await this.pool.execute('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, userId: preset.userId, name: preset.name, filters: preset.filters }
    }

    async updateAnalyticsPreset(id: string, name: string, filters: AnalyticsFilters): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE analytics_presets SET name = ?, filters = ? WHERE id = ?',
            [name, JSON.stringify(filters), id]
        )
    }

    async deleteAnalyticsPreset(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM analytics_presets WHERE id = ?', [id])
    }

    // ==================== Analytics Query ====================

    async getAnalyticsData(filters: AnalyticsFilters): Promise<any> {
        if (!this.pool) return {}
        // Build WHERE conditions
        const conditions: string[] = []
        const params: any[] = []

        if (filters.activeOnly) conditions.push('v.is_active = TRUE')
        if (filters.ageMin != null) conditions.push(`v.built_year <= ?`) , params.push(new Date().getFullYear() - filters.ageMin)
        if (filters.ageMax != null) conditions.push(`v.built_year >= ?`), params.push(new Date().getFullYear() - filters.ageMax)
        if (filters.tonnageMin != null) conditions.push('v.gross_tonnage >= ?'), params.push(filters.tonnageMin)
        if (filters.tonnageMax != null) conditions.push('v.gross_tonnage <= ?'), params.push(filters.tonnageMax)
        if (filters.fleetIds?.length) {
            conditions.push(`v.fleet_id IN (${filters.fleetIds.map(() => '?').join(',')})`)
            params.push(...filters.fleetIds)
        }
        if (filters.customerIds?.length) {
            conditions.push(`v.customer_id IN (${filters.customerIds.map(() => '?').join(',')})`)
            params.push(...filters.customerIds)
        }
        if (filters.flagStateIds?.length) {
            conditions.push(`v.flag_state_id IN (${filters.flagStateIds.map(() => '?').join(',')})`)
            params.push(...filters.flagStateIds)
        }
        if (filters.vesselTypeIds?.length) {
            conditions.push(`v.vessel_type IN (${filters.vesselTypeIds.map(() => '?').join(',')})`)
            params.push(...filters.vesselTypeIds)
        }
        if (filters.policyTypeIds?.length) {
            conditions.push(`v.id IN (SELECT DISTINCT vdp.vessel_id FROM vessel_dynamic_policies vdp WHERE vdp.policy_type_id IN (${filters.policyTypeIds.map(() => '?').join(',')}) AND vdp.status = 'active')`)
            params.push(...filters.policyTypeIds)
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

        // Main vessel query
        const [vessels] = await this.pool.execute(
            `SELECT v.id, v.name, v.imo_number AS imoNumber, v.fleet_id AS fleetId, v.flag_state_id AS flagStateId,
                    v.built_year AS builtYear, v.gross_tonnage AS grossTonnage, v.vessel_type AS vesselType,
                    v.is_active AS isActive, v.customer_id AS customerId, v.customer_type AS customerType,
                    v.ofac_status AS ofacStatus, v.classification_society AS classificationSociety
             FROM vessels v ${where}`,
            params
        )

        const vList = vessels as any[]
        const vesselIds = vList.map(v => v.id)

        // Policy coverage for filtered vessels
        let policyCoverage: any[] = []
        if (vesselIds.length > 0) {
            const [pRows] = await this.pool.execute(
                `SELECT pt.name, COUNT(DISTINCT vdp.vessel_id) AS vesselCount
                 FROM vessel_dynamic_policies vdp
                 JOIN policy_types pt ON vdp.policy_type_id = pt.id
                 WHERE vdp.status = 'active' AND vdp.vessel_id IN (${vesselIds.map(() => '?').join(',')})
                 GROUP BY pt.id, pt.name ORDER BY vesselCount DESC`,
                vesselIds
            )
            policyCoverage = pRows as any[]
        }

        return { vessels: vList, policyCoverage }
    }

    async backupDatabase(): Promise<{ tables: Record<string, any[]>; exportedAt: string; version: string }> {
        if (!this.pool) throw new Error('Not connected')

        const [tableRows] = await this.pool.query('SHOW TABLES') as any[]
        const dbKey = Object.keys(tableRows[0])[0]
        const tableNames: string[] = tableRows.map((r: any) => r[dbKey])

        const tables: Record<string, any[]> = {}
        for (const table of tableNames) {
            // Skip users table to avoid locking out on restore
            if (table === 'users') continue
            const [rows] = await this.pool.query(`SELECT * FROM \`${table}\``)
            tables[table] = rows as any[]
        }

        return {
            tables,
            exportedAt: new Date().toISOString(),
            version: '1'
        }
    }

    async restoreDatabase(data: { tables: Record<string, any[]> }): Promise<void> {
        if (!this.pool) throw new Error('Not connected')

        const conn = await this.pool.getConnection()
        try {
            await conn.query('SET FOREIGN_KEY_CHECKS = 0')

            for (const [table, rows] of Object.entries(data.tables)) {
                // Skip users table to avoid locking out
                if (table === 'users') continue
                await conn.query(`TRUNCATE TABLE \`${table}\``)

                if (rows.length === 0) continue

                // Insert in batches of 100
                for (let i = 0; i < rows.length; i += 100) {
                    const batch = rows.slice(i, i + 100)
                    const columns = Object.keys(batch[0])
                    const placeholders = batch
                        .map(() => `(${columns.map(() => '?').join(',')})`)
                        .join(',')
                    const values = batch.flatMap(row => columns.map(col => row[col]))
                    await conn.query(
                        `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(',')}) VALUES ${placeholders}`,
                        values
                    )
                }
            }

            await conn.query('SET FOREIGN_KEY_CHECKS = 1')
        } finally {
            conn.release()
        }
    }

    // --- Activity Log ---

    async getActivityLog(filters: {
        page?: number
        limit?: number
        module?: string
        action?: string
        userId?: string
        dateFrom?: string
        dateTo?: string
        search?: string
    }): Promise<PaginatedResult<any>> {
        if (!this.pool) return { data: [], total: 0, page: 1, limit: 25, totalPages: 0 }

        const { page = 1, limit = 25, module, action, userId, dateFrom, dateTo, search } = filters
        const offset = (page - 1) * limit

        let query = 'SELECT id, user_id AS userId, username, action, module, entity_type AS entityType, entity_id AS entityId, entity_name AS entityName, details, created_at AS createdAt FROM activity_log'
        let countQuery = 'SELECT COUNT(*) as total FROM activity_log'
        const conditions: string[] = []
        const values: any[] = []

        if (module) {
            conditions.push('module = ?')
            values.push(module)
        }
        if (action) {
            conditions.push('action = ?')
            values.push(action)
        }
        if (userId) {
            conditions.push('user_id = ?')
            values.push(userId)
        }
        if (dateFrom) {
            conditions.push('created_at >= ?')
            values.push(dateFrom)
        }
        if (dateTo) {
            conditions.push('created_at <= ?')
            values.push(dateTo + ' 23:59:59')
        }
        if (search) {
            conditions.push('(entity_name LIKE ? OR details LIKE ? OR username LIKE ?)')
            values.push(`%${search}%`, `%${search}%`, `%${search}%`)
        }

        if (conditions.length > 0) {
            const where = ' WHERE ' + conditions.join(' AND ')
            query += where
            countQuery += where
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'

        const countValues = [...values]
        values.push(limit, offset)

        const [countResult] = await this.pool.query(countQuery, countValues)
        const total = (countResult as any[])[0].total
        const totalPages = Math.ceil(total / limit)

        const [rows] = await this.pool.query(query, values)

        return { data: rows as any[], total, page, limit, totalPages }
    }

    async logActivity(entry: {
        userId: string
        username: string
        action: string
        module: string
        entityType?: string
        entityId?: string
        entityName?: string
        details?: string
    }): Promise<void> {
        if (!this.pool) return
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO activity_log (id, user_id, username, action, module, entity_type, entity_id, entity_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, entry.userId, entry.username, entry.action, entry.module, entry.entityType || null, entry.entityId || null, entry.entityName || null, entry.details || null]
        )
    }

    // --- Email Templates ---
    async getEmailTemplates(category?: string): Promise<import('../../shared/types').EmailTemplate[]> {
        if (!this.pool) return []
        let sql = 'SELECT id, name, subject, body, category, is_system AS isSystem, created_by AS createdBy, order_index AS `order` FROM email_templates'
        const params: any[] = []
        if (category) {
            sql += ' WHERE category = ?'
            params.push(category)
        }
        sql += ' ORDER BY order_index ASC, created_at ASC'
        const [rows] = await this.pool.query(sql, params)
        return (rows as any[]).map(r => ({ ...r, isSystem: !!r.isSystem }))
    }

    async addEmailTemplate(template: { name: string; subject?: string | null; body: string; category: string; isSystem?: boolean; createdBy?: string | null }): Promise<import('../../shared/types').EmailTemplate> {
        if (!this.pool) throw new Error('Not connected')
        const id = uuidv4()
        const [countRows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM email_templates')
        const orderIndex = (countRows as any[])[0].cnt
        await this.pool.execute(
            'INSERT INTO email_templates (id, name, subject, body, category, is_system, created_by, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, template.name, template.subject || null, template.body, template.category || 'general', template.isSystem ? 1 : 0, template.createdBy || null, orderIndex]
        )
        return { id, name: template.name, subject: template.subject || null, body: template.body, category: template.category || 'general', isSystem: !!template.isSystem, createdBy: template.createdBy || null, order: orderIndex }
    }

    async updateEmailTemplate(id: string, updates: Partial<{ name: string; subject: string | null; body: string; category: string }>): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
        if (updates.subject !== undefined) { fields.push('subject = ?'); values.push(updates.subject) }
        if (updates.body !== undefined) { fields.push('body = ?'); values.push(updates.body) }
        if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE email_templates SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteEmailTemplate(id: string): Promise<void> {
        if (!this.pool) return
        const [rows] = await this.pool.query('SELECT is_system FROM email_templates WHERE id = ?', [id])
        if ((rows as any[])[0]?.is_system) throw new Error('Cannot delete system templates')
        await this.pool.execute('DELETE FROM email_templates WHERE id = ?', [id])
    }

    async reorderEmailTemplates(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE email_templates SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    async getActivityLogDistinctModules(): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT DISTINCT module FROM activity_log ORDER BY module ASC')
        return (rows as any[]).map(r => r.module)
    }

    async getActivityLogDistinctActions(): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT DISTINCT action FROM activity_log ORDER BY action ASC')
        return (rows as any[]).map(r => r.action)
    }

    async getActivityLogDistinctUsers(): Promise<{ id: string; username: string }[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT DISTINCT al.user_id AS id, al.username FROM activity_log al ORDER BY al.username ASC')
        return rows as any[]
    }
    async getActivityLogRetention(): Promise<number> {
        const val = await this.getSetting('activity_log_retention_days')
        return val ? parseInt(val, 10) : 365
    }

    async setActivityLogRetention(days: number): Promise<void> {
        await this.setSetting('activity_log_retention_days', String(days))
    }

    async cleanupActivityLog(retentionDays: number): Promise<number> {
        if (!this.pool || retentionDays <= 0) return 0
        const [result] = await this.pool.execute(
            'DELETE FROM activity_log WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [retentionDays]
        )
        return (result as any).affectedRows || 0
    }

    async getActivityLogCount(): Promise<number> {
        if (!this.pool) return 0
        const [rows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM activity_log')
        return (rows as any[])[0]?.cnt || 0
    }

    // --- Workflow Steps ---
    async getWorkflowSteps(): Promise<import('../../shared/types').WorkflowStep[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT id, name, color, order_index AS `order`, can_edit AS canEdit, can_export AS canExport, is_lock_point AS isLockPoint, is_initial AS isInitial, created_at AS createdAt FROM quotation_workflow_steps ORDER BY order_index ASC')
        return (rows as any[]).map(r => ({ ...r, canEdit: Boolean(r.canEdit), canExport: Boolean(r.canExport), isLockPoint: Boolean(r.isLockPoint), isInitial: Boolean(r.isInitial) }))
    }

    async addWorkflowStep(step: { name: string; color: string; canEdit: boolean; canExport: boolean; isLockPoint: boolean; isInitial: boolean }): Promise<import('../../shared/types').WorkflowStep> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRows] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM quotation_workflow_steps')
        const order = (maxRows as any[])[0].nextOrder
        await this.pool.execute(
            'INSERT INTO quotation_workflow_steps (id, name, color, order_index, can_edit, can_export, is_lock_point, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, step.name, step.color, order, step.canEdit, step.canExport, step.isLockPoint, step.isInitial]
        )
        return { id, ...step, order }
    }

    async updateWorkflowStep(id: string, updates: Partial<{ name: string; color: string; canEdit: boolean; canExport: boolean; isLockPoint: boolean; isInitial: boolean }>): Promise<void> {
        if (!this.pool) return
        const sets: string[] = []
        const params: any[] = []
        if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name) }
        if (updates.color !== undefined) { sets.push('color = ?'); params.push(updates.color) }
        if (updates.canEdit !== undefined) { sets.push('can_edit = ?'); params.push(updates.canEdit) }
        if (updates.canExport !== undefined) { sets.push('can_export = ?'); params.push(updates.canExport) }
        if (updates.isLockPoint !== undefined) { sets.push('is_lock_point = ?'); params.push(updates.isLockPoint) }
        if (updates.isInitial !== undefined) { sets.push('is_initial = ?'); params.push(updates.isInitial) }
        if (sets.length === 0) return
        params.push(id)
        await this.pool.execute(`UPDATE quotation_workflow_steps SET ${sets.join(', ')} WHERE id = ?`, params)
    }

    async deleteWorkflowStep(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_workflow_transitions WHERE from_step_id = ? OR to_step_id = ?', [id, id])
        await this.pool.execute('DELETE FROM quotation_workflow_steps WHERE id = ?', [id])
    }

    async reorderWorkflowSteps(orderedIds: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < orderedIds.length; i++) {
            await this.pool.execute('UPDATE quotation_workflow_steps SET order_index = ? WHERE id = ?', [i, orderedIds[i]])
        }
    }

    // --- Workflow Transitions ---
    async getWorkflowTransitions(): Promise<import('../../shared/types').WorkflowTransition[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT t.id, t.from_step_id AS fromStepId, t.to_step_id AS toStepId,
                    t.permission_key AS permissionKey, t.auto_create_revision AS autoCreateRevision,
                    fs.name AS fromStepName, ts.name AS toStepName
             FROM quotation_workflow_transitions t
             LEFT JOIN quotation_workflow_steps fs ON t.from_step_id = fs.id
             LEFT JOIN quotation_workflow_steps ts ON t.to_step_id = ts.id
             ORDER BY fs.order_index, ts.order_index`
        )
        return (rows as any[]).map(r => ({ ...r, autoCreateRevision: Boolean(r.autoCreateRevision) }))
    }

    async addWorkflowTransition(t: { fromStepId: string; toStepId: string; permissionKey: string | null; autoCreateRevision: boolean }): Promise<import('../../shared/types').WorkflowTransition> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO quotation_workflow_transitions (id, from_step_id, to_step_id, permission_key, auto_create_revision) VALUES (?, ?, ?, ?, ?)',
            [id, t.fromStepId, t.toStepId, t.permissionKey, t.autoCreateRevision]
        )
        return { id, ...t }
    }

    async updateWorkflowTransition(id: string, updates: Partial<{ permissionKey: string | null; autoCreateRevision: boolean }>): Promise<void> {
        if (!this.pool) return
        const sets: string[] = []
        const params: any[] = []
        if (updates.permissionKey !== undefined) { sets.push('permission_key = ?'); params.push(updates.permissionKey) }
        if (updates.autoCreateRevision !== undefined) { sets.push('auto_create_revision = ?'); params.push(updates.autoCreateRevision) }
        if (sets.length === 0) return
        params.push(id)
        await this.pool.execute(`UPDATE quotation_workflow_transitions SET ${sets.join(', ')} WHERE id = ?`, params)
    }

    async deleteWorkflowTransition(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_workflow_transitions WHERE id = ?', [id])
    }

    // --- Quotation Workflow Actions ---
    async moveQuotationToStep(quotationId: string, toStepId: string, userId: string, username: string, comment?: string): Promise<void> {
        if (!this.pool) return
        const [qRows] = await this.pool.query('SELECT workflow_step_id FROM quotations WHERE id = ?', [quotationId])
        const fromStepId = (qRows as any[])[0]?.workflow_step_id || null
        const [stepRows] = await this.pool.query('SELECT is_lock_point FROM quotation_workflow_steps WHERE id = ?', [toStepId])
        const isLockPoint = Boolean((stepRows as any[])[0]?.is_lock_point)
        const updates: string[] = ['workflow_step_id = ?']
        const params: any[] = [toStepId]
        if (isLockPoint) { updates.push('is_locked = TRUE'); }
        params.push(quotationId)
        await this.pool.execute(`UPDATE quotations SET ${updates.join(', ')} WHERE id = ?`, params)
        // Log workflow action
        await this.pool.execute(
            'INSERT INTO quotation_workflow_log (id, quotation_id, from_step_id, to_step_id, user_id, username, comment) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), quotationId, fromStepId, toStepId, userId, username, comment || null]
        )
    }

    async getQuotationWorkflowLog(quotationId: string): Promise<import('../../shared/types').QuotationWorkflowLog[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT l.id, l.quotation_id AS quotationId, l.from_step_id AS fromStepId, l.to_step_id AS toStepId,
                    l.user_id AS userId, l.username, l.comment, l.created_at AS createdAt,
                    fs.name AS fromStepName, ts.name AS toStepName
             FROM quotation_workflow_log l
             LEFT JOIN quotation_workflow_steps fs ON l.from_step_id = fs.id
             LEFT JOIN quotation_workflow_steps ts ON l.to_step_id = ts.id
             WHERE l.quotation_id = ?
             ORDER BY l.created_at DESC`,
            [quotationId]
        )
        return rows as any[]
    }

    async getReachableSteps(currentStepId: string | null, userPermissions: string[]): Promise<import('../../shared/types').WorkflowStep[]> {
        if (!this.pool) return []
        if (!currentStepId) {
            // No current step — return the initial step
            const steps = await this.getWorkflowSteps()
            return steps.filter(s => s.isInitial)
        }
        const transitions = await this.getWorkflowTransitions()
        const steps = await this.getWorkflowSteps()
        const stepMap = new Map(steps.map(s => [s.id, s]))

        // BFS: find all steps reachable from currentStepId checking permissions at each hop
        const reachable = new Set<string>()
        const queue: string[] = [currentStepId]
        const visited = new Set<string>([currentStepId])

        while (queue.length > 0) {
            const fromId = queue.shift()!
            const outgoing = transitions.filter(t => t.fromStepId === fromId)
            for (const t of outgoing) {
                if (visited.has(t.toStepId)) continue
                // Check permission
                if (t.permissionKey && !userPermissions.includes(t.permissionKey)) continue
                visited.add(t.toStepId)
                reachable.add(t.toStepId)
                queue.push(t.toStepId)
            }
        }

        return Array.from(reachable).map(id => stepMap.get(id)!).filter(Boolean).sort((a, b) => a.order - b.order)
    }

    // ==================== Survey Warranty Templates (Quotations) ====================

    async getSurveyWarrantyTemplates(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT * FROM survey_warranty_templates ORDER BY order_index, created_at')
        return (rows as any[]).map(r => ({
            id: r.id,
            text: r.text,
            placeholders: this.extractPlaceholders(r.text),
            order: r.order_index
        }))
    }

    private extractPlaceholders(text: string): string[] {
        const matches = text.match(/\{[^}]+\}/g)
        return matches ? [...new Set(matches)] : []
    }

    async addSurveyWarrantyTemplate(text: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM survey_warranty_templates')
        const order = (maxRow as any[])[0].next_order
        await this.pool.execute(
            'INSERT INTO survey_warranty_templates (id, text, order_index) VALUES (?, ?, ?)',
            [id, text, order]
        )
        return { id, text, placeholders: this.extractPlaceholders(text), order }
    }

    async updateSurveyWarrantyTemplate(id: string, text: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE survey_warranty_templates SET text = ? WHERE id = ?', [text, id])
    }

    async deleteSurveyWarrantyTemplate(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM survey_warranty_templates WHERE id = ?', [id])
    }

    async reorderSurveyWarrantyTemplates(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE survey_warranty_templates SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    async getSurveyWarrantyTemplateSets(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query('SELECT * FROM survey_warranty_template_sets ORDER BY order_index')
        const sets: any[] = []
        for (const r of rows as any[]) {
            const [items] = await this.pool.query(
                'SELECT template_id FROM survey_warranty_template_set_items WHERE set_id = ?',
                [r.id]
            )
            sets.push({
                id: r.id,
                name: r.name,
                templateIds: (items as any[]).map(i => i.template_id),
                order: r.order_index
            })
        }
        return sets
    }

    async addSurveyWarrantyTemplateSet(name: string, templateIds: string[]): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM survey_warranty_template_sets')
        const order = (maxRow as any[])[0].next_order
        await this.pool.execute(
            'INSERT INTO survey_warranty_template_sets (id, name, order_index) VALUES (?, ?, ?)',
            [id, name, order]
        )
        for (const tid of templateIds) {
            await this.pool.execute(
                'INSERT INTO survey_warranty_template_set_items (set_id, template_id) VALUES (?, ?)',
                [id, tid]
            )
        }
        return { id, name, templateIds, order }
    }

    async updateSurveyWarrantyTemplateSet(id: string, name: string, templateIds: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE survey_warranty_template_sets SET name = ? WHERE id = ?', [name, id])
        await this.pool.execute('DELETE FROM survey_warranty_template_set_items WHERE set_id = ?', [id])
        for (const tid of templateIds) {
            await this.pool.execute(
                'INSERT INTO survey_warranty_template_set_items (set_id, template_id) VALUES (?, ?)',
                [id, tid]
            )
        }
    }

    async deleteSurveyWarrantyTemplateSet(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM survey_warranty_template_set_items WHERE set_id = ?', [id])
        await this.pool.execute('DELETE FROM survey_warranty_template_sets WHERE id = ?', [id])
    }

    async getQuotationSurveyWarranties(quotationId: string): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT * FROM quotation_survey_warranties WHERE quotation_id = ? ORDER BY order_index',
            [quotationId]
        )
        return (rows as any[]).map(r => ({
            id: r.id,
            quotationId: r.quotation_id,
            templateId: r.template_id,
            text: r.text,
            deadlineValue: r.deadline_value,
            daysValue: r.days_value,
            eventValue: r.event_value,
            customText: r.custom_text,
            order: r.order_index,
            vesselScope: r.vessel_scope ? JSON.parse(r.vessel_scope) : null,
            alternativeId: r.alternative_id
        }))
    }

    async setQuotationSurveyWarranties(quotationId: string, items: any[]): Promise<void> {
        if (!this.pool) return
        try {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
            await this.pool.execute('DELETE FROM quotation_survey_warranties WHERE quotation_id = ?', [quotationId])
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                await this.pool.execute(
                    `INSERT INTO quotation_survey_warranties (id, quotation_id, template_id, text, deadline_value, days_value, event_value, custom_text, order_index, vessel_scope, alternative_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        item.id || uuidv4(), quotationId, item.templateId || null,
                        item.text, item.deadlineValue || null, item.daysValue || null,
                        item.eventValue || null, item.customText || null, i,
                        item.vesselScope ? JSON.stringify(item.vesselScope) : null,
                        item.alternativeId || null
                    ]
                )
            }
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
    }

    async addQuotationSurveyWarranty(data: any): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM quotation_survey_warranties WHERE quotation_id = ?',
            [data.quotationId]
        )
        const order = (maxRow as any[])[0].next_order
        try {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=0')
            await this.pool.execute(
                `INSERT INTO quotation_survey_warranties (id, quotation_id, template_id, text, deadline_value, days_value, event_value, custom_text, order_index, vessel_scope, alternative_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, data.quotationId, data.templateId || null,
                    data.text, data.deadlineValue || null, data.daysValue || null,
                    data.eventValue || null, data.customText || null, order,
                    data.vesselScope ? JSON.stringify(data.vesselScope) : null,
                    data.alternativeId || null
                ]
            )
        } finally {
            await this.pool.query('SET FOREIGN_KEY_CHECKS=1')
        }
        return { id, ...data, order }
    }

    async updateQuotationSurveyWarranty(id: string, data: any): Promise<void> {
        if (!this.pool) return
        const fields: string[] = []
        const values: any[] = []
        if (data.text !== undefined) { fields.push('text = ?'); values.push(data.text) }
        if (data.deadlineValue !== undefined) { fields.push('deadline_value = ?'); values.push(data.deadlineValue) }
        if (data.daysValue !== undefined) { fields.push('days_value = ?'); values.push(data.daysValue) }
        if (data.eventValue !== undefined) { fields.push('event_value = ?'); values.push(data.eventValue) }
        if (data.customText !== undefined) { fields.push('custom_text = ?'); values.push(data.customText) }
        if (data.vesselScope !== undefined) { fields.push('vessel_scope = ?'); values.push(data.vesselScope ? JSON.stringify(data.vesselScope) : null) }
        if (data.alternativeId !== undefined) { fields.push('alternative_id = ?'); values.push(data.alternativeId) }
        if (data.order !== undefined) { fields.push('order_index = ?'); values.push(data.order) }
        if (fields.length === 0) return
        values.push(id)
        await this.pool.execute(`UPDATE quotation_survey_warranties SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    async deleteQuotationSurveyWarranty(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM quotation_survey_warranties WHERE id = ?', [id])
    }

    // ==================== Notifications ====================

    async getNotifications(userId: string, opts?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<{ data: any[]; unreadCount: number }> {
        if (!this.pool) return { data: [], unreadCount: 0 }
        const limit = opts?.limit || 50
        const offset = opts?.offset || 0
        let query = 'SELECT id, user_id AS userId, type, title, message, link_type AS linkType, link_id AS linkId, is_read AS isRead, created_at AS createdAt FROM notifications WHERE user_id = ?'
        const values: any[] = [userId]
        if (opts?.unreadOnly) {
            query += ' AND is_read = FALSE'
        }
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
        values.push(limit, offset)
        const [rows] = await this.pool.query(query, values)
        const data = (rows as any[]).map(r => ({ ...r, isRead: Boolean(r.isRead) }))
        const [countRows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId])
        const unreadCount = (countRows as any[])[0].cnt
        return { data, unreadCount }
    }

    async getUnreadNotificationCount(userId: string): Promise<number> {
        if (!this.pool) return 0
        const [rows] = await this.pool.query('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = FALSE', [userId])
        return (rows as any[])[0].cnt
    }

    async createNotification(notification: { userId: string; type: string; title: string; message?: string; linkType?: string; linkId?: string }): Promise<void> {
        if (!this.pool) return
        const id = uuidv4()
        await this.pool.execute(
            'INSERT INTO notifications (id, user_id, type, title, message, link_type, link_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, notification.userId, notification.type, notification.title, notification.message || null, notification.linkType || null, notification.linkId || null]
        )
    }

    async markNotificationRead(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id])
    }

    async markAllNotificationsRead(userId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [userId])
    }

    async deleteNotification(id: string, userId: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, userId])
    }

    async deleteOldNotifications(days: number): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM notifications WHERE is_read = TRUE AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [days])
    }

    async notifyUser(userId: string, type: string, title: string, message?: string, linkType?: string, linkId?: string): Promise<void> {
        await this.createNotification({ userId, type, title, message, linkType, linkId })
    }

    async notifyUsersWithPermission(permissionKey: string, type: string, title: string, message?: string, linkType?: string, linkId?: string, excludeUserId?: string): Promise<void> {
        if (!this.pool) return
        // Find all users who have the permission (via group membership or are admin)
        const [rows] = await this.pool.query(
            `SELECT DISTINCT u.id FROM users u
             LEFT JOIN user_group_members ugm ON ugm.user_id = u.id
             LEFT JOIN group_permissions gp ON gp.group_id = ugm.group_id AND gp.permission_key = ?
             LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id AND upo.permission_key = ?
             WHERE (u.role = 'admin' OR gp.permission_key IS NOT NULL OR (upo.permission_key IS NOT NULL AND upo.granted = TRUE))
               AND NOT (upo.permission_key IS NOT NULL AND upo.granted = FALSE)`,
            [permissionKey, permissionKey]
        )
        for (const row of rows as any[]) {
            if (excludeUserId && row.id === excludeUserId) continue
            await this.createNotification({ userId: row.id, type, title, message, linkType, linkId })
        }
    }

    async getUsersByUsername(usernames: string[]): Promise<{ id: string; username: string }[]> {
        if (!this.pool || usernames.length === 0) return []
        const placeholders = usernames.map(() => '?').join(', ')
        const [rows] = await this.pool.query(`SELECT id, username FROM users WHERE username IN (${placeholders})`, usernames)
        return rows as { id: string; username: string }[]
    }

    // ==================== Notification Groups ====================

    async getNotificationGroups(): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT ng.id, ng.name, ng.description, ng.order_index AS \`order\`,
                    (SELECT COUNT(*) FROM notification_group_members ngm WHERE ngm.group_id = ng.id) AS memberCount,
                    (SELECT COUNT(*) FROM notification_group_subscriptions ngs WHERE ngs.group_id = ng.id) AS subscriptionCount
             FROM notification_groups ng ORDER BY ng.order_index ASC`
        )
        return (rows as any[]).map(r => ({ ...r, memberCount: Number(r.memberCount), subscriptionCount: Number(r.subscriptionCount) }))
    }

    async addNotificationGroup(name: string, description?: string): Promise<any> {
        if (!this.pool) throw new Error('DB not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM notification_groups') as any[]
        const order = maxRow[0]?.nextOrder ?? 0
        await this.pool.execute(
            'INSERT INTO notification_groups (id, name, description, order_index) VALUES (?, ?, ?, ?)',
            [id, name, description || null, order]
        )
        return { id, name, description: description || null, order, memberCount: 0, subscriptionCount: 0 }
    }

    async updateNotificationGroup(id: string, name: string, description?: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE notification_groups SET name = ?, description = ? WHERE id = ?',
            [name, description || null, id]
        )
    }

    async deleteNotificationGroup(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM notification_group_members WHERE group_id = ?', [id])
        await this.pool.execute('DELETE FROM notification_group_subscriptions WHERE group_id = ?', [id])
        await this.pool.execute('DELETE FROM notification_groups WHERE id = ?', [id])
    }

    async reorderNotificationGroups(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE notification_groups SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    async getNotificationGroupMembers(groupId: string): Promise<{ id: string; username: string }[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT u.id, u.username FROM notification_group_members ngm
             JOIN users u ON u.id = ngm.user_id
             WHERE ngm.group_id = ?
             ORDER BY u.username ASC`,
            [groupId]
        )
        return rows as { id: string; username: string }[]
    }

    async setNotificationGroupMembers(groupId: string, userIds: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM notification_group_members WHERE group_id = ?', [groupId])
        for (const userId of userIds) {
            await this.pool.execute(
                'INSERT INTO notification_group_members (group_id, user_id) VALUES (?, ?)',
                [groupId, userId]
            )
        }
    }

    async getNotificationGroupSubscriptions(groupId: string): Promise<string[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            'SELECT event_type FROM notification_group_subscriptions WHERE group_id = ?',
            [groupId]
        )
        return (rows as any[]).map(r => r.event_type)
    }

    async setNotificationGroupSubscriptions(groupId: string, eventTypes: string[]): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM notification_group_subscriptions WHERE group_id = ?', [groupId])
        for (const eventType of eventTypes) {
            await this.pool.execute(
                'INSERT INTO notification_group_subscriptions (id, group_id, event_type) VALUES (?, ?, ?)',
                [uuidv4(), groupId, eventType]
            )
        }
    }

    async getGroupsSubscribedToEvent(eventType: string): Promise<{ groupId: string; groupName: string; userIds: string[] }[]> {
        if (!this.pool) return []
        const [groupRows] = await this.pool.query(
            `SELECT ng.id AS groupId, ng.name AS groupName
             FROM notification_group_subscriptions ngs
             JOIN notification_groups ng ON ng.id = ngs.group_id
             WHERE ngs.event_type = ?`,
            [eventType]
        )
        const groups = groupRows as { groupId: string; groupName: string }[]
        for (const g of groups) {
            const [memberRows] = await this.pool.query(
                'SELECT user_id FROM notification_group_members WHERE group_id = ?',
                [g.groupId]
            )
            ;(g as any).userIds = (memberRows as any[]).map(r => r.user_id)
        }
        return groups as any[]
    }

    async notifyGroupsForEvent(eventType: string, title: string, message?: string, linkType?: string, linkId?: string, excludeUserId?: string): Promise<void> {
        if (!this.pool) return
        const groups = await this.getGroupsSubscribedToEvent(eventType)
        // Deduplicate user IDs across all groups
        const userIdSet = new Set<string>()
        for (const g of groups) {
            for (const uid of g.userIds) {
                if (excludeUserId && uid === excludeUserId) continue
                userIdSet.add(uid)
            }
        }
        for (const userId of userIdSet) {
            await this.createNotification({ userId, type: eventType, title, message, linkType, linkId })
        }
    }

    async globalSearch(query: string, limit: number = 20): Promise<{
        vessels: any[]
        entities: any[]
        quotations: any[]
        policies: any[]
    }> {
        if (!this.pool) return { vessels: [], entities: [], quotations: [], policies: [] }
        const like = `%${query}%`
        const perCategory = Math.min(Math.floor(limit / 4), 5) || 5

        const [vessels, entities, quotations, policies] = await Promise.all([
            this.pool.query(
                `SELECT id, name, imo_number AS imoNumber, is_active AS isActive
                 FROM vessels
                 WHERE name LIKE ? OR imo_number LIKE ?
                 ORDER BY is_active DESC, name ASC
                 LIMIT ?`,
                [like, like, perCategory]
            ).then(([rows]) => rows as any[]),

            this.pool.query(
                `SELECT id, name, type
                 FROM entities
                 WHERE name LIKE ?
                 ORDER BY name ASC
                 LIMIT ?`,
                [like, perCategory]
            ).then(([rows]) => rows as any[]),

            this.pool.query(
                `SELECT q.id, q.reference_number AS referenceNumber,
                        q.quotation_date AS quotationDate,
                        qt.name AS quotationTypeName, qt.code AS quotationTypeCode
                 FROM quotations q
                 LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
                 WHERE q.revision_number = (
                     SELECT MAX(q2.revision_number) FROM quotations q2
                     WHERE q2.revision_group_id = q.revision_group_id
                 )
                 AND q.reference_number LIKE ?
                 ORDER BY q.quotation_date DESC
                 LIMIT ?`,
                [like, perCategory]
            ).then(([rows]) => rows as any[]),

            this.pool.query(
                `(SELECT pd.id, pd.policy_number AS policyNumber,
                        pd.vessel_id AS vesselId, v.name AS vesselName,
                        'policy_document' AS source, pd.status
                 FROM policy_documents pd
                 LEFT JOIN vessels v ON pd.vessel_id = v.id
                 WHERE pd.policy_number LIKE ?
                 ORDER BY pd.created_at DESC
                 LIMIT ?)
                 UNION ALL
                 (SELECT vdp.id, vdp.policy_number AS policyNumber,
                        vdp.vessel_id AS vesselId, v.name AS vesselName,
                        'vessel_policy' AS source, vdp.status
                 FROM vessel_dynamic_policies vdp
                 LEFT JOIN vessels v ON vdp.vessel_id = v.id
                 WHERE vdp.policy_number LIKE ? OR v.name LIKE ?
                 ORDER BY vdp.status ASC, v.name ASC
                 LIMIT ?)`,
                [like, perCategory, like, like, perCategory]
            ).then(([rows]) => rows as any[])
        ])

        return { vessels, entities, quotations, policies }
    }

    async seedDefaultNotificationGroups(): Promise<void> {
        if (!this.pool) return
        const [existing] = await this.pool.query('SELECT COUNT(*) AS cnt FROM notification_groups') as any[]
        if (existing[0]?.cnt > 0) return

        const complianceId = uuidv4()
        const underwritingId = uuidv4()
        const operationsId = uuidv4()

        await this.pool.execute('INSERT INTO notification_groups (id, name, description, order_index) VALUES (?, ?, ?, ?)', [complianceId, 'Compliance', 'Document and sanctions compliance notifications', 0])
        await this.pool.execute('INSERT INTO notification_groups (id, name, description, order_index) VALUES (?, ?, ?, ?)', [underwritingId, 'Underwriting', 'Quotation and policy workflow notifications', 1])
        await this.pool.execute('INSERT INTO notification_groups (id, name, description, order_index) VALUES (?, ?, ?, ?)', [operationsId, 'Operations', 'Vessel and survey operational notifications', 2])

        const complianceSubs = ['document_expiring', 'document_missing', 'compliance_match']
        const underwritingSubs = ['quotation_workflow', 'quotation_approval_needed', 'policy_created', 'policy_renewed']
        const operationsSubs = ['survey_warranty_deadline', 'vessel_status_change']

        for (const et of complianceSubs) {
            await this.pool.execute('INSERT INTO notification_group_subscriptions (id, group_id, event_type) VALUES (?, ?, ?)', [uuidv4(), complianceId, et])
        }
        for (const et of underwritingSubs) {
            await this.pool.execute('INSERT INTO notification_group_subscriptions (id, group_id, event_type) VALUES (?, ?, ?)', [uuidv4(), underwritingId, et])
        }
        for (const et of operationsSubs) {
            await this.pool.execute('INSERT INTO notification_group_subscriptions (id, group_id, event_type) VALUES (?, ?, ?)', [uuidv4(), operationsId, et])
        }
    }

    // --- Recent Items ---
    async getRecentItems(userId: string, limit = 8): Promise<any[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, user_id AS userId, item_type AS itemType, item_id AS itemId,
                    item_label AS itemLabel, item_sublabel AS itemSublabel,
                    viewed_at AS viewedAt
             FROM user_recent_items
             WHERE user_id = ?
             ORDER BY viewed_at DESC
             LIMIT ?`,
            [userId, limit]
        )
        return rows as any[]
    }

    async getDatabaseHealth(): Promise<{
        connected: boolean
        version: string
        databaseSize: string
        tableCount: number
        largestTables: { name: string; rows: number; sizeMB: number }[]
        lastBackup: string | null
    }> {
        if (!this.pool) {
            return { connected: false, version: '', databaseSize: '0', tableCount: 0, largestTables: [], lastBackup: null }
        }
        try {
            const [[versionRow]] = await this.pool.query('SELECT VERSION() as version') as any
            const version = versionRow?.version || 'Unknown'

            const [tableRows] = await this.pool.query(
                `SELECT table_name AS name,
                        table_rows AS \`rows\`,
                        ROUND(data_length / 1024 / 1024, 2) AS sizeMB
                 FROM information_schema.tables
                 WHERE table_schema = DATABASE()
                 ORDER BY data_length DESC`
            ) as any

            const tables = Array.isArray(tableRows) ? tableRows : []
            const tableCount = tables.length
            const totalSizeMB = tables.reduce((sum: number, t: any) => sum + (parseFloat(t.sizeMB) || 0), 0)
            const databaseSize = totalSizeMB < 1
                ? `${(totalSizeMB * 1024).toFixed(0)} KB`
                : `${totalSizeMB.toFixed(2)} MB`

            const largestTables = tables.slice(0, 10).map((t: any) => ({
                name: t.name,
                rows: parseInt(t.rows) || 0,
                sizeMB: parseFloat(t.sizeMB) || 0
            }))

            let lastBackup: string | null = null
            try {
                const val = await this.getSetting('last_backup_date')
                lastBackup = val || null
            } catch { /* ignore */ }

            return { connected: true, version, databaseSize, tableCount, largestTables, lastBackup }
        } catch (error) {
            console.error('getDatabaseHealth error:', error)
            return { connected: false, version: '', databaseSize: '0', tableCount: 0, largestTables: [], lastBackup: null }
        }
    }

    async addRecentItem(userId: string, itemType: string, itemId: string, itemLabel: string, itemSublabel?: string): Promise<void> {
        if (!this.pool) return
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO user_recent_items (id, user_id, item_type, item_id, item_label, item_sublabel, viewed_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE viewed_at = NOW(), item_label = VALUES(item_label), item_sublabel = VALUES(item_sublabel)`,
            [id, userId, itemType, itemId, itemLabel, itemSublabel || null]
        )
        // Keep max 20 items per user — delete oldest beyond 20
        await this.pool.execute(
            `DELETE FROM user_recent_items
             WHERE user_id = ? AND id NOT IN (
                 SELECT id FROM (
                     SELECT id FROM user_recent_items WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 20
                 ) AS keep
             )`,
            [userId, userId]
        )
    }
    // --- User Column Preferences ---
    async getUserColumnPrefs(userId: string, pageKey: string): Promise<string[] | null> {
        if (!this.pool) return null
        const [rows] = await this.pool.execute(
            'SELECT visible_columns FROM user_column_prefs WHERE user_id = ? AND page_key = ?',
            [userId, pageKey]
        )
        const arr = rows as any[]
        if (arr.length === 0) return null
        try {
            return JSON.parse(arr[0].visible_columns)
        } catch {
            return null
        }
    }

    async setUserColumnPrefs(userId: string, pageKey: string, columnIds: string[]): Promise<void> {
        if (!this.pool) throw new Error('DB not connected')
        await this.pool.execute(
            `INSERT INTO user_column_prefs (user_id, page_key, visible_columns)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE visible_columns = VALUES(visible_columns)`,
            [userId, pageKey, JSON.stringify(columnIds)]
        )
    }

    // --- Bulk Vessel Operations ---
    async bulkAssignFleet(vesselIds: string[], fleetId: string): Promise<void> {
        if (!this.pool || vesselIds.length === 0) return
        const placeholders = vesselIds.map(() => '?').join(',')
        await this.pool.execute(
            `UPDATE vessels SET fleet_id = ? WHERE id IN (${placeholders})`,
            [fleetId || null, ...vesselIds]
        )
    }

    async bulkSetVesselStatus(vesselIds: string[], isActive: boolean): Promise<void> {
        if (!this.pool || vesselIds.length === 0) return
        const placeholders = vesselIds.map(() => '?').join(',')
        await this.pool.execute(
            `UPDATE vessels SET is_active = ? WHERE id IN (${placeholders})`,
            [isActive, ...vesselIds]
        )
        // If deactivating, also deactivate their policies
        if (!isActive) {
            await this.pool.execute(
                `UPDATE vessel_dynamic_policies SET status = 'inactive' WHERE vessel_id IN (${placeholders}) AND status = 'active'`,
                vesselIds
            )
        }
    }

    // --- Bulk Entity Operations ---
    async bulkDeleteEntities(entityIds: string[]): Promise<number> {
        if (!this.pool || entityIds.length === 0) return 0
        const placeholders = entityIds.map(() => '?').join(',')
        // Clear customer references
        await this.pool.execute(
            `UPDATE vessels SET customer_id = NULL, customer_type = NULL WHERE customer_id IN (${placeholders})`,
            entityIds
        )
        // Delete assured links
        await this.pool.execute(
            `DELETE FROM vessel_assureds WHERE entity_id IN (${placeholders})`,
            entityIds
        )
        // Delete UBO links
        await this.pool.execute(
            `DELETE FROM entity_ubos WHERE assured_entity_id IN (${placeholders}) OR ubo_entity_id IN (${placeholders})`,
            [...entityIds, ...entityIds]
        )
        // Delete entities
        const [result] = await this.pool.execute(
            `DELETE FROM entities WHERE id IN (${placeholders})`,
            entityIds
        )
        return (result as any).affectedRows || 0
    }

    // --- Document Templates ---
    async getDocumentTemplates(category?: string): Promise<any[]> {
        if (!this.pool) return []
        let query = `SELECT id, name, description, category, file_name AS fileName,
            placeholders, body, created_by AS createdBy, order_index AS \`order\`, created_at AS createdAt
            FROM document_templates`
        const params: any[] = []
        if (category) {
            query += ' WHERE category = ?'
            params.push(category)
        }
        query += ' ORDER BY order_index ASC'
        const [rows] = await this.pool.query(query, params)
        return (rows as any[]).map(r => ({
            ...r,
            placeholders: r.placeholders ? JSON.parse(r.placeholders) : null
        }))
    }

    async getDocumentTemplateById(id: string): Promise<any | null> {
        if (!this.pool) return null
        const [rows] = await this.pool.query(
            `SELECT id, name, description, category, file_name AS fileName,
                file_data AS fileData, placeholders, body, created_by AS createdBy,
                order_index AS \`order\`, created_at AS createdAt
            FROM document_templates WHERE id = ?`,
            [id]
        )
        const arr = rows as any[]
        if (arr.length === 0) return null
        const r = arr[0]
        return {
            ...r,
            placeholders: r.placeholders ? JSON.parse(r.placeholders) : null
        }
    }

    async addDocumentTemplate(data: {
        name: string
        description?: string | null
        category: string
        fileName?: string | null
        fileData?: Buffer | null
        placeholders?: string[] | null
        body?: string | null
        createdBy?: string | null
    }): Promise<any> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        const [maxRow] = await this.pool.query('SELECT COALESCE(MAX(order_index), -1) + 1 AS nextOrder FROM document_templates') as any[]
        const nextOrder = maxRow[0]?.nextOrder ?? 0
        await this.pool.execute(
            `INSERT INTO document_templates (id, name, description, category, file_name, file_data, placeholders, body, created_by, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                data.name,
                data.description || null,
                data.category,
                data.fileName || null,
                data.fileData || null,
                data.placeholders ? JSON.stringify(data.placeholders) : null,
                data.body || null,
                data.createdBy || null,
                nextOrder
            ]
        )
        return {
            id,
            name: data.name,
            description: data.description || null,
            category: data.category,
            fileName: data.fileName || null,
            placeholders: data.placeholders || null,
            body: data.body || null,
            createdBy: data.createdBy || null,
            order: nextOrder
        }
    }

    async updateDocumentTemplate(id: string, data: {
        name?: string
        description?: string | null
        category?: string
        body?: string | null
    }): Promise<void> {
        if (!this.pool) return
        const sets: string[] = []
        const params: any[] = []
        if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
        if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description) }
        if (data.category !== undefined) { sets.push('category = ?'); params.push(data.category) }
        if (data.body !== undefined) { sets.push('body = ?'); params.push(data.body) }
        if (sets.length === 0) return
        params.push(id)
        await this.pool.execute(`UPDATE document_templates SET ${sets.join(', ')} WHERE id = ?`, params)
    }

    async updateDocumentTemplateFile(id: string, fileName: string, fileData: Buffer, placeholders: string[] | null): Promise<void> {
        if (!this.pool) return
        await this.pool.execute(
            'UPDATE document_templates SET file_name = ?, file_data = ?, placeholders = ? WHERE id = ?',
            [fileName, fileData, placeholders ? JSON.stringify(placeholders) : null, id]
        )
    }

    async deleteDocumentTemplate(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM document_templates WHERE id = ?', [id])
    }

    async reorderDocumentTemplates(ids: string[]): Promise<void> {
        if (!this.pool) return
        for (let i = 0; i < ids.length; i++) {
            await this.pool.execute('UPDATE document_templates SET order_index = ? WHERE id = ?', [i, ids[i]])
        }
    }

    // ==================== Saved Reports ====================

    async getSavedReports(userId: string): Promise<SavedReport[]> {
        if (!this.pool) return []
        const [rows] = await this.pool.query(
            `SELECT id, name, description, data_source AS dataSource, config,
                    created_by AS createdBy, is_shared AS isShared, created_at AS createdAt
             FROM saved_reports
             WHERE created_by = ? OR is_shared = TRUE
             ORDER BY created_at DESC`,
            [userId]
        )
        return (rows as any[]).map(r => ({
            ...r,
            isShared: Boolean(r.isShared),
            config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config
        }))
    }

    async addSavedReport(data: {
        name: string
        description?: string | null
        dataSource: string
        config: ReportConfig
        createdBy?: string | null
        isShared?: boolean
    }): Promise<SavedReport> {
        if (!this.pool) throw new Error('DB Not connected')
        const id = uuidv4()
        await this.pool.execute(
            `INSERT INTO saved_reports (id, name, description, data_source, config, created_by, is_shared)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, data.name, data.description || null, data.dataSource,
             JSON.stringify(data.config), data.createdBy || null, data.isShared ? 1 : 0]
        )
        return {
            id,
            name: data.name,
            description: data.description || null,
            dataSource: data.dataSource,
            config: data.config,
            createdBy: data.createdBy || null,
            isShared: data.isShared || false
        }
    }

    async updateSavedReport(id: string, data: {
        name?: string
        description?: string | null
        config?: ReportConfig
        isShared?: boolean
    }): Promise<void> {
        if (!this.pool) return
        const sets: string[] = []
        const params: any[] = []
        if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name) }
        if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description) }
        if (data.config !== undefined) { sets.push('config = ?'); params.push(JSON.stringify(data.config)) }
        if (data.isShared !== undefined) { sets.push('is_shared = ?'); params.push(data.isShared ? 1 : 0) }
        if (sets.length === 0) return
        params.push(id)
        await this.pool.execute(`UPDATE saved_reports SET ${sets.join(', ')} WHERE id = ?`, params)
    }

    async deleteSavedReport(id: string): Promise<void> {
        if (!this.pool) return
        await this.pool.execute('DELETE FROM saved_reports WHERE id = ?', [id])
    }

    async runReport(dataSource: string, config: ReportConfig): Promise<any[]> {
        if (!this.pool) return []

        // Define allowed columns per data source to prevent SQL injection
        const DATA_SOURCE_DEFS: Record<string, {
            baseQuery: string
            columnMap: Record<string, string>
            filterMap: Record<string, (params: any[], val: any) => string>
            groupMap?: Record<string, string>
        }> = {
            vessels: {
                baseQuery: `FROM vessels v
                    LEFT JOIN fleets f ON v.fleet_id = f.id
                    LEFT JOIN flag_states fs ON v.flag_state_id = fs.id
                    LEFT JOIN entities cust ON v.customer_id = cust.id`,
                columnMap: {
                    name: 'v.name AS name',
                    imoNumber: 'v.imo_number AS imoNumber',
                    vesselType: 'v.vessel_type AS vesselType',
                    flagState: 'fs.name AS flagState',
                    builtYear: 'v.built_year AS builtYear',
                    grossTonnage: 'v.gross_tonnage AS grossTonnage',
                    classification: 'v.classification_society AS classification',
                    customer: 'cust.name AS customer',
                    fleet: 'f.name AS fleet',
                    isActive: 'v.is_active AS isActive',
                    createdAt: 'v.created_at AS createdAt',
                    callSign: 'v.call_sign AS callSign',
                    customerType: 'v.customer_type AS customerType'
                },
                filterMap: {
                    status: (params, val) => {
                        if (val === 'active') { params.push(1); return 'v.is_active = ?' }
                        if (val === 'inactive') { params.push(0); return 'v.is_active = ?' }
                        return ''
                    },
                    fleetId: (params, val) => { params.push(val); return 'v.fleet_id = ?' },
                    flagStateId: (params, val) => { params.push(val); return 'v.flag_state_id = ?' },
                    customerId: (params, val) => { params.push(val); return 'v.customer_id = ?' },
                    vesselType: (params, val) => { params.push(val); return 'v.vessel_type = ?' },
                    search: (params, val) => {
                        const s = `%${val}%`
                        params.push(s, s)
                        return '(v.name LIKE ? OR v.imo_number LIKE ?)'
                    }
                },
                groupMap: {
                    customer: 'cust.name',
                    fleet: 'f.name',
                    vesselType: 'v.vessel_type',
                    flagState: 'fs.name'
                }
            },
            policies: {
                baseQuery: `FROM vessel_dynamic_policies vdp
                    LEFT JOIN vessels v ON vdp.vessel_id = v.id
                    LEFT JOIN policy_types pt ON vdp.policy_type_id = pt.id
                    LEFT JOIN fleets f ON v.fleet_id = f.id
                    LEFT JOIN entities cust ON v.customer_id = cust.id
                    LEFT JOIN entities broker ON vdp.broker_entity_id = broker.id`,
                columnMap: {
                    vesselName: 'v.name AS vesselName',
                    imoNumber: 'v.imo_number AS imoNumber',
                    policyType: 'pt.name AS policyType',
                    policyNumber: 'vdp.policy_number AS policyNumber',
                    status: 'vdp.status AS status',
                    currency: 'vdp.currency AS currency',
                    customerName: 'cust.name AS customerName',
                    fleetName: 'f.name AS fleetName',
                    brokerName: 'broker.name AS brokerName',
                    createdAt: 'vdp.created_at AS createdAt'
                },
                filterMap: {
                    policyTypeId: (params, val) => { params.push(val); return 'vdp.policy_type_id = ?' },
                    status: (params, val) => { params.push(val); return 'vdp.status = ?' },
                    vesselActive: (params, val) => {
                        if (val === 'active') { params.push(1); return 'v.is_active = ?' }
                        if (val === 'inactive') { params.push(0); return 'v.is_active = ?' }
                        return ''
                    },
                    search: (params, val) => {
                        const s = `%${val}%`
                        params.push(s, s, s)
                        return '(v.name LIKE ? OR vdp.policy_number LIKE ? OR pt.name LIKE ?)'
                    }
                },
                groupMap: {
                    policyType: 'pt.name',
                    customer: 'cust.name',
                    fleet: 'f.name',
                    status: 'vdp.status'
                }
            },
            entities: {
                baseQuery: `FROM entities e
                    LEFT JOIN (
                        SELECT entity_id, COUNT(*) AS vesselCount
                        FROM vessel_assureds GROUP BY entity_id
                    ) vc ON e.id = vc.entity_id`,
                columnMap: {
                    name: 'e.name AS name',
                    type: 'e.type AS type',
                    email: 'e.email AS email',
                    phone: 'e.phone AS phone',
                    identifier: 'e.identifier AS identifier',
                    vesselCount: 'COALESCE(vc.vesselCount, 0) AS vesselCount',
                    createdAt: 'e.created_at AS createdAt'
                },
                filterMap: {
                    type: (params, val) => { params.push(val); return 'e.type = ?' },
                    search: (params, val) => {
                        const s = `%${val}%`
                        params.push(s, s, s)
                        return '(e.name LIKE ? OR e.email LIKE ? OR e.identifier LIKE ?)'
                    }
                },
                groupMap: {
                    type: 'e.type'
                }
            },
            renewals: {
                baseQuery: `FROM vessel_dynamic_policies vdp
                    LEFT JOIN vessels v ON vdp.vessel_id = v.id
                    LEFT JOIN policy_types pt ON vdp.policy_type_id = pt.id
                    LEFT JOIN fleets f ON v.fleet_id = f.id
                    LEFT JOIN entities cust ON v.customer_id = cust.id
                    LEFT JOIN renewal_status_types rst ON vdp.renewal_status_id = rst.id
                    LEFT JOIN vessel_policy_values vpv_end ON (
                        vpv_end.dynamic_policy_id = vdp.id
                        AND vpv_end.characteristic_id IN (
                            SELECT ptc.id FROM policy_type_characteristics ptc
                            WHERE ptc.name LIKE '%end%' AND ptc.field_type = 'date'
                        )
                    )`,
                columnMap: {
                    vesselName: 'v.name AS vesselName',
                    imoNumber: 'v.imo_number AS imoNumber',
                    policyType: 'pt.name AS policyType',
                    policyNumber: 'vdp.policy_number AS policyNumber',
                    endDate: 'vpv_end.value_date AS endDate',
                    customerName: 'cust.name AS customerName',
                    fleetName: 'f.name AS fleetName',
                    renewalStatus: 'rst.name AS renewalStatus',
                    daysUntilExpiry: 'DATEDIFF(vpv_end.value_date, CURDATE()) AS daysUntilExpiry'
                },
                filterMap: {
                    policyTypeId: (params, val) => { params.push(val); return 'vdp.policy_type_id = ?' },
                    dateFrom: (params, val) => { params.push(val); return 'vpv_end.value_date >= ?' },
                    dateTo: (params, val) => { params.push(val); return 'vpv_end.value_date <= ?' },
                    status: (params, val) => { params.push(val); return 'vdp.status = ?' },
                    search: (params, val) => {
                        const s = `%${val}%`
                        params.push(s, s)
                        return '(v.name LIKE ? OR vdp.policy_number LIKE ?)'
                    }
                },
                groupMap: {
                    policyType: 'pt.name',
                    customer: 'cust.name',
                    fleet: 'f.name',
                    renewalStatus: 'rst.name'
                }
            },
            quotations: {
                baseQuery: `FROM quotations q
                    LEFT JOIN quotation_types qt ON q.quotation_type_id = qt.id
                    LEFT JOIN (
                        SELECT qv.quotation_id,
                               GROUP_CONCAT(COALESCE(v2.name, qv.name) SEPARATOR ', ') AS vesselNames
                        FROM quotation_vessels qv
                        LEFT JOIN vessels v2 ON qv.vessel_id = v2.id
                        GROUP BY qv.quotation_id
                    ) qvn ON q.id = qvn.quotation_id`,
                columnMap: {
                    referenceNumber: 'q.reference_number AS referenceNumber',
                    typeName: 'qt.name AS typeName',
                    status: 'q.status AS status',
                    vesselNames: 'qvn.vesselNames AS vesselNames',
                    premiumAmount: 'q.premium_amount AS premiumAmount',
                    premiumCurrency: 'q.premium_currency AS premiumCurrency',
                    quotationDate: 'q.quotation_date AS quotationDate',
                    createdAt: 'q.created_at AS createdAt',
                    createdBy: 'q.created_by AS createdBy'
                },
                filterMap: {
                    typeId: (params, val) => { params.push(val); return 'q.quotation_type_id = ?' },
                    status: (params, val) => { params.push(val); return 'q.status = ?' },
                    dateFrom: (params, val) => { params.push(val); return 'q.quotation_date >= ?' },
                    dateTo: (params, val) => { params.push(val); return 'q.quotation_date <= ?' },
                    search: (params, val) => {
                        const s = `%${val}%`
                        params.push(s, s)
                        return '(q.reference_number LIKE ? OR qvn.vesselNames LIKE ?)'
                    }
                },
                groupMap: {
                    type: 'qt.name',
                    status: 'q.status'
                }
            }
        }

        const def = DATA_SOURCE_DEFS[dataSource]
        if (!def) throw new Error(`Unknown data source: ${dataSource}`)

        // Build SELECT columns — only allowed ones
        const requestedCols = (config.columns || []).filter(c => def.columnMap[c])
        if (requestedCols.length === 0) throw new Error('No valid columns selected')

        const selectCols = requestedCols.map(c => def.columnMap[c]).join(', ')

        // Build WHERE
        const conditions: string[] = []
        const params: any[] = []
        if (config.filters) {
            for (const [key, val] of Object.entries(config.filters)) {
                if (val === undefined || val === null || val === '' || val === 'all') continue
                const filterFn = def.filterMap[key]
                if (filterFn) {
                    const cond = filterFn(params, val)
                    if (cond) conditions.push(cond)
                }
            }
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

        // Build ORDER BY
        let orderClause = ''
        if (config.sortBy && def.columnMap[config.sortBy]) {
            // Extract the actual column expression (before AS alias)
            const colExpr = def.columnMap[config.sortBy].split(' AS ')[0]
            const dir = config.sortDir === 'desc' ? 'DESC' : 'ASC'
            orderClause = `ORDER BY ${colExpr} ${dir}`
        }

        const query = `SELECT ${selectCols} ${def.baseQuery} ${whereClause} ${orderClause} LIMIT 5000`
        const [rows] = await this.pool.query(query, params)
        return rows as any[]
    }
}

export const db = new MySQLAdapter()
