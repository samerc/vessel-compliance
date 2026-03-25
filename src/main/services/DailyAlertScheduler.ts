import { MySQLAdapter } from '../mysql/adapter'

export class DailyAlertScheduler {
  private db: MySQLAdapter
  private timer: NodeJS.Timeout | null = null
  private intervalTimer: NodeJS.Timeout | null = null

  constructor(db: MySQLAdapter) {
    this.db = db
  }

  async start(): Promise<void> {
    // Load settings
    const enabled = await this.db.getSetting('daily_alerts_enabled')
    if (enabled === 'false') return

    const timeStr = (await this.db.getSetting('daily_alerts_time')) || '08:00'

    // Calculate ms until next run
    const now = new Date()
    const [hours, minutes] = timeStr.split(':').map(Number)
    const next = new Date(now)
    next.setHours(hours, minutes, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)

    const msUntilFirst = next.getTime() - now.getTime()
    const DAY_MS = 24 * 60 * 60 * 1000

    // Check if we missed today's run (app was closed)
    const lastRun = await this.db.getSetting('daily_alerts_last_run')
    const today = new Date().toISOString().split('T')[0]
    if (lastRun !== today) {
      console.log('[DailyAlerts] Missed run detected — running immediately')
      this.run()
    }

    console.log(
      `[DailyAlerts] Next scheduled run at ${next.toLocaleString()} (in ${Math.round(msUntilFirst / 60000)} min)`
    )

    this.timer = setTimeout(() => {
      this.run()
      this.intervalTimer = setInterval(() => this.run(), DAY_MS)
    }, msUntilFirst)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.intervalTimer) clearInterval(this.intervalTimer)
  }

  async run(): Promise<void> {
    console.log('[DailyAlerts] Running daily alert check...')

    // Check if already ran today
    const lastRun = await this.db.getSetting('daily_alerts_last_run')
    const today = new Date().toISOString().split('T')[0]
    if (lastRun === today) {
      console.log('[DailyAlerts] Already ran today, skipping')
      return
    }

    try {
      // Load thresholds
      const docExpiryDays = parseInt(
        (await this.db.getSetting('daily_alerts_doc_expiry_days')) || '30',
        10
      )
      const policyExpiryDays = parseInt(
        (await this.db.getSetting('daily_alerts_policy_expiry_days')) || '60',
        10
      )
      const warrantyDays = parseInt(
        (await this.db.getSetting('daily_alerts_warranty_days')) || '14',
        10
      )
      const blueCardDays = parseInt(
        (await this.db.getSetting('daily_alerts_blue_card_days')) || '30',
        10
      )

      await this.checkDocumentExpiry(docExpiryDays)
      await this.checkMissingDocuments()
      await this.checkPolicyExpiry(policyExpiryDays)
      await this.checkBlueCardExpiry(blueCardDays)
      await this.checkWarrantyDeadlines(warrantyDays)

      await this.db.setSetting('daily_alerts_last_run', today)
      console.log('[DailyAlerts] Completed')
    } catch (err) {
      console.error('[DailyAlerts] Error:', err)
    }
  }

  private async checkDocumentExpiry(days: number): Promise<void> {
    if (!this.db.pool) return
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const [rows] = await this.db.pool.query(
      `SELECT vd.vessel_id, v.name as vesselName, dt.name as docTypeName, vd.expiry_date as expiryDate
       FROM vessel_documents vd
       JOIN vessels v ON vd.vessel_id = v.id
       LEFT JOIN document_types dt ON vd.document_type_id = dt.id
       WHERE v.is_active = TRUE
       AND vd.expiry_date IS NOT NULL
       AND vd.expiry_date > ?
       AND vd.expiry_date <= ?
       AND vd.file_path IS NOT NULL`,
      [todayStr, futureDateStr]
    )

    const items = rows as any[]
    if (items.length > 0) {
      const summary =
        items.length === 1
          ? `${items[0].docTypeName} for ${items[0].vesselName} expires ${items[0].expiryDate}`
          : `${items.length} documents expiring within ${days} days`
      await this.db.notifyGroupsForEvent(
        'document_expiring',
        'Documents expiring soon',
        summary,
        undefined,
        undefined
      )
    }
  }

  private async checkMissingDocuments(): Promise<void> {
    if (!this.db.pool) return
    // Count active vessels with required docs that have no file uploaded
    const [rows] = await this.db.pool.query(
      `SELECT COUNT(DISTINCT v.id) as cnt
       FROM vessels v
       CROSS JOIN document_types dt
       LEFT JOIN vessel_documents vd ON vd.vessel_id = v.id AND vd.document_type_id = dt.id AND vd.file_path IS NOT NULL
       WHERE v.is_active = TRUE AND dt.required = TRUE AND vd.id IS NULL`
    )
    const count = (rows as any[])[0]?.cnt || 0
    if (count > 0) {
      await this.db.notifyGroupsForEvent(
        'document_missing',
        'Missing required documents',
        `${count} vessels have missing required documents`,
        undefined,
        undefined
      )
    }
  }

  private async checkPolicyExpiry(days: number): Promise<void> {
    if (!this.db.pool) return
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const [rows] = await this.db.pool.query(
      `SELECT pd.id, pd.policy_number as policyNumber, pd.expiry_date as expiryDate,
              v.name as vesselName
       FROM policy_documents pd
       JOIN vessels v ON pd.vessel_id = v.id
       WHERE pd.status = 'active'
       AND v.is_active = TRUE
       AND pd.expiry_date IS NOT NULL
       AND pd.expiry_date > ?
       AND pd.expiry_date <= ?`,
      [todayStr, futureDateStr]
    )

    const items = rows as any[]
    if (items.length > 0) {
      const summary =
        items.length === 1
          ? `Policy ${items[0].policyNumber} for ${items[0].vesselName} expires ${items[0].expiryDate}`
          : `${items.length} policies expiring within ${days} days`
      await this.db.notifyGroupsForEvent(
        'policy_expiring',
        'Policies expiring soon',
        summary,
        undefined,
        undefined
      )
    }
  }

  private async checkBlueCardExpiry(days: number): Promise<void> {
    if (!this.db.pool) return
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const [rows] = await this.db.pool.query(
      `SELECT bc.card_number as cardNumber, bc.card_type as cardType, bc.expiry_date as expiryDate,
              pd.policy_number as policyNumber
       FROM policy_blue_cards bc
       JOIN policy_documents pd ON bc.policy_doc_id = pd.id
       WHERE bc.status = 'active'
       AND bc.expiry_date IS NOT NULL
       AND bc.expiry_date > ?
       AND bc.expiry_date <= ?`,
      [todayStr, futureDateStr]
    )

    const items = rows as any[]
    if (items.length > 0) {
      const summary =
        items.length === 1
          ? `Blue card ${items[0].cardNumber} (${items[0].cardType}) expires ${items[0].expiryDate}`
          : `${items.length} blue cards expiring within ${days} days`
      await this.db.notifyGroupsForEvent(
        'blue_card_expiring',
        'Blue cards expiring soon',
        summary,
        undefined,
        undefined
      )
    }
  }

  private async checkWarrantyDeadlines(days: number): Promise<void> {
    if (!this.db.pool) return
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    const [rows] = await this.db.pool.query(
      `SELECT sw.id, sw.description, sw.inception_date as inceptionDate,
              sw.deadline_days as deadlineDays,
              DATE_ADD(sw.inception_date, INTERVAL COALESCE(sw.deadline_days, 0) DAY) as deadlineDate,
              v.name as vesselName
       FROM survey_warranties sw
       JOIN vessels v ON sw.vessel_id = v.id
       WHERE sw.status IN ('pending', 'survey_done')
       AND sw.deadline_type = 'days'
       AND sw.deadline_days IS NOT NULL
       AND DATE_ADD(sw.inception_date, INTERVAL sw.deadline_days DAY) > ?
       AND DATE_ADD(sw.inception_date, INTERVAL sw.deadline_days DAY) <= ?`,
      [todayStr, futureDateStr]
    )

    const items = rows as any[]
    if (items.length > 0) {
      const summary =
        items.length === 1
          ? `Warranty for ${items[0].vesselName}: ${items[0].description} due ${items[0].deadlineDate}`
          : `${items.length} survey warranties due within ${days} days`
      await this.db.notifyGroupsForEvent(
        'survey_warranty_deadline',
        'Survey warranty deadlines approaching',
        summary,
        undefined,
        undefined
      )
    }
  }
}
