// IPC error policy for the preload bridge.
//
// Main-process handlers registered with safeHandle() never throw: a failure comes back as
// { error: true, message }. Renderer code that ignores that value treats a failed save as a
// success (false "Saved" toasts, silently lost edits). For MUTATION channels the bridge
// therefore turns an error value into a rejected promise, so the code after the await does
// not run and the caller's catch (or the global unhandledrejection toast) reports it.
//
// Read channels keep returning the error value (callers guard with Array.isArray / ?.error).
// LEGACY_ERROR_VALUE_CHANNELS are mutations whose renderer callers already inspect the
// returned value for .error themselves; they keep the old contract so that existing handling
// (custom messages, fallbacks) is unchanged. New mutation channels throw by default.

const MUTATION_RE =
  /^(add|create|update|delete|remove|set|save|move|rename|upload|close|reopen|mark|merge|import|approve|sign|clone|duplicate|renew|restore|permanentlyDelete|bulk|toggle|reorder|assign|release|lock|unlock|forceUnlock|convert|supersede|issue|apply|clear|record|write|edit|insert|replace|reset|transition|send|link|unlink|purge|archive|cancel|revise|swap|heartbeat|freeze|decide|upsert|strip|remap|migrate|copy|complete|waive|forcePasswordReset|sync|reimport|cleanup|logReminder)/

export const LEGACY_ERROR_VALUE_CHANNELS: ReadonlySet<string> = new Set([
  'analytics:addPreset',
  'cargo:addClause',
  'cargo:addInstituteClause',
  'cargo:addQuotationCustomClause',
  'columnPrefs:set',
  'compliance:decideResult',
  'dashboard:saveLayout',
  'dashboard:setOnboarded',
  'db:addFleet',
  'db:addQuotation',
  'db:addQuotationAssuredGroup',
  'db:addQuotationClause',
  'db:addQuotationCustomExclusion',
  'db:addQuotationCustomSection',
  'db:addQuotationCustomWarranty',
  'db:createQuotationRevision',
  'db:deleteQuotation',
  'db:deleteQuotationClause',
  'db:deleteQuotationGroup',
  'db:duplicateQuotation',
  'db:restore',
  'db:updateDocumentType',
  'db:updateQuotationCustomWarranty',
  'db:updateQuotationSubjectivity',
  'email:addTemplate',
  'fileManager:moveFolder',
  'fileManager:renameFolder',
  'flagState:addPort',
  'hull:addAdditionalCondition',
  'hull:addAgreedValueOption',
  'hull:addClause',
  'hull:addQuotationAlternative',
  'notifications:delete',
  'notifications:markAllRead',
  'notifications:markRead',
  'pi:addAdditionalClause',
  'pi:addQuotationAlternative',
  'policy:renew',
  'policy:renewFleet',
  'policy:sign',
  'quotation:bulkDelete',
  'quotation:heartbeat',
  'quotation:saveFilter',
  'quotationDiscount:add',
  'quotationGroup:add',
  'quotationSurveyWarranty:add',
  'rbac:addGroup',
  'receipt:delete',
  'recent:add',
  'sic:addEntity',
  'sic:deleteEntity',
  'sic:import',
  'sic:updateEntity',
  'signature:uploadForUser',
  'surveyWarrantyTemplate:add',
  'surveyWarrantyTemplateSet:add',
  'tc:create',
  'users:updateAppVersion',
  'users:updateSidebarState',
  'workflow:assignQuotationNumber',
  'workflow:moveQuotation'
])

export function throwsOnError(channel: string): boolean {
  if (LEGACY_ERROR_VALUE_CHANNELS.has(channel)) return false
  const action = channel.includes(':') ? channel.slice(channel.indexOf(':') + 1) : channel
  return MUTATION_RE.test(action)
}
