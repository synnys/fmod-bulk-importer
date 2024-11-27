# FMOD Studio Batch Audio Import Script

A JavaScript automation script for FMOD Studio that streamlines the process of creating events from audio files. This script can automatically create single sound events, multi-sound events with variations, scatter sound events, and add spatializer effects and loop regions based on filename patterns.

## Features

- Batch import multiple audio files at once
- Automatically create different event types based on filename patterns
- Support for all FMOD-compatible audio formats (.wav, .mp3, .ogg, .aif, .aiff, .flac)
- Maintain source folder structure in FMOD Studio
- Create loop regions automatically
- Detailed import logs
- Skip existing events instead of overwriting

## Installation

1. Download the `fmod-audio-importer.js` file
2. Place it in your FMOD Studio scripts folder:
   - Windows: `%APPDATA%\FMOD Studio\Scripts\`
   - macOS: `~/Library/Application Support/FMOD Studio/Scripts/`
3. Restart FMOD Studio or reload scripts

## Usage

1. In FMOD Studio, go to `Scripts > Batch Import Audio Files`
2. Select a folder containing your audio files
3. Confirm the import
4. Check the generated log file in your source folder for details

## Naming Conventions

The script uses specific filename patterns to determine how to create events:

### Single Sound Events
- `filename.wav` - Creates a basic single sound event
- `filename_3d.wav` - Creates a single sound event with spatializer
- `loop_filename.wav` - Creates a single sound event with loop region
- `loop_filename_3d.wav` - Creates a single sound with both spatializer and loop region

### Multi Sound Events
- `filename_multi_1.wav` - Creates a multi sound event (first variation)
- `filename_multi_2.wav` - Additional variations of the same event
- `loop_filename_multi_1.wav` - Creates a multi sound event with loop region

### Scatter Sound Events (Always 3D)
- `filename_scat_1.wav` - Creates a scatter sound event (first variation)
- `filename_scat_2.wav` - Additional variations of the same event
- `loop_filename_scat_1.wav` - Creates a scatter sound event with loop region

## Generated Files

The script creates a log file (`fmod_import_log.txt`) in your source folder containing:
- List of all processed files
- Success/failure status for each event
- Error messages if any
- Summary of the import process

## Error Handling

- The script will skip existing events instead of overwriting them
- Failed imports are logged but won't stop the process
- Detailed error messages are provided in the log file

## Examples

```
Source Folder Structure:
my_sounds/
├── footsteps/
│   ├── footstep_multi_1.wav
│   ├── footstep_multi_2.wav
│   └── footstep_multi_3.wav
├── ambient/
│   ├── wind_3d.wav
│   └── rain_scat_1.wav
└── music/
    ├── loop_background.wav
    └── loop_battle_multi_1.wav

Will create in FMOD:
Events/
├── footsteps/
│   └── footstep (Multi Sound Event with 3 variations)
├── ambient/
│   ├── wind (Single Sound Event with spatializer)
│   └── rain (Scatter Sound Event)
└── music/
    ├── background (Single Sound Event with loop region)
    └── battle (Multi Sound Event with loop region)
```

## Requirements

- FMOD Studio 2.00 or later
- Basic understanding of FMOD Studio event types

## Contributing

Feel free to submit issues, fork the repository and create pull requests for any improvements.

## License

[Your chosen license]

## Acknowledgments

- Inspired by [GitHub app reference]
- Built for the FMOD Studio community
