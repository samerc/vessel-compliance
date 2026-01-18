const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join('c:', 'Users', 'SamerCheaib', 'Documents', 'Coding', 'vessel-compliance', 'resources', 'Compliance (2).xlsx');
const workbook = XLSX.readFile(filePath);

const sheetName = 'Brandenburg';
const worksheet = workbook.Sheets[sheetName];

if (!worksheet) {
    console.log(`Sheet "${sheetName}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`);
} else {
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log('Headers:', JSON.stringify(data[0], null, 2));
}
