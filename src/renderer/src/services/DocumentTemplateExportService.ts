import { Document, Packer, Paragraph, Footer, TextRun, AlignmentType } from 'docx'
import { parseHtmlToParagraphs } from '../utils/htmlToDocx'

/**
 * Replace all {{key}} placeholders in an HTML string with their context values.
 */
export function resolveTemplatePlaceholders(
  body: string,
  context: Record<string, string>
): string {
  let result = body
  for (const [key, value] of Object.entries(context)) {
    // key already includes {{ }}, e.g. "{{vesselName}}"
    result = result.split(key).join(value)
  }
  return result
}

/**
 * Strip HTML tags and decode entities to produce plain text.
 */
export function htmlToPlainText(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

/**
 * Build a context map from vessel/entity/policy data for placeholder replacement.
 */
export async function buildTemplateContext(opts: {
  vesselId?: string
  policyId?: string
  entityId?: string
}): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {}

  // General
  ctx['{{today}}'] = new Date().toISOString().split('T')[0]
  try {
    const session = await window.api.getSession()
    if (session?.username) ctx['{{userName}}'] = session.username
  } catch { /* ignore */ }

  try {
    const raw = await window.api.getSetting('reportSettings')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.companyName) ctx['{{companyName}}'] = parsed.companyName
    }
  } catch { /* ignore */ }

  // Vessel
  if (opts.vesselId) {
    try {
      const vessels = await window.api.getVessels()
      const vessel = Array.isArray(vessels)
        ? vessels.find((v: any) => v.id === opts.vesselId)
        : null
      if (vessel) {
        ctx['{{vesselName}}'] = vessel.name || ''
        ctx['{{imoNumber}}'] = vessel.imoNumber || ''
        ctx['{{vesselType}}'] = vessel.vesselType || ''
        ctx['{{grossTonnage}}'] = vessel.grossTonnage ? String(vessel.grossTonnage) : ''
        ctx['{{builtYear}}'] = vessel.builtYear ? String(vessel.builtYear) : ''
        ctx['{{classification}}'] = vessel.classificationSociety || ''

        // Flag state
        if (vessel.flagStateId) {
          try {
            const flags = await window.api.getFlagStates()
            const flag = Array.isArray(flags) ? flags.find((f: any) => f.id === vessel.flagStateId) : null
            if (flag) ctx['{{flagState}}'] = flag.name || ''
          } catch { /* ignore */ }
        }

        // Customer / broker entity
        if (vessel.customerId) {
          try {
            const entities = await window.api.getEntities()
            const entity = Array.isArray(entities) ? entities.find((e: any) => e.id === vessel.customerId) : null
            if (entity) {
              if (vessel.customerType === 'broker') {
                ctx['{{brokerName}}'] = entity.name || ''
              } else {
                ctx['{{customerName}}'] = entity.name || ''
                ctx['{{customerEmail}}'] = entity.email || ''
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  // Entity (standalone)
  if (opts.entityId) {
    try {
      const entities = await window.api.getEntities()
      const entity = Array.isArray(entities)
        ? entities.find((e: any) => e.id === opts.entityId)
        : null
      if (entity) {
        ctx['{{customerName}}'] = entity.name || ''
        ctx['{{customerEmail}}'] = entity.email || ''
      }
    } catch { /* ignore */ }
  }

  // Policy
  if (opts.policyId && opts.vesselId) {
    try {
      const policies = await window.api.getVesselDynamicPolicies(opts.vesselId)
      const policy = Array.isArray(policies)
        ? policies.find((p: any) => p.id === opts.policyId)
        : null
      if (policy) {
        ctx['{{policyNumber}}'] = policy.policyNumber || ''
        ctx['{{policyType}}'] = policy.policyTypeName || ''
        if (policy.currency) ctx['{{currency}}'] = policy.currency

        // Policy values are already loaded with the policy
        if (Array.isArray(policy.values)) {
          for (const v of policy.values) {
            const nameL = (v.characteristicName || '').toLowerCase()
            if (nameL.includes('inception') || nameL.includes('start')) {
              ctx['{{inceptionDate}}'] = v.valueDate || v.valueText || ''
            }
            if (nameL.includes('end') || nameL.includes('expiry')) {
              ctx['{{expiryDate}}'] = v.valueDate || v.valueText || ''
            }
            if (nameL.includes('premium')) {
              ctx['{{premiumAmount}}'] = v.valueText || ''
            }
            if (nameL.includes('currency')) {
              ctx['{{currency}}'] = v.valueText || ''
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  return ctx
}

/**
 * Generate a DOCX from template body HTML.
 * Includes policy header from pi_section_texts.docHeader and
 * policy footer from policyExportSettings.footerText (no page numbers).
 */
export async function generateTemplateDocx(
  bodyHtml: string,
  fileName: string
): Promise<void> {
  // Build header paragraphs from section texts
  const headerParas: Paragraph[] = []
  try {
    const sectionTexts = await window.api.piGetSectionTexts()
    const headerHtml = sectionTexts?.docHeader
    if (headerHtml) {
      const hSpacing = (sectionTexts as any).docHeaderSpacing || undefined
      headerParas.push(
        ...parseHtmlToParagraphs(headerHtml, {
          size: 18,
          font: 'Times New Roman',
          color: '666666',
          lineSpacing: hSpacing
        })
      )
    }
  } catch { /* no header */ }

  // Build footer paragraphs from policyExportSettings
  const footerParas: Paragraph[] = []
  try {
    const raw = await window.api.getSetting('policyExportSettings')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.footerText) {
        if (/<[a-z][\s\S]*>/i.test(parsed.footerText)) {
          footerParas.push(
            ...parseHtmlToParagraphs(parsed.footerText, {
              size: 14,
              font: 'Arial',
              color: '999999',
              alignment: AlignmentType.CENTER
            })
          )
        } else {
          footerParas.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({
                  text: parsed.footerText,
                  size: 14,
                  font: 'Arial',
                  color: '999999',
                  italics: true
                })
              ]
            })
          )
        }
      }
    }
  } catch { /* no footer */ }

  // Build body paragraphs
  const bodyParas = parseHtmlToParagraphs(bodyHtml, {
    size: 20,
    font: 'Arial',
    color: '000000'
  })

  // Separator between header and body
  if (headerParas.length > 0 && bodyParas.length > 0) {
    headerParas.push(new Paragraph({ spacing: { after: 200 }, children: [] }))
  }

  const children = [...headerParas, ...bodyParas]

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1200,
              bottom: 1200,
              left: 1440,
              right: 1440
            }
          }
        },
        headers: undefined,
        footers: footerParas.length > 0
          ? { default: new Footer({ children: footerParas }) }
          : undefined,
        children: children as any[]
      }
    ]
  })

  const blob = await Packer.toBlob(document)
  const outName = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`
  const arrayBuf = await blob.arrayBuffer()
  const data = Array.from(new Uint8Array(arrayBuf))
  await window.api.fileSaveDocx(data, outName)
}
