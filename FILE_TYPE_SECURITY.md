# File Type Security Feature

## Overview
Administrators can now control which file types users can upload for vessel documents and passport/ID files through a centralized settings interface.

## Features

### Admin Configuration UI
Located in the Admin Panel, the "File Upload Security" section allows administrators to:

1. **Allowed File Types** (Whitelist)
   - Define specific file extensions that are permitted
   - If list is empty, all types are allowed (except blocked)
   - Common examples: `.pdf`, `.jpg`, `.png`, `.zip`, `.docx`

2. **Blocked File Types** (Blacklist)
   - Define file extensions that are always rejected
   - Takes priority over allowed list
   - Default blocked types: `.exe`, `.bat`, `.sh`, `.cmd`, `.app`, `.msi`, `.dll`, `.so`, `.dylib`, `.vbs`, `.ps1`

### Default Configuration
When first launched, the system comes with sensible defaults:

**Allowed:**
- `.pdf`, `.jpg`, `.jpeg`, `.png` (documents and images)
- `.doc`, `.docx`, `.xls`, `.xlsx` (Office documents)
- `.txt` (text files)
- `.zip` (archives)

**Blocked:**
- `.exe`, `.bat`, `.sh`, `.cmd`, `.app`, `.msi` (executables)
- `.dll`, `.so`, `.dylib` (libraries)
- `.vbs`, `.ps1` (scripts)

## Technical Implementation

### Backend (Main Process)
**Location:** `src/main/index.ts:166-205`

Three IPC handlers:
- `fileTypes:getSettings` - Retrieves current settings from MySQL database
- `fileTypes:setSettings` - Saves updated settings with normalization to database
- `fileTypes:validateFile` - Validates a file path against current rules from database

**Validation Logic:**
1. Extract file extension (case-insensitive)
2. Check if extension is in blocked list → REJECT
3. Check if allowed list exists and extension is not in it → REJECT
4. Otherwise → ACCEPT

### Frontend (Renderer Process)

**Admin UI:** `src/renderer/src/components/AdminPanel.tsx`
- Two-column layout for allowed/blocked extensions
- Add/remove functionality with visual feedback
- Real-time updates
- Status notifications

**Upload Validation:**
- `src/renderer/src/components/VesselDetail.tsx:95-99` - Vessel documents
- `src/renderer/src/components/AssuredManager.tsx:178-182` - Passport/ID files

### Storage

**Database Table:** `app_settings`

Settings are stored centrally in the MySQL database, ensuring all users share the same configuration:

```sql
CREATE TABLE app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(255)
);
```

The file type settings are stored as JSON under the key `fileTypeSettings`:
```json
{
  "allowedExtensions": [".pdf", ".jpg", ".zip"],
  "blockedExtensions": [".exe", ".bat", ".sh"]
}
```

**Database Methods:** `src/main/mysql/adapter.ts`
- `getFileTypeSettings()` - Retrieves settings, initializes defaults if not found
- `setFileTypeSettings(settings, updatedBy)` - Saves settings with timestamp tracking

### Security Features

1. **Extension Normalization**
   - Automatic conversion to lowercase
   - Adds leading dot if missing
   - Trims whitespace

2. **Priority System**
   - Blocked list takes precedence over allowed list
   - Cannot bypass blocks by adding to allowed list

3. **User-Friendly Errors**
   - Clear alert messages when files are rejected
   - Shows which extensions are allowed

4. **Admin-Only Control**
   - Only admins can access the settings
   - Regular users see rejections but cannot modify rules

## Centralized Configuration Benefits

1. **Shared Across All Users** - Admin sets rules once, applies to everyone
2. **Database Backed** - Settings are backed up with regular database backups
3. **Persistent** - Settings survive app reinstalls and updates
4. **Consistent** - No configuration drift between different installations
5. **Tracked** - Updated timestamp shows when settings were last changed

## Use Cases

### Example 1: Allow Archives
Admin wants to allow `.zip` files for bundled documents:
1. Navigate to Admin Panel
2. Scroll to "File Upload Security"
3. In "Allowed File Types", type `zip` or `.zip`
4. Click + button
5. **All users** can now upload ZIP files (change is immediate for everyone)

### Example 2: Block Potentially Dangerous Files
Admin wants to prevent upload of Python scripts:
1. Navigate to Admin Panel
2. In "Blocked File Types", type `.py`
3. Click the red + button
4. `.py` files are now rejected on upload

### Example 3: Strict Whitelist
Admin wants ONLY PDF and JPEG files:
1. Remove all allowed extensions except `.pdf`, `.jpg`, `.jpeg`
2. Ensure blocked list includes all dangerous types
3. Users can now only upload PDF and JPEG files

## API Reference

### Window API Methods

```typescript
// Get current settings
const settings = await window.api.fileTypesGetSettings()
// Returns: { allowedExtensions: string[], blockedExtensions: string[] }

// Update settings
const updated = await window.api.fileTypesSetSettings({
  allowedExtensions: ['.pdf', '.jpg'],
  blockedExtensions: ['.exe']
})

// Validate a file
const result = await window.api.fileTypesValidateFile('/path/to/file.pdf')
// Returns: { valid: boolean, reason?: string }
```

## Testing Checklist

- [ ] Admin can add allowed extensions
- [ ] Admin can remove allowed extensions
- [ ] Admin can add blocked extensions
- [ ] Admin can remove blocked extensions
- [ ] Extensions are normalized (lowercase, with dot)
- [ ] Duplicate extensions are prevented
- [ ] Blocked files are rejected on vessel document upload
- [ ] Blocked files are rejected on passport upload
- [ ] Allowed files are accepted
- [ ] User sees clear error message on rejection
- [ ] Settings persist across app restarts
- [ ] Blocked list takes priority over allowed list

## Future Enhancements

1. **MIME Type Validation**
   - Verify actual file content, not just extension
   - Prevent renamed malicious files

2. **File Size Limits**
   - Per-extension size limits
   - Global maximum file size

3. **Preset Templates**
   - "Documents Only" preset
   - "Images Only" preset
   - "Strict Security" preset

4. **Audit Logging**
   - Log all file rejections with timestamp
   - Track which users attempted blocked uploads

5. **Import/Export Settings**
   - Export configuration for backup
   - Import settings across installations
