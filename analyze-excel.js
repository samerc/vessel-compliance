const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'resources', 'Compliance.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('=== EXCEL FILE ANALYSIS ===\n');
console.log('Sheet Names:', workbook.SheetNames);
console.log('\n');

workbook.SheetNames.forEach(sheetName => {
    console.log(`\n=== SHEET: ${sheetName} ===`);
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (data.length > 0) {
        console.log('Headers:', data[0]);
        console.log('Total Rows:', data.length - 1);
        console.log('\nFirst 3 data rows:');
        for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
            console.log(`Row ${i}:`, data[i]);
        }
    }
});
