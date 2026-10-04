/**
 * Feature registry: one list of what the app can do.
 * Feeds the command palette (Ctrl+K), the Features page and What's New "Try it" links.
 * Add an entry here when you add a page, a sub-tab or a notable action.
 */

export type AppTab =
  | 'dashboard'
  | 'vessels'
  | 'fleets'
  | 'admin'
  | 'directory'
  | 'compliance'
  | 'users'
  | 'sanctions-search'
  | 'surveys'
  | 'survey-followup'
  | 'calculators'
  | 'quotations'
  | 'vessel-filter'
  | 'renewals'
  | 'reports'
  | 'analytics'
  | 'activity-log'
  | 'templates'
  | 'policies-list'
  | 'policy-detail'
  | 'policy-setup'
  | 'notifications'
  | 'receipts'
  | 'features'

export type AppAction =
  | 'new-vessel'
  | 'new-quotation'
  | 'new-entity'
  | 'whats-new'
  | 'release-history'
  | 'profile'
  | 'check-updates'
  | 'theme-dark'
  | 'theme-light'
  | 'theme-premium'
  | 'theme-aurora'
  | 'density-compact'
  | 'density-normal'
  | 'density-spacious'

export interface NavTarget {
  tab?: AppTab
  /** Sub-tab / view / settings section inside the page */
  sub?: string
  action?: AppAction
}

export type FeatureArea =
  'Fleet' | 'Compliance' | 'Business' | 'Operations' | 'Reports' | 'Settings' | 'Personal'

export interface Feature {
  id: string
  title: string
  description: string
  area: FeatureArea
  /** Extra words people might type for this */
  keywords?: string
  /** User needs ANY of these permissions */
  permission?: string | string[]
  adminOnly?: boolean
  kind: 'page' | 'view' | 'action'
  target: NavTarget
}

export const FEATURE_AREAS: FeatureArea[] = [
  'Fleet',
  'Compliance',
  'Business',
  'Operations',
  'Reports',
  'Settings',
  'Personal'
]

export const FEATURES: Feature[] = [
  // ── Fleet ──
  {
    id: 'dashboard',
    title: 'Dashboard',
    area: 'Fleet',
    kind: 'page',
    target: { tab: 'dashboard' },
    description:
      'Key numbers, upcoming expirations, renewals calendar and recent changes. Customize the widgets.',
    keywords: 'home overview widgets kpi'
  },
  {
    id: 'vessels',
    title: 'Vessels',
    area: 'Fleet',
    kind: 'page',
    permission: 'vessels:view',
    target: { tab: 'vessels' },
    description:
      'The vessel register: documents, assureds, surveys, policies and full activity history per vessel.',
    keywords: 'ships registry imo'
  },
  {
    id: 'new-vessel',
    title: 'Register a vessel',
    area: 'Fleet',
    kind: 'action',
    permission: 'vessels:create',
    target: { action: 'new-vessel' },
    description: 'Open the quick register form to add a new vessel.',
    keywords: 'add create new ship'
  },
  {
    id: 'vessel-filter',
    title: 'Vessel Filter',
    area: 'Fleet',
    kind: 'page',
    permission: 'vessels:view',
    target: { tab: 'vessel-filter' },
    description:
      'Find vessels by policy type, flag, class, age, tonnage or customer, and compare two vessels side by side.',
    keywords: 'query search compare criteria'
  },
  {
    id: 'fleets',
    title: 'Fleets',
    area: 'Fleet',
    kind: 'page',
    permission: 'fleets:view',
    target: { tab: 'fleets', sub: 'fleets' },
    description: 'Group vessels into fleets and add or remove vessels in bulk.',
    keywords: 'group owner manager'
  },
  {
    id: 'fleets-customers',
    title: 'Vessels by customer',
    area: 'Fleet',
    kind: 'view',
    permission: 'fleets:view',
    target: { tab: 'fleets', sub: 'customers' },
    description:
      'Every vessel grouped under the broker or direct client that holds its active policies.',
    keywords: 'broker client customer'
  },

  // ── Compliance ──
  {
    id: 'compliance-docs',
    title: 'Document alerts',
    area: 'Compliance',
    kind: 'view',
    permission: 'compliance:view',
    target: { tab: 'compliance', sub: 'documents' },
    description:
      'Missing, expired and expiring documents for vessels and their assureds, by vessel or by document.',
    keywords: 'compliance center expired missing certificates'
  },
  {
    id: 'compliance-policies',
    title: 'Policy alerts',
    area: 'Compliance',
    kind: 'view',
    permission: 'compliance:view',
    target: { tab: 'compliance', sub: 'policies' },
    description: 'Expired and soon-to-expire vessel policies, with their status editable in place.',
    keywords: 'expiring policies'
  },
  {
    id: 'compliance-sanctions',
    title: 'Sanctions screening review',
    area: 'Compliance',
    kind: 'view',
    permission: 'compliance:view',
    target: { tab: 'compliance', sub: 'sanctions' },
    description:
      'Review matches found by the scheduled sanctions check; clear or sanction them one by one or in bulk.',
    keywords: 'ofac matches pending review'
  },
  {
    id: 'compliance-quality',
    title: 'Data quality rules',
    area: 'Compliance',
    kind: 'view',
    permission: 'compliance:view',
    target: { tab: 'compliance', sub: 'dataQuality' },
    description:
      'Find records with missing data (no email, no customer...) and add your own rules.',
    keywords: 'validation missing data'
  },
  {
    id: 'sanctions-search',
    title: 'Sanctions search',
    area: 'Compliance',
    kind: 'page',
    permission: 'sanctions:search',
    target: { tab: 'sanctions-search', sub: 'search' },
    description:
      'Look up any name or IMO across OFAC, EU, UK, UN, ISF and the SIC list, and update the lists.',
    keywords: 'ofac un eu uk isf screening lookup'
  },
  {
    id: 'sanctions-sic',
    title: 'SIC list',
    area: 'Compliance',
    kind: 'view',
    permission: 'sanctions:search',
    target: { tab: 'sanctions-search', sub: 'sic' },
    description:
      'Manage the local Special Investigation Commission list: add entries, import Excel, remark templates.',
    keywords: 'bdl blacklist lebanon'
  },
  {
    id: 'sic-import-letters',
    title: 'Import SIC letters',
    area: 'Compliance',
    kind: 'action',
    permission: 'compliance:review',
    target: { tab: 'sanctions-search', sub: 'sic' },
    description:
      'Read scanned SIC letters (PDF or photo): the names they list are found, spelled in English and saved with the Arabic.',
    keywords: 'ocr scan arabic letter pdf import names freeze inquiry'
  },
  {
    id: 'sanctions-report',
    title: 'Sanctions check report',
    area: 'Compliance',
    kind: 'view',
    permission: 'sanctions:search',
    target: { tab: 'sanctions-search', sub: 'report' },
    description:
      'Screen a name against every list, record a clear or sanctioned decision and export it as PDF.',
    keywords: 'screening pdf certificate'
  },

  // ── Business ──
  {
    id: 'renewals',
    title: 'Renewals',
    area: 'Business',
    kind: 'page',
    permission: 'policies:view',
    target: { tab: 'renewals' },
    description:
      'Policies expiring by month, renewal status, notes, 3-month view, Excel export and renewal quotations.',
    keywords: 'expiring renew month'
  },
  {
    id: 'quotations',
    title: 'Quotations',
    area: 'Business',
    kind: 'page',
    permission: 'quotations:view',
    target: { tab: 'quotations', sub: 'list' },
    description:
      'All quotations with views, filters, groups, favorites, bulk actions and the recycle bin.',
    keywords: 'quotes offers'
  },
  {
    id: 'new-quotation',
    title: 'New quotation',
    area: 'Business',
    kind: 'action',
    permission: 'quotations:create',
    target: { action: 'new-quotation' },
    description: 'Start a new P&I, Hull, War, Cargo or other quotation.',
    keywords: 'create quote add'
  },
  {
    id: 'quotation-settings',
    title: 'Quotation settings',
    area: 'Settings',
    kind: 'view',
    permission: 'quotations:settings',
    target: { tab: 'quotations', sub: 'settings' },
    description:
      'Quotation types, warranties, subjectivities, clauses, standard texts, section order and logo.',
    keywords: 'warranties clauses deductibles exclusions templates wording'
  },
  {
    id: 'policies',
    title: 'Policies',
    area: 'Business',
    kind: 'page',
    permission: 'policies:view',
    target: { tab: 'policies-list', sub: 'list' },
    description:
      'Issued policies: export the policy, debit and credit advice, blue cards and endorsements, sign and revise.',
    keywords: 'policy documents blue cards'
  },
  {
    id: 'policy-settings',
    title: 'Policy settings',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'policies-list', sub: 'settings' },
    description:
      'Policy wording, banks, signatures, T&C, blue card texts, commissions, declaration and QR verification.',
    keywords: 'banks signature terms conditions commission wording'
  },
  {
    id: 'receipts',
    title: 'Receipts',
    area: 'Business',
    kind: 'page',
    permission: 'policies:view',
    target: { tab: 'receipts' },
    description: 'Issue and export payment receipts against vessel policies.',
    keywords: 'payment'
  },

  // ── Operations ──
  {
    id: 'entities',
    title: 'Entities',
    area: 'Operations',
    kind: 'page',
    permission: 'entities:view',
    target: { tab: 'directory', sub: 'entities' },
    description:
      'Owners, managers, brokers and UBOs with documents, addresses, sanctions status and linked vessels.',
    keywords: 'directory companies persons assured owner broker'
  },
  {
    id: 'new-entity',
    title: 'New entity',
    area: 'Operations',
    kind: 'action',
    permission: 'entities:create',
    target: { action: 'new-entity' },
    description:
      'Add a company or person; it is screened against the sanctions lists automatically.',
    keywords: 'create company person add'
  },
  {
    id: 'surveyors',
    title: 'Surveyors',
    area: 'Operations',
    kind: 'view',
    permission: 'entities:view',
    target: { tab: 'directory', sub: 'surveyors' },
    description: 'Surveyor companies and the surveys each one carried out.',
    keywords: 'directory'
  },
  {
    id: 'flag-states',
    title: 'Flag states',
    area: 'Operations',
    kind: 'view',
    permission: 'entities:view',
    target: { tab: 'directory', sub: 'flag-states' },
    description:
      'Flags with ports of registry, convention ratification and maritime authority (used on blue cards).',
    keywords: 'flag ports authority bunker wreck'
  },
  {
    id: 'address-book',
    title: 'Address book',
    area: 'Operations',
    kind: 'view',
    permission: 'entities:view',
    target: { tab: 'directory', sub: 'address-book' },
    description:
      'Build contact lists by policy type, flag or customer and copy the emails straight into Outlook.',
    keywords: 'emails contacts mailing list outlook dab'
  },
  {
    id: 'surveys',
    title: 'Surveys',
    area: 'Operations',
    kind: 'page',
    permission: 'surveys:view',
    target: { tab: 'surveys' },
    description:
      'Condition surveys across all vessels with defect counts; import defects from Word or PDF reports.',
    keywords: 'condition survey defects'
  },
  {
    id: 'survey-warranties',
    title: 'Survey follow-up',
    area: 'Operations',
    kind: 'page',
    permission: 'surveys:view',
    target: { tab: 'survey-followup', sub: 'warranties' },
    description: 'Open survey warranties with deadlines, reminders and overdue tracking.',
    keywords: 'warranty deadline reminder overdue'
  },
  {
    id: 'survey-endorsements',
    title: 'Endorsements due',
    area: 'Operations',
    kind: 'view',
    permission: 'surveys:view',
    target: { tab: 'survey-followup', sub: 'endorsements' },
    description: 'Surveys with overdue open defects that still need an endorsement sent.',
    keywords: 'endorsement'
  },
  {
    id: 'templates',
    title: 'Templates',
    area: 'Operations',
    kind: 'page',
    target: { tab: 'templates' },
    description:
      'Document and email templates with placeholders; generate a Word file or copy the text.',
    keywords: 'email letter placeholder'
  },
  {
    id: 'calc-premium',
    title: 'Pro-rata premium calculator',
    area: 'Operations',
    kind: 'view',
    target: { tab: 'calculators', sub: 'premium' },
    description: 'Pro-rata premium, instalments and commission for any period.',
    keywords: 'calculator prorata'
  },
  {
    id: 'calc-tlo',
    title: 'TLO rate calculator',
    area: 'Operations',
    kind: 'view',
    target: { tab: 'calculators', sub: 'tlo' },
    description: 'New Total Loss Only premium and rate when the vessel value changes.',
    keywords: 'calculator total loss'
  },
  {
    id: 'calc-warbreach',
    title: 'War breach calculator',
    area: 'Operations',
    kind: 'view',
    target: { tab: 'calculators', sub: 'warbreach' },
    description: 'Net due on war breaches, with saved history and Excel export.',
    keywords: 'calculator war breach'
  },

  // ── Reports ──
  {
    id: 'report-builder',
    title: 'Report builder',
    area: 'Reports',
    kind: 'view',
    permission: 'reports:view',
    target: { tab: 'reports', sub: 'report-builder' },
    description:
      'Build your own report from 9 data sources with columns, filters, grouping and charts; save and share it.',
    keywords: 'custom report excel pdf chart'
  },
  {
    id: 'report-loss',
    title: 'Loss record report',
    area: 'Reports',
    kind: 'view',
    permission: 'reports:view',
    target: { tab: 'reports', sub: 'loss-record' },
    description: 'Turn a claims Excel into a PDF grouped by underwriting year, vessel and claim.',
    keywords: 'claims loss'
  },
  {
    id: 'report-customer',
    title: 'Customer compliance report',
    area: 'Reports',
    kind: 'view',
    permission: 'reports:view',
    target: { tab: 'reports', sub: 'customer-compliance' },
    description:
      'Document compliance per broker or client, filtered to the policy types they cover.',
    keywords: 'broker compliance pdf'
  },
  {
    id: 'report-assured',
    title: 'Assured report',
    area: 'Reports',
    kind: 'view',
    permission: 'reports:view',
    target: { tab: 'reports', sub: 'assured-report' },
    description: 'Assureds and their contacts per vessel or fleet, in Excel or PDF.',
    keywords: 'owners managers contacts'
  },
  {
    id: 'report-surveys',
    title: 'Condition survey report',
    area: 'Reports',
    kind: 'view',
    permission: 'reports:view',
    target: { tab: 'reports', sub: 'condition-survey' },
    description: 'Survey warranties by due month with carried-out dates and status.',
    keywords: 'warranty survey due'
  },
  {
    id: 'report-pipeline',
    title: 'Renewal pipeline',
    area: 'Reports',
    kind: 'view',
    permission: 'reports:view',
    target: { tab: 'reports', sub: 'renewal-pipeline' },
    description: 'Renewals by quarter or month with premium totals and renewal rate.',
    keywords: 'renewal forecast premium'
  },
  {
    id: 'analytics',
    title: 'Fleet analytics',
    area: 'Reports',
    kind: 'page',
    permission: 'analytics:view',
    target: { tab: 'analytics' },
    description:
      'Charts of the fleet by age, tonnage, flag, type and sanctions status, with saved presets.',
    keywords: 'charts statistics'
  },
  {
    id: 'activity-log',
    title: 'Activity log',
    area: 'Reports',
    kind: 'page',
    permission: 'admin:activityLog',
    target: { tab: 'activity-log' },
    description: 'Who changed what and when, across the whole system; export to PDF or Excel.',
    keywords: 'audit history log'
  },

  // ── Settings ──
  {
    id: 'settings',
    title: 'Settings',
    area: 'Settings',
    kind: 'page',
    permission: ['admin:settings', 'fileManager:view'],
    target: { tab: 'admin' },
    description:
      'Document types, roles, policy types, compliance schedule, report settings and more.',
    keywords: 'admin configuration'
  },
  {
    id: 'set-doc-types',
    title: 'Document types',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'admin', sub: 'docTypes' },
    description:
      'Required vessel documents, annual renewal and which policy types each applies to.',
    keywords: 'documents required'
  },
  {
    id: 'set-entity-doc-types',
    title: 'Entity document types',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'admin', sub: 'entityDocTypes' },
    description: 'Required documents for companies and persons (CoI, KYC, passport...).',
    keywords: 'kyc passport'
  },
  {
    id: 'set-roles',
    title: 'Assured roles',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'admin', sub: 'roles' },
    description: 'Owner, manager, operator and other assured roles.',
    keywords: 'owner manager role'
  },
  {
    id: 'set-policy-types',
    title: 'Policy types',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'admin', sub: 'policyTypes' },
    description: 'Policy and quotation types with their fields.',
    keywords: 'p&i hull war cargo'
  },
  {
    id: 'set-compliance',
    title: 'Compliance schedule',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'admin', sub: 'compliance' },
    description: 'Weekly automatic sanctions check: day, time, threshold, run now.',
    keywords: 'scheduled sanctions check'
  },
  {
    id: 'set-report',
    title: 'Report settings',
    area: 'Settings',
    kind: 'view',
    permission: 'admin:settings',
    target: { tab: 'admin', sub: 'reportSettings' },
    description: 'Company name, logo and colors used on PDF reports.',
    keywords: 'logo pdf branding'
  },
  {
    id: 'file-manager',
    title: 'File manager',
    area: 'Settings',
    kind: 'view',
    permission: 'fileManager:view',
    target: { tab: 'admin', sub: 'fileManager' },
    description: 'Browse and manage uploaded files.',
    keywords: 'files documents folder'
  },
  {
    id: 'set-sanctions-data',
    title: 'Sanctions data',
    area: 'Settings',
    kind: 'view',
    adminOnly: true,
    target: { tab: 'admin', sub: 'sanctionsData' },
    description: 'Status of each sanctions list and refresh per source.',
    keywords: 'ofac eu un refresh lists'
  },
  {
    id: 'set-user-groups',
    title: 'User groups and permissions',
    area: 'Settings',
    kind: 'view',
    adminOnly: true,
    target: { tab: 'admin', sub: 'userGroups' },
    description: 'Groups and the permissions they grant.',
    keywords: 'roles rbac access'
  },
  {
    id: 'set-daily-alerts',
    title: 'Daily alerts',
    area: 'Settings',
    kind: 'view',
    adminOnly: true,
    target: { tab: 'admin', sub: 'dailyAlerts' },
    description:
      'Automatic notifications for expiring documents, policies, blue cards and warranties.',
    keywords: 'notifications schedule'
  },
  {
    id: 'set-backup',
    title: 'Backup and restore',
    area: 'Settings',
    kind: 'view',
    adminOnly: true,
    target: { tab: 'admin', sub: 'backup' },
    description: 'Back up or restore the database.',
    keywords: 'export database'
  },
  {
    id: 'users',
    title: 'User management',
    area: 'Settings',
    kind: 'page',
    permission: 'admin:users',
    target: { tab: 'users' },
    description: 'User accounts, groups, permission overrides and app versions in use.',
    keywords: 'accounts password'
  },

  // ── Personal ──
  {
    id: 'features',
    title: 'Features',
    area: 'Personal',
    kind: 'page',
    target: { tab: 'features' },
    description: 'Everything the app can do, with a link to each.',
    keywords: 'help guide what can'
  },
  {
    id: 'notifications',
    title: 'Notifications',
    area: 'Personal',
    kind: 'page',
    target: { tab: 'notifications' },
    description: 'Mentions, replies, workflow steps and daily alerts addressed to you.',
    keywords: 'bell inbox mentions'
  },
  {
    id: 'profile',
    title: 'My profile and password',
    area: 'Personal',
    kind: 'action',
    target: { action: 'profile' },
    description: 'Change your password and profile details.',
    keywords: 'password account'
  },
  {
    id: 'whats-new',
    title: "What's new",
    area: 'Personal',
    kind: 'action',
    target: { action: 'whats-new' },
    description: 'The changes in the version you are running.',
    keywords: 'release notes changelog'
  },
  {
    id: 'release-history',
    title: 'Release history',
    area: 'Personal',
    kind: 'action',
    target: { action: 'release-history' },
    description: 'Notes for every earlier version.',
    keywords: 'changelog versions'
  },
  {
    id: 'check-updates',
    title: 'Check for updates',
    area: 'Personal',
    kind: 'action',
    target: { action: 'check-updates' },
    description: 'Look for a newer version now.',
    keywords: 'update upgrade version'
  },
  {
    id: 'theme-dark',
    title: 'Theme: Dark',
    area: 'Personal',
    kind: 'action',
    target: { action: 'theme-dark' },
    description: 'Switch to the dark theme.',
    keywords: 'appearance'
  },
  {
    id: 'theme-light',
    title: 'Theme: Light',
    area: 'Personal',
    kind: 'action',
    target: { action: 'theme-light' },
    description: 'Switch to the light theme.',
    keywords: 'appearance'
  },
  {
    id: 'theme-premium',
    title: 'Theme: Frost',
    area: 'Personal',
    kind: 'action',
    target: { action: 'theme-premium' },
    description: 'Switch to the Frost theme.',
    keywords: 'appearance premium'
  },
  {
    id: 'theme-aurora',
    title: 'Theme: Aurora',
    area: 'Personal',
    kind: 'action',
    target: { action: 'theme-aurora' },
    description: 'Switch to the Aurora theme.',
    keywords: 'appearance'
  },
  {
    id: 'density-compact',
    title: 'Table density: Compact',
    area: 'Personal',
    kind: 'action',
    target: { action: 'density-compact' },
    description: 'Fit more rows in every table.',
    keywords: 'rows spacing'
  },
  {
    id: 'density-normal',
    title: 'Table density: Normal',
    area: 'Personal',
    kind: 'action',
    target: { action: 'density-normal' },
    description: 'Default row spacing.',
    keywords: 'rows spacing'
  },
  {
    id: 'density-spacious',
    title: 'Table density: Spacious',
    area: 'Personal',
    kind: 'action',
    target: { action: 'density-spacious' },
    description: 'More space between table rows.',
    keywords: 'rows spacing'
  }
]

/** Features the current user may use */
export function visibleFeatures(
  hasPermission: (p: string) => boolean,
  isAdmin: boolean
): Feature[] {
  return FEATURES.filter((f) => {
    if (f.adminOnly && !isAdmin) return false
    if (!f.permission) return true
    const perms = Array.isArray(f.permission) ? f.permission : [f.permission]
    return perms.some((p) => hasPermission(p))
  })
}

/** Simple ranking: title prefix > title word > title contains > keywords/description */
export function searchFeatures(list: Feature[], query: string): Feature[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/)
  const scored: { f: Feature; s: number }[] = []
  for (const f of list) {
    const title = f.title.toLowerCase()
    const hay = `${title} ${f.keywords || ''} ${f.description} ${f.area}`.toLowerCase()
    if (!terms.every((t) => hay.includes(t))) continue
    let s = 1
    if (title.startsWith(q)) s = 4
    else if (title.split(/[\s:-]+/).some((w) => w.startsWith(terms[0]))) s = 3
    else if (title.includes(q)) s = 2
    if (f.kind === 'page') s += 0.5
    scored.push({ f, s })
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.f)
}
