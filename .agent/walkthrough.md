# Vessel Compliance App - Phase 4 & 5 Walkthrough

I've implemented several system-level enhancements and the highly requested Light Mode.

## Key Changes

### 1. Light & Dark Mode
The application now supports a full **Light Mode** theme.
- **Theme Toggle**: A new Sun/Moon icon in the sidebar allows for instant switching.
- **Persistence**: Your theme preference is saved per user, so the app always opens in your preferred mode.
- **Improved Visibility**: The light theme is optimized for high-brightness environments while maintaining the premium glassmorphic feel.

### 2. "Remember Me" & Session Persistence
- **Automatic Login**: You are no longer prompted to log in every time you open the app. Your session is securely maintained.
- **Window Memory**: The app remembers its last size and position on your screen.

### 3. Portable Database Discovery
The app is now smarter about finding its configuration, making it perfect for multi-user setups on shared network drives.
- **Portable Mode**: If you place `db-config.json` in the same folder as the app executable, it connects automatically for every user.
- **Custom Location**: If no portable file exists, it remembers your specific folder choice from the initial setup screen.

### 4. Multi-Fleet Dashboard
The main dashboard now provides a global compliance overview alongside a fleet-by-fleet breakdown.
- **Compliance by Fleet**: A new section featuring visual cards for each fleet.
- **Unassigned Vessels**: Vessels not currently in a fleet are tracked as a separate group to ensure 100% monitoring coverage.

## How to Test
1. **Theme**: Use the Sun/Moon toggle in the sidebar to switch themes.
2. **Session**: Log in, close the app, and re-open. You should land directly on the Dashboard.
3. **Window**: Resize the window and restart; it should maintain its dimensions.
4. **Dashboard**: Navigate to Home to see the new **Compliance by Fleet** cards.
