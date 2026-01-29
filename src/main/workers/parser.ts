import { parentPort } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import * as mammoth from 'mammoth'

parentPort?.on('message', async ({ filePath }) => {
    try {
        let text = ''
        const ext = path.extname(filePath).toLowerCase()

        // Extract text based on file type
        if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath)
            const pdfData = await pdfParse(dataBuffer)
            text = pdfData.text
        } else {
            // Word document
            const buffer = fs.readFileSync(filePath)
            const result = await mammoth.extractRawText({ buffer })
            text = result.value
        }

        // Parse defects from text - Two-pass approach for complex PDF layouts
        const lines = text.split('\n')
        const defects: Array<{ number: string; description: string; dueDate?: string; severity: string }> = []

        // Pass 1: Collect standalone defect numbers (before LIST OF DEFICIENCIES)
        const standaloneNumbers: string[] = []
        let foundRef = false
        let foundListOfDeficiencies = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()

            if (line.includes('Ref')) {
                foundRef = true
                continue
            }
            if (line.includes('LIST OF DEFICIENCIES')) {
                foundListOfDeficiencies = true
                break
            }

            if (foundRef && !foundListOfDeficiencies) {
                const numberMatch = line.match(/^(\d+\.?\d*)$/)
                if (numberMatch) {
                    standaloneNumbers.push(numberMatch[1])
                }
            }
        }

        // Pass 2: Process main deficiencies section
        const descriptions: string[] = []
        const itemsNotSurveyedNumbers: string[] = []
        const itemsNotSurveyedDescriptions: string[] = []
        let inDeficienciesSection = false
        let inObservationSection = false
        let inItemsNotSurveyedSection = false
        let beforeItemsNotSurveyed = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()

            // Detect sections
            if (line.includes('LIST OF DEFICIENCIES')) {
                inDeficienciesSection = true
                inObservationSection = false
                inItemsNotSurveyedSection = false
                beforeItemsNotSurveyed = false
                continue
            }
            if (line.includes('OBSERVATION') && !line.includes('for the observations')) {
                inDeficienciesSection = false
                inObservationSection = true
                inItemsNotSurveyedSection = false
                beforeItemsNotSurveyed = false
                continue
            }
            if (line.includes('ITEMS NOT SURVEYED')) {
                inDeficienciesSection = false
                inObservationSection = false
                inItemsNotSurveyedSection = true
                beforeItemsNotSurveyed = false
                continue
            }
            if (line.includes('NOTE') && line.includes('defects are not rectified')) {
                inDeficienciesSection = false
                continue
            }
            // Don't break on "Vessel's Master" - it can appear in middle of text
            // Only break on second occurrence of signature sections (after ITEMS NOT SURVEYED)
            if ((line.includes('Vesse\'sMaster') || line.includes('Attending Surveyor')) && inItemsNotSurveyedSection) {
                break
            }

            if (!inDeficienciesSection && !inObservationSection && !inItemsNotSurveyedSection && !beforeItemsNotSurveyed) continue
            if (!line) continue

            // Skip headers and non-relevant lines (but allow short numbers in deficiencies or beforeItemsNotSurveyed)
            if (line.includes('Vessel') || line.includes('Date') || line.includes('Place of Survey') ||
                line.includes('Master') || line.includes('Surveyor') || line.includes('Superintendent') ||
                line.includes('BJ EXPRESS') || line.includes('Istanbul') || line.includes('DEFICIENCIES & RECOMMENDATIONS') ||
                line.includes('If the defects') || line.includes('Capt.') ||
                line.includes('This section is for')) {
                continue
            }
            // Allow short lines if they could be defect numbers (in deficiencies or beforeItemsNotSurveyed sections)
            if (line.length < 10 && !beforeItemsNotSurveyed && !inDeficienciesSection) {
                continue
            }

            // Try inline format: "20.9 Hydraulic pumps..." or "7.5/7/6/7.7 Date of..." (only in deficiencies section)
            const inlineMatch = line.match(/^([\d\.\/]+)\s+([a-zA-Z].{10,})/)
            if (inlineMatch && inDeficienciesSection) {
                let defectNumber = inlineMatch[1]
                let description = inlineMatch[2].trim()
                let dueDate: string | undefined

                // Check for due date at end
                const dueDateMatch = description.match(/\s+((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(?:\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}))$/)
                if (dueDateMatch) {
                    dueDate = dueDateMatch[1]
                    description = description.substring(0, description.length - dueDateMatch[0].length).trim()

                    const parts = dueDate.split(/[\/\-\.]/)
                    if (parts.length === 3) {
                        if (parts[0].length === 4) {
                            dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
                        } else if (parts[2].length === 4) {
                            dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                        } else {
                            dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                        }
                    }
                }

                defects.push({
                    number: defectNumber,
                    description,
                    dueDate,
                    severity: ''
                })
                continue
            }

            // Check if it's a standalone number or compound number like "7.5/7/" that continues on next line
            const numberMatch = line.match(/^([\d\.\/]+)$/)
            if (numberMatch) {
                let defectNumber = numberMatch[1]

                // Check if next line completes the number (like "7.5/7/" followed by "6/7.7")
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim()
                    const continueNumberMatch = nextLine.match(/^([\d\.\/]+)$/)
                    if (continueNumberMatch) {
                        defectNumber = defectNumber + continueNumberMatch[1]
                        i++ // Skip the next line
                    }
                }

                // Look ahead for description
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim()
                    if (nextLine && !nextLine.match(/^[\d\.\/]+$/) &&
                        !nextLine.includes('Vessel') && !nextLine.includes('Master') &&
                        !nextLine.startsWith('-') && nextLine.length > 10) {
                        let description = nextLine

                        // Collect multi-line descriptions
                        for (let k = j + 1; k < lines.length; k++) {
                            const contLine = lines[k].trim()
                            if (!contLine || contLine.match(/^[\d\.\/]+/) || contLine.includes('NOTE')) {
                                break
                            }
                            // Stop at bullets or new sections
                            if (contLine.startsWith('-') || contLine.match(/^[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+/)) {
                                break
                            }
                            description += ' ' + contLine
                            j = k
                        }

                        let dueDate: string | undefined
                        const dueDateMatch = description.match(/\s+((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(?:\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}))$/)
                        if (dueDateMatch) {
                            dueDate = dueDateMatch[1]
                            description = description.substring(0, description.length - dueDateMatch[0].length).trim()

                            const parts = dueDate.split(/[\/\-\.]/)
                            if (parts.length === 3) {
                                if (parts[0].length === 4) {
                                    dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
                                } else if (parts[2].length === 4) {
                                    dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                                } else {
                                    dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                                }
                            }
                        }

                        defects.push({
                            number: defectNumber,
                            description,
                            dueDate,
                            severity: ''
                        })
                        i = j // Skip processed lines
                        break
                    }
                }
                continue
            }

            // Collect items before "ITEMS NOT SURVEYED" header (between OBSERVATION and ITEMS NOT SURVEYED)
            if (beforeItemsNotSurveyed) {
                // Standalone number like "17.2" or "21"
                const standaloneMatch = line.match(/^(\d+\.?\d*)$/)
                if (standaloneMatch) {
                    itemsNotSurveyedNumbers.push(standaloneMatch[1])
                    continue
                }

                // Compound format like "15.14/ Pressure test..."
                const compoundMatch = line.match(/^(\d+\.?\d*\/)\s*(.+)/)
                if (compoundMatch) {
                    let fullDesc = compoundMatch[2].trim()
                    let compoundNum = compoundMatch[1]

                    // Next line has "17.3 and strict..."
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1].trim()
                        const secondPartMatch = nextLine.match(/^(\d+\.?\d*)\s+(.+)/)
                        if (secondPartMatch) {
                            compoundNum = compoundMatch[1] + secondPartMatch[1]
                            fullDesc += ' ' + secondPartMatch[2]
                            i++

                            // Collect continuation lines
                            for (let j = i + 1; j < lines.length; j++) {
                                const contLine = lines[j].trim()
                                if (!contLine || contLine.match(/^\d+\.?\d*$/) || contLine.includes('ITEMS NOT SURVEYED')) {
                                    break
                                }
                                fullDesc += ' ' + contLine
                                i = j
                            }
                        }
                    }

                    defects.push({
                        number: compoundNum,
                        description: fullDesc,
                        dueDate: undefined,
                        severity: ''
                    })
                    continue
                }
                continue
            }

            // Collect descriptions after "ITEMS NOT SURVEYED" header
            if (inItemsNotSurveyedSection) {
                if (line.length > 20 && !line.includes('Vesse\'sMaster') && !line.includes('Capt.')) {
                    let fullDesc = line
                    // Collect continuation lines
                    for (let j = i + 1; j < lines.length; j++) {
                        const nextLine = lines[j].trim()
                        if (!nextLine || nextLine.includes('Vesse\'sMaster') || nextLine.includes('Capt.')) {
                            break
                        }
                        // If next line looks like start of new description (Function test, Fire hose test, etc.)
                        if (nextLine.match(/^(Function|Fire|Pressure)/)) {
                            break
                        }
                        fullDesc += ' ' + nextLine
                        i = j
                    }
                    if (fullDesc.length > 30) {
                        itemsNotSurveyedDescriptions.push(fullDesc)
                    }
                }
                continue
            }

            // Handle OBSERVATION section - collect multi-line descriptions
            if (inObservationSection) {
                // Skip "This section is for..." line and switch to beforeItemsNotSurveyed mode
                if (line.includes('This section is for')) {
                    inObservationSection = false
                    beforeItemsNotSurveyed = true
                    continue
                }

                // Build full observation text from multiple lines
                let observationText = line
                for (let j = i + 1; j < lines.length; j++) {
                    const nextLine = lines[j].trim()
                    if (nextLine.includes('ITEMS NOT SURVEYED') ||
                        nextLine.includes('This section is for') ||
                        nextLine.includes('Vessel\'s Master') ||
                        nextLine.match(/^\d+\.?\d*\/?/) ||
                        !nextLine) {
                        break
                    }
                    observationText += ' ' + nextLine
                    i = j
                }

                if (observationText.length > 20) {
                    defects.push({
                        number: 'OBS',
                        description: observationText,
                        dueDate: undefined,
                        severity: ''
                    })
                }

                // After collecting observation, switch to beforeItemsNotSurveyed mode
                inObservationSection = false
                beforeItemsNotSurveyed = true
                continue
            }

            // Collect potential standalone descriptions (for PDF with separated layout)
            if (!line.match(/^\d+/) && line.length > 15 &&
                line.endsWith('.') &&
                !line.includes('rectified') &&
                !line.includes('Insurer')) {
                descriptions.push(line)
            }
        }

        // Pass 2.5: Match items not surveyed numbers with descriptions
        const minItems = Math.min(itemsNotSurveyedNumbers.length, itemsNotSurveyedDescriptions.length)
        for (let i = 0; i < minItems; i++) {
            defects.push({
                number: itemsNotSurveyedNumbers[i],
                description: itemsNotSurveyedDescriptions[i],
                dueDate: undefined,
                severity: 'Minor'
            })
        }

        // Pass 3: Match standalone numbers with descriptions (for complex PDF layouts)
        if (standaloneNumbers.length > 0 && descriptions.length > 0) {
            const minLength = Math.min(standaloneNumbers.length, descriptions.length)
            for (let i = 0; i < minLength; i++) {
                // Check if this number hasn't been added yet
                if (!defects.find(d => d.number === standaloneNumbers[i])) {
                    let description = descriptions[i]
                    let dueDate: string | undefined

                    const dueDateMatch = description.match(/\s+((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(?:\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}))$/)
                    if (dueDateMatch) {
                        dueDate = dueDateMatch[1]
                        description = description.substring(0, description.length - dueDateMatch[0].length).trim()

                        const parts = dueDate.split(/[\/\-\.]/)
                        if (parts.length === 3) {
                            if (parts[0].length === 4) {
                                dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
                            } else if (parts[2].length === 4) {
                                dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                            } else {
                                dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                            }
                        }
                    }

                    defects.push({
                        number: standaloneNumbers[i],
                        description,
                        dueDate,
                        severity: ''
                    })
                }
            }
        }

        // Sort defects by number for better organization
        defects.sort((a, b) => {
            const numA = parseFloat(a.number)
            const numB = parseFloat(b.number)
            return numA - numB
        })

        parentPort?.postMessage({ success: true, defects })
    } catch (error: any) {
        parentPort?.postMessage({ success: false, error: error.message })
    }
})
