import { useState, useEffect, useEffectEvent } from 'react'
import { Quotation, WarSettings } from '../../../../shared/types'

export default function WarTradingTab({
  quotation,
  updateField,
  setQ
}: {
  quotation: Quotation
  updateField: (field: string, value: unknown) => void
  setQ: (fn: (q: Quotation) => Quotation) => void
}): React.JSX.Element {
  const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
  const [customText, setCustomText] = useState(quotation.tradingWarrantyIntro || '')
  const [loaded, setLoaded] = useState(false)

  // Set default text from war settings if no custom override yet (reads the latest props).
  const applyDefaultText = useEffectEvent((settings: WarSettings): void => {
    if (!quotation.tradingWarrantyIntro) {
      const resolved = settings.tradingWarrantyText
        .replace(/\{jwla_code\}/g, settings.jwlaCode)
        .replace(/\{jwla_date\}/g, settings.jwlaDate)
      setCustomText(resolved)
      updateField('tradingWarrantyIntro', resolved)
      setQ((q) => ({ ...q, tradingWarrantyIntro: resolved }))
    }
  })

  // Runs once on mount.
  useEffect(() => {
    ;(async () => {
      try {
        const settings = await window.api.warGetSettings()
        if (settings && !('error' in settings && settings.error)) {
          setWarSettings(settings)
          applyDefaultText(settings)
        }
      } catch {
        /* settings are optional: the tab still works with the stored text */
      }
      setLoaded(true)
    })()
  }, [])

  const handleChange = (text: string): void => {
    setCustomText(text)
    setQ((q) => ({ ...q, tradingWarrantyIntro: text }))
  }

  const handleBlur = (): void => {
    updateField('tradingWarrantyIntro', customText)
  }

  const handleResetToDefault = (): void => {
    if (!warSettings) return
    const resolved = warSettings.tradingWarrantyText
      .replace(/\{jwla_code\}/g, warSettings.jwlaCode)
      .replace(/\{jwla_date\}/g, warSettings.jwlaDate)
    setCustomText(resolved)
    setQ((q) => ({ ...q, tradingWarrantyIntro: resolved }))
    updateField('tradingWarrantyIntro', resolved)
  }

  if (!loaded) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Trading Warranty</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
        Trading warranty text for this War Risk quotation. Defaults from War Settings.
      </p>

      <textarea
        value={customText}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        style={{
          width: '100%',
          minHeight: '100px',
          fontSize: '0.88rem',
          padding: '10px 12px',
          marginBottom: '10px'
        }}
      />

      {warSettings && (
        <button
          onClick={handleResetToDefault}
          className="btn-secondary"
          style={{ fontSize: '0.8rem', padding: '6px 12px' }}
        >
          Reset to Default
        </button>
      )}
    </div>
  )
}
