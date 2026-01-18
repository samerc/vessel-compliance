const XLSX = require('xlsx');
const path = require('path');

// Defined headers based on excelImporter.ts
const headers = [
    'Vessel',
    'IMO',
    'Hull App',
    'P&I App',
    'COR',
    'Class',
    'SMC',
    'DOC',
    'Crew List',
    'Crew Salaries',
    'Crew Contracts',
    'Salaries Letter',
    'Medical Letter',
    'Registered Owners',
    'Managers'
];

// Sample data row to help the user understand formats
const sampleRow = [
    'Test Vessel',   // Vessel
    '1234567',       // IMO
    'YES',           // Hull App
    'NO',            // P&I App
    'E',             // COR (E = Expired)
    'N/A',           // Class
    'YES',           // SMC
    'YES',           // DOC
    'YES',           // Crew List
    'YES',           // Crew Salaries
    'YES',           // Crew Contracts
    'YES',           // Salaries Letter
    'YES',           // Medical Letter
    'Test Owner Ltd',// Registered Owners
    'Test Manager'   // Managers
];

const wb = XLSX.utils.book_new();
const wsData = [headers, sampleRow];
const ws = XLSX.utils.aoa_to_sheet(wsData);

// Set column widths for better readability
const wscols = headers.map(h => ({ wch: 20 }));
ws['!cols'] = wscols;

XLSX.utils.book_append_sheet(wb, ws, "Compliance");

const outputPath = path.resolve(__dirname, '../Compliance_Template.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`Template created successfully at: ${outputPath}`);
