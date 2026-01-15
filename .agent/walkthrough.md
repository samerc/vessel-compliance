# Project Overview: Vessel Compliance Manager

The **Vessel Compliance Manager** is a modern Electron-based desktop application designed to track vessel documentation, compliance statuses, and expiry dates across fleets.

## 🛠️ Technology Stack

- **Framework**: [Electron](https://www.electronjs.org/) (Main & Preload)
- **Frontend**: [React](https://reactjs.org/) with [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/) (via `electron-vite`)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Persistence**: [electron-store](https://github.com/sindresorhus/electron-store)
- **Reporting**: 
  - [jsPDF](https://github.com/parallax/jsPDF) and `jspdf-autotable` for PDF exports.
  - [xlsx](https://github.com/SheetJS/sheetjs) for Excel exports.

## ✨ Key Features

- **Dashboard**: High-level overview of fleet compliance and upcoming expiries.
- **Vessel & Fleet Management**: CRUD operations for vessels and grouping them into fleets.
- **Hierarchical Document Tracking**: 
    - Manage document types in the **Admin Panel**.
    - Set a global "Required" default for each type. 
    - Override the requirement status for specific vessels.
- **Reporting**: Generation of compliance reports in PDF and Excel formats.
- **Premium UI**: Glassmorphic design with dark/light mode optimization and smooth scaling.

---

## 🚀 Getting Started

### 1. Clean Installation
If you encounter permission errors or download timeouts on Windows:
```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json; npm install
```

### 2. Run Development Mode
```bash
npm run dev
```

### 3. Generate Standalone Executable
To package the app for distribution:
```bash
npm run build:win
```
The standalone `.exe` installer will be created in the `dist` folder.
