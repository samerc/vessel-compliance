import { lazy, Suspense } from 'react'

const DocumentTemplateManager = lazy(() => import('./DocumentTemplateManager'))

export default function TemplatesPage() {
  return (
    <div className="fade-in">
      <Suspense
        fallback={
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading...
          </div>
        }
      >
        <DocumentTemplateManager />
      </Suspense>
    </div>
  )
}
