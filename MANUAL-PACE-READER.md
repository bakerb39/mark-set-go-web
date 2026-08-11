MANUAL PACE READER MODE

Adds a new reader mode: Manual Pace.

Controls:
- Right Arrow: advance by current chunk size
- Left Arrow: move backward by current chunk size
- Shift + Right/Left: jump 5 chunks
- Existing chunk-size setting is reused
- Input/textarea/select/contenteditable fields are excluded from arrow interception

Behavior:
- Reuses the existing reader cursor and active-group highlight classes
- Does not add an autoplay loop or new rendering engine
- Does not replace pagination or Book Pages architecture
- Attempts to keep the stepped cursor visible using existing reader visibility helpers
- Tracks manual-session forward steps, backtracks, words advanced, average step interval, and current WPM
- Adds a small live status line for manual pace / backtracks when the mode control can be located

This patch is based on the latest Quick Book Guide + Prepare Me fix, preserving the restored dashboard, Reading List layout, Montesquieu guide, and recent fixes.
