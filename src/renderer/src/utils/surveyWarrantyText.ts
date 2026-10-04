// Survey warranty wording on a POLICY: fills the template placeholders the way the converter
// shows them. {days} = 0 reads "at inception" ("within 0 days of inception" -> "at inception").
// The quotation export keeps its own wording ("prior inception").

export interface SurveyWarrantyValues {
  text?: string | null
  daysValue?: number | string | null
  deadlineValue?: string | null
  eventValue?: string | null
  surveyorValue?: string | null
  dateOfSurveyValue?: string | null
}

export function resolvePolicySurveyWarranty(sw: SurveyWarrantyValues): string {
  let t = (sw.text || '')
    .replace(/\{deadline\}/g, sw.deadlineValue || '{deadline}')
    .replace(/\{event\}/g, sw.eventValue || '{event}')
    .replace(/\{surveyor\}/g, sw.surveyorValue || '{surveyor}')
    .replace(/\{dateofsurvey\}/g, sw.dateOfSurveyValue || '{dateofsurvey}')
  if (sw.daysValue != null && String(sw.daysValue) !== '') {
    t = t.replace(/\{days\}/g, String(sw.daysValue))
    if (String(sw.daysValue).trim() === '0') {
      t = t
        .replace(/(?:within|in)\s+0\s+days?\s+(?:of|from|after)\s+inception/gi, 'at inception')
        .replace(/(?:within|in)\s+0\s+days?/gi, 'at inception')
    }
  }
  return t
}

export const DEFAULT_UPCC_TITLE = 'Upfront Profit Continuity Credit (UPCC)'
