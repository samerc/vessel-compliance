import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import type { SurveyImportFile, SurveyImportResult } from '../../../shared/types'
import { Modal, FileDrop } from './ui'
import { parseSurveyWorkbook } from '../utils/surveyExcelParser'
import { formatDate } from '../utils/dateUtils'

/**
 * Import from Excel: the surveys of a defects workbook (one sheet per survey, plus Deadlines and
 * Alerts). Shows what would be created / updated before anything is saved.
 */
export default function SurveyExcelImport({
  vesselImo,
  onClose,
  onDone,
  onError
}: {
  /** The vessel whose page this is: surveys of other vessels are flagged */
  vesselImo: string
  onClose: () => void
  onDone: (result: SurveyImportResult) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [file, setFile] = useState<SurveyImportFile | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<SurveyImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const digits = (s: string): string => (s || '').replace(/\D/g, '')

  const read = async (f: File): Promise<void> => {
    if (!/\.xlsx?$/i.test(f.name)) {
      onError('Choose an Excel file (.xlsx)')
      return
    }
    setBusy(true)
    try {
      const parsed = parseSurveyWorkbook(await f.arrayBuffer())
      if (parsed.surveys.length === 0) {
        onError('No survey sheet found: a survey sheet starts with "Type | Survey" in A1/B1')
        return
      }
      const p = window.api.getFilePath(f) || null
      setFile(parsed)
      setPath(p)
      setFileName(f.name)
      setPreview(await window.api.importSurveyExcel(parsed, p, true))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The file could not be read')
    } finally {
      setBusy(false)
    }
  }

  const run = async (): Promise<void> => {
    if (!file) return
    setBusy(true)
    try {
      onDone(await window.api.importSurveyExcel(file, path, false))
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The import failed')
      setBusy(false)
    }
  }

  const doable = preview?.surveys.some((s) => s.action !== 'skipped')

  return (
    <Modal
      title="Import surveys from Excel"
      icon={<FileSpreadsheet size={18} />}
      onClose={onClose}
      width={720}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={run} disabled={busy || !doable}>
            Import
          </button>
        </>
      }
    >
      {!file ? (
        <FileDrop
          accept=".xlsx,.xls"
          title="Drop the defects Excel here"
          hint="or click to choose it. Each sheet starting with Type | Survey is one survey; Deadlines and Alerts go into the survey notes"
          onFiles={([f]) => void read(f)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.86rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            {fileName} · nothing is saved until you click Import. A survey is matched on the vessel
            (IMO) and its id (S1...); a defect on the vessel and its item (D1...). A match gets the
            new status, last update, note, history and due date.
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Survey</th>
                  <th>Vessel</th>
                  <th>Date</th>
                  <th>Line</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {file.surveys.map((s, i) => {
                  const r = preview?.surveys[i]
                  const other = digits(s.imo) !== digits(vesselImo)
                  return (
                    <tr key={s.sheet}>
                      <td>
                        <strong>{s.code || '-'}</strong>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {s.surveyor} · {s.defects.length} line{s.defects.length === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td>
                        {r?.vesselName || s.vesselName}
                        {other && (
                          <div style={{ color: 'var(--warning)', fontSize: '0.78rem' }}>
                            Another vessel (IMO {s.imo})
                          </div>
                        )}
                      </td>
                      <td>{s.date ? formatDate(s.date) : '-'}</td>
                      <td>{s.line || '-'}</td>
                      <td>
                        {!r ? (
                          '…'
                        ) : r.action === 'skipped' ? (
                          <span style={{ color: 'var(--danger)' }}>Skipped: {r.reason}</span>
                        ) : (
                          <>
                            {r.action === 'created' ? 'New survey' : 'Updates the survey'}
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                              {r.defectsAdded} defect{r.defectsAdded === 1 ? '' : 's'} added,{' '}
                              {r.defectsUpdated} updated
                              {r.documentsAttached > 0 &&
                                `, ${r.documentsAttached} document${r.documentsAttached === 1 ? '' : 's'} attached`}
                              {r.newSurveyor && `, new surveyor ${r.newSurveyor}`}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {preview && preview.noteLines > 0 && (
            <div style={{ color: 'var(--text-secondary)' }}>
              {preview.noteLines} deadline / alert line{preview.noteLines === 1 ? '' : 's'} go into
              the notes of the vessel&apos;s latest survey.
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
