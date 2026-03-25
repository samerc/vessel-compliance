import { useState, lazy, Suspense } from 'react'
import { Mail, FileText } from 'lucide-react'

const EmailTemplates = lazy(() => import('./EmailTemplates'))
const DocumentTemplateManager = lazy(() => import('./DocumentTemplateManager'))

type TemplateTab = 'email' | 'document'

const TABS: { id: TemplateTab; label: string; icon: any }[] = [
  { id: 'email', label: 'Email Templates', icon: Mail },
  { id: 'document', label: 'Document Templates', icon: FileText }
]

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<TemplateTab>('email')

  return (
    <div className="fade-in">
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Templates</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Manage email and document templates
        </p>
      </header>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border:
                  activeTab === tab.id
                    ? '2px solid var(--accent-primary)'
                    : '1px solid var(--glass-border)',
                background:
                  activeTab === tab.id
                    ? 'rgba(var(--accent-primary-rgb, 0,210,255),0.08)'
                    : 'var(--bg-card)',
                color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? '600' : '400',
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'var(--transition)'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <Suspense
        fallback={
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        }
      >
        {activeTab === 'email' && <EmailTemplates />}
        {activeTab === 'document' && <DocumentTemplateManager />}
      </Suspense>
    </div>
  )
}
