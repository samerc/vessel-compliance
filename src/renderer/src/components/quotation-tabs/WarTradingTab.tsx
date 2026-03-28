import { useState, useEffect } from 'react'
import { Quotation, WarSettings } from '../../../../shared/types'

export default function WarTradingTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (q: Quotation) => Quotation) => void
}) {
    const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
    const [customText, setCustomText] = useState(quotation.tradingWarrantyIntro || '')
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                const settings = await window.api.warGetSettings()
                if (settings && !(settings as any).error) {
                    setWarSettings(settings)
                    // Set default text from war settings if no custom override yet
                    if (!quotation.tradingWarrantyIntro) {
                        const resolved = settings.tradingWarrantyText
                            .replace(/\{jwla_code\}/g, settings.jwlaCode)
                            .replace(/\{jwla_date\}/g, settings.jwlaDate)
                        setCustomText(resolved)
                        updateField('tradingWarrantyIntro', resolved)
                        setQ(q => ({ ...q, tradingWarrantyIntro: resolved }))
                    }
                }
            } catch {}
            setLoaded(true)
        })()
    }, [])

    const handleChange = (text: string) => {
        setCustomText(text)
        setQ(q => ({ ...q, tradingWarrantyIntro: text }))
    }

    const handleBlur = () => {
        updateField('tradingWarrantyIntro', customText)
    }

    const handleResetToDefault = () => {
        if (!warSettings) return
        const resolved = warSettings.tradingWarrantyText
            .replace(/\{jwla_code\}/g, warSettings.jwlaCode)
            .replace(/\{jwla_date\}/g, warSettings.jwlaDate)
        setCustomText(resolved)
        setQ(q => ({ ...q, tradingWarrantyIntro: resolved }))
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
                onChange={e => handleChange(e.target.value)}
                onBlur={handleBlur}
                style={{ width: '100%', minHeight: '100px', fontSize: '0.88rem', padding: '10px 12px', marginBottom: '10px' }}
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

