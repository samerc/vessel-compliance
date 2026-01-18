# Vessel Compliance Manager

A modern Electron-based desktop application for tracking vessel documentation, compliance statuses, and expiry dates across fleets.

## Key Features

- **MySQL Database**: Self-hosted database architecture for robust data persistence and multi-user support.
- **User Management & RBAC**: Role-Based Access Control system ('Admin' vs 'User'). Admins can manage users and system settings.
- **Compliance Center**: Dedicated page for central monitoring of missing files and upcoming document expiries.
- **Assured & UBO Management**: Robust tracking of ownership structures, including Assured entities and Ultimate Beneficial Owners (UBOs) for each vessel.
- **Entity Directory**: Cross-reference entities to see every vessel they are associated with (as an Assured or UBO).
- **Advanced Sorting**: Customizable global document ordering with priority sorting (Required documents always at the top).
- **Fleet Management**: Organize vessels into fleets for better reporting and management. Includes detailed fleet views and one-click exports.
- **Responsive Design**: Premium glassmorphic UI that scales to any screen size.

## Database Setup
The application uses a MySQL database.
1. **Configuration**: On first launch, an Admin must enter the database credentials (Host, Port, User, Password, DB Name).
2. **Storage**: These settings are saved locally to `db-config.json` (currently in `Documents/Coding/vessel-compliance/db`).
3. **Users**: The first run creates a default admin (`admin` / `admin123`). Change this password immediately after logging in.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
