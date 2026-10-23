/** Thrown when the user closes the Save dialog: nothing was written */
export class SaveCancelledError extends Error {
  constructor() {
    super('Export cancelled: no file was saved')
    this.name = 'SaveCancelledError'
  }
}

/**
 * Asks where to save and writes the file. Resolves only once the file is on disk, so callers can
 * mark something as exported after it. Rejects with SaveCancelledError on cancel, or with the
 * reason the file could not be written (e.g. open in Word).
 */
export async function saveFile(blob: Blob, fileName: string): Promise<string> {
  const data = new Uint8Array(await blob.arrayBuffer())
  const result = await window.api.fileSave(data, fileName)
  if (!result.saved) throw new SaveCancelledError()
  return result.filePath
}

/**
 * Saves a policy's export: into the policy's folder without asking when the converter gave it
 * one, otherwise (or when that folder cannot be reached) through the Save dialog
 */
export async function savePolicyFile(
  blob: Blob,
  fileName: string,
  policyId: string
): Promise<string> {
  const res = await window.api.policyWriteExportFile(
    policyId,
    new Uint8Array(await blob.arrayBuffer()),
    fileName
  )
  if (res.saved) return res.filePath
  return saveFile(blob, fileName)
}
