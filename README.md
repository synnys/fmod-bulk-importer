# FMOD Studio Batch Audio Import Script

A JavaScript automation script for FMOD Studio that streamlines the process of creating events from audio files. Based on filename patterns, the script automatically creates single sound events, multi-sound events with variations, and scatter sound events, and can add spatialiser effects and loop regions.

## Features

- Batch import multiple audio files at once
- Automatically create different event types based on filename patterns
- Support for all FMOD-compatible audio formats (.wav, .mp3, .ogg, .aif, .aiff, .flac)
- Preserves source folder structure in FMOD Studio (up to 10 levels deep)
- Automatically adds spatialiser effects for 3D sounds
- Automatically creates loop regions
- Preview mode — see what events would be created before committing
- Conflict resolution — choose Skip, Overwrite, or Rename when events already exist
- Detailed import log saved to source folder on issues

## Installation

1. Download `fmod_batch_import.js`
2. Place it in your FMOD Studio scripts folder:
   - Windows: `%localappdata%/FMOD Studio/Scripts/`
   - macOS: `~/Library/Preferences/FMOD Studio/Scripts/`
   - Linux: `~/.config/fmod-studio/Scripts/`
3. In FMOD Studio, select **Scripts > Reload** (or restart the application)

> **Note:** You can also place the script in your project's `Scripts/` folder if you only need it for a specific project, or in the built-in scripts directory to share it across all users on the same machine (note: the built-in directory is wiped on application updates).

## Usage

1. In FMOD Studio, go to **Scripts > Batch Import Audio Files**
2. Browse to a folder containing your audio files
3. Optionally click **Preview** to see what events would be created
4. Set the conflict mode if needed (Skip / Overwrite / Rename)
5. Click **Import** and confirm
6. If any issues occur, check `fmod_import_log.txt` in your source folder

## Naming Conventions

The script determines event type and behaviour from filename suffixes. Suffixes can be combined.

### Single sound events
| Pattern | Result |
|---|---|
| `filename.wav` | Single sound event |
| `filename_3d.wav` | Single sound event + spatialiser |
| `filename_loop.wav` | Single sound event + loop region |
| `filename_3d_loop.wav` | Single sound event + spatialiser + loop region |

### Multi sound events
Files sharing the same base name before `_multi_` are grouped into one event with multiple variations. The event plays a random variation on each trigger.

| Pattern | Result |
|---|---|
| `filename_multi_1.wav`, `filename_multi_2.wav`, ... | Multi sound event with N variations |
| `filename_multi_1_3d.wav`, ... | Multi sound event + spatialiser |
| `filename_multi_1_loop.wav`, ... | Multi sound event + loop region |

### Scatter sound events
Files sharing the same base name before `_scat_` are grouped into one scatter sound event. Scatter events are always 3D.

| Pattern | Result |
|---|---|
| `filename_scat_1.wav`, `filename_scat_2.wav`, ... | Scatter sound event with N variations |
| `filename_scat_1_loop.wav`, ... | Scatter sound event + loop region |

## Conflict resolution

When an event with the same name already exists in the same folder, the script offers three modes:

- **Skip** — leaves the existing event untouched and moves on (default)
- **Overwrite** — deletes the existing event and recreates it from the imported files
- **Rename** — keeps the existing event and creates a new one with a number appended (e.g. `Footstep_1`)

## Folder structure

The script recursively scans the selected folder and preserves the subfolder hierarchy as event folders in FMOD Studio. Up to 10 levels of nesting are supported.

```
Source folder:
my_sounds/
├── footsteps/
│   ├── footstep_multi_1.wav
│   ├── footstep_multi_2.wav
│   └── footstep_multi_3.wav
├── ambient/
│   ├── wind_3d_loop.wav
│   └── rain_scat_1.wav
│   └── rain_scat_2.wav
└── ui/
    └── button_click.wav

Created in FMOD Studio:
Events/
├── footsteps/
│   └── footstep  (Multi sound, 3 variations)
├── ambient/
│   ├── wind      (Single sound, spatialiser, loop region)
│   └── rain      (Scatter sound, 2 variations)
└── ui/
    └── button_click  (Single sound)
```

## Log file

When any imports are skipped or fail, the script writes `fmod_import_log.txt` to the source folder. Each entry is timestamped and includes a status (SUCCESS, ADDED, SKIPPED, FAILED, WARN, ERROR) and a reason.

## Requirements

- FMOD Studio 2.00 or later
