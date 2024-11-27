studio.menu.addMenuItem({
    name: "Scripts\\Batch Import Audio Files",
    execute: function () {
        function normalizePath(path) {
            return path.replace(/\\/g, '/');
        }

        // Add log handling
        function writeLog(path, content) {
            try {
                var logFile = studio.system.getFile(path + "/fmod_import_log.txt");
                logFile.open(studio.system.openMode.WriteOnly);
                logFile.writeText(content);
                logFile.close();
                return true;
            } catch (error) {
                studio.system.message("Error writing log file: " + error);
                return false;
            }
        }

        function formatLogEntry(status, file, reason) {
            var date = new Date();
            return date.toLocaleTimeString() + " - " + status + ": " + file + (reason ? " (" + reason + ")" : "") + "\n";
        }

        // Original functions with tracking for skipped/failed files
        var folderCache = {}; // Global folder cache

function createEventFolder(path, rootFolder) {
    // Normalize and clean path
    var cleanPath = path.replace(/\\/g, '/').trim();
    if (!cleanPath) return rootFolder;

    // Split path into folder names
    var folderNames = cleanPath.split('/').filter(function(f) { return f.length > 0; });
    var currentPath = "";
    var currentFolder = rootFolder;

    // Create/find each folder in path
    for (var i = 0; i < folderNames.length; i++) {
        currentPath += (currentPath ? "/" : "") + folderNames[i];

        // Check cache first
        if (folderCache[currentPath]) {
            currentFolder = folderCache[currentPath];
            continue;
        }

        // Look for existing folder at current level
        var existingFolder = null;
        for (var j = 0; j < currentFolder.items.length; j++) {
            if (currentFolder.items[j].type === 'EventFolder' &&
                currentFolder.items[j].name === folderNames[i]) {
                existingFolder = currentFolder.items[j];
                break;
            }
        }

        // Create new folder if not found
        if (!existingFolder) {
            existingFolder = studio.project.create('EventFolder');
            existingFolder.name = folderNames[i];
            existingFolder.folder = currentFolder;
        }

        // Cache and update current folder
        folderCache[currentPath] = existingFolder;
        currentFolder = existingFolder;
    }

    return currentFolder;
}

        function getBaseNameAndType(filename) {
            // Simple extension removal
            var baseName = filename;
            var dotIndex = filename.lastIndexOf('.');
            if (dotIndex !== -1) {
                baseName = filename.substring(0, dotIndex);
            }

            // Check for 3D first
            var isSpatial = baseName.indexOf('_3d') !== -1;

            // Then check for multi/scatter
            if (baseName.indexOf('_multi_') !== -1) {
                return {
                    baseName: baseName.split('_multi_')[0],
                    type: isSpatial ? 'multi_spatial' : 'multi'
                };
            } else if (baseName.indexOf('_scat_') !== -1) {
                return {
                    baseName: baseName.split('_scat_')[0],
                    type: 'scatter'  // Scatter is always 3D
                };
            } else {
                return {
                    baseName: baseName,
                    type: isSpatial ? 'spatial' : 'single'
                };
            }
        }

        function createEventFromGroup(group, rootPath, logEntries) {
            try {
                var targetFolder = group.folderPath ?
                    createEventFolder(group.folderPath, studio.project.workspace.masterEventFolder) :
                    studio.project.workspace.masterEventFolder;

                // Check for existing event before creating
                var events = studio.project.model.Event.findInstances();
                if (events.filter(function(a) { return a.name === group.baseName; }).length > 0) {
                    logEntries.push(formatLogEntry("SKIPPED", group.baseName, "Event already exists"));
                    return false;
                }

                var event = studio.project.create("Event");
                event.name = group.baseName;
                event.folder = targetFolder;

                var track = event.addGroupTrack();

                if (group.type.indexOf('multi') !== -1) {
                    var multiSound = track.addSound(event.timeline, 'MultiSound', 0, 10);
                    multiSound.name = group.baseName;

                    // Add variations with logging
                    group.files.forEach(function(filePath) {
                        var asset = studio.project.importAudioFile(filePath);
                        if (asset) {
                            var singleSound = studio.project.create('SingleSound');
                            singleSound.audioFile = asset;
                            singleSound.owner = multiSound;
                            logEntries.push(formatLogEntry("ADDED", filePath, "Added to multi sound"));
                        } else {
                            logEntries.push(formatLogEntry("FAILED", filePath, "Failed to import audio"));
                        }
                    });
                }
                else if (group.type === 'scatter') {
                    var scattererSound = track.addSound(event.timeline, 'SoundScatterer', 0, 10);
                    scattererSound.name = group.baseName;

                    // Add variations with logging
                    group.files.forEach(function(filePath) {
                        var asset = studio.project.importAudioFile(filePath);
                        if (asset) {
                            var singleSound = studio.project.create('SingleSound');
                            singleSound.audioFile = asset;
                            singleSound.owner = scattererSound.sound;
                            logEntries.push(formatLogEntry("ADDED", filePath, "Added to scatter sound"));
                        } else {
                            logEntries.push(formatLogEntry("FAILED", filePath, "Failed to import audio"));
                        }
                    });
                }
                else {
                    var sound = track.addSound(event.timeline, 'SingleSound', 0, 10);
                    var asset = studio.project.importAudioFile(group.files[0]);
                    if (asset) {
                        sound.audioFile = asset;
                        sound.length = asset.length;
                        sound.name = group.baseName;
                        logEntries.push(formatLogEntry("ADDED", group.files[0], "Created single sound"));
                    } else {
                        logEntries.push(formatLogEntry("FAILED", group.files[0], "Failed to import audio"));
                        return false;
                    }
                }

                if (group.type.indexOf('spatial') !== -1 || group.type === 'scatter') {
                    event.masterTrack.mixerGroup.effectChain.addEffect('SpatialiserEffect');
                    logEntries.push(formatLogEntry("INFO", group.baseName, "Added spatializer"));
                }

                logEntries.push(formatLogEntry("SUCCESS", group.baseName, "Event created successfully"));
                return true;
            } catch (error) {
                logEntries.push(formatLogEntry("ERROR", group.baseName, error.toString()));
                return false;
            }
        }

        function collectAudioFiles(dirPath) {
            dirPath = normalizePath(dirPath);
            var audioFiles = [];

            try {
                var entries = studio.system.readDir(dirPath);

                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    if (entry === "." || entry === "..") continue;

                    var fullPath = dirPath + "/" + entry;

                    if (entry.toLowerCase().match(/\.(wav|mp3|ogg|aif|aiff|flac)$/)) {
                        audioFiles.push(fullPath);
                    } else {
                        try {
                            var subEntries = studio.system.readDir(fullPath);
                            if (subEntries) {
                                audioFiles = audioFiles.concat(collectAudioFiles(fullPath));
                            }
                        } catch (e) {
                            // Not a directory, ignore
                        }
                    }
                }

                return audioFiles;

            } catch (error) {
                studio.system.message("Error scanning directory: " + error);
                return audioFiles;
            }
        }

        function groupFiles(files, rootPath) {
            var groups = {};

            files.forEach(function(filePath) {
                var relPath = filePath.substring(rootPath.length + 1);
                var lastSlash = relPath.lastIndexOf('/');
                var folderPath = lastSlash !== -1 ? relPath.substring(0, lastSlash) : "";
                var filename = lastSlash !== -1 ? relPath.substring(lastSlash + 1) : relPath;

                var info = getBaseNameAndType(filename);
                var key = (folderPath ? folderPath + '/' : '') + info.baseName + '|' + info.type;

                if (!groups[key]) {
                    groups[key] = {
                        baseName: info.baseName,
                        type: info.type,
                        folderPath: folderPath,
                        files: []
                    };
                }
                groups[key].files.push(filePath);
            });

            return groups;
        }

        studio.ui.showModalDialog({
            windowTitle: "Batch Import Audio Files",
            windowWidth: 500,
            windowHeight: 300,
            widgetType: studio.ui.widgetType.Layout,
            layout: studio.ui.layoutType.VBoxLayout,
            items: [
                {
                    widgetType: studio.ui.widgetType.Label,
                    text: "Select folder containing audio files:"
                },
                {
                    widgetType: studio.ui.widgetType.PathLineEdit,
                    widgetId: "m_folderPath",
                    pathType: studio.ui.pathType.Directory
                },
                {
                    widgetType: studio.ui.widgetType.Label,
                    text: "\nSupported naming patterns:\n" +
                          "filename.*           (Creates single sound event)\n" +
                          "filename_3d.*        (Creates single sound event with spatializer)\n" +
                          "filename_multi_1.*   (Creates multi sound event)\n" +
                          "filename_multi_2.*   (Additional variations)\n" +
                          "filename_multi_1_3d.* (Creates multi sound event with spatializer)\n" +
                          "filename_scat_1.*    (Creates scatter sound event - always 3D)\n" +
                          "filename_scat_2.*    (Additional variations)\n\n" +
                          "Supported formats: .wav, .mp3, .ogg, .aif, .aiff, .flac\n" +
                          "Folder structure will be maintained."
                },
                {
                    widgetType: studio.ui.widgetType.PushButton,
                    text: "Import",
                    onClicked: function() {
                        var path = this.findWidget("m_folderPath").text();
                        if (!path) return;

                        path = normalizePath(path);
                        this.closeDialog();

                        var logEntries = [];
                        logEntries.push(formatLogEntry("START", "Import process started", "Source folder: " + path));

                        var audioFiles = collectAudioFiles(path);

                        if (audioFiles.length === 0) {
                            studio.system.message("No supported audio files found in the selected directory.");
                            return;
                        }

                        var groups = groupFiles(audioFiles, path);
                        var groupCount = Object.keys(groups).length;

                        if (!studio.system.question("Found " + audioFiles.length + " audio files that will create " +
                            groupCount + " events.\n\nContinue with import?")) {
                            return;
                        }

                        var successCount = 0;
                        var skipCount = 0;
                        var failCount = 0;
                        var groupKeys = Object.keys(groups);

                        for (var i = 0; i < groupKeys.length; i++) {
                            if (createEventFromGroup(groups[groupKeys[i]], path, logEntries)) {
                                successCount++;
                            } else {
                                // Check if it was skipped or failed
                                var lastLog = logEntries[logEntries.length - 1];
                                if (lastLog.indexOf("SKIPPED") !== -1) {
                                    skipCount++;
                                } else {
                                    failCount++;
                                }
                            }
                        }

                        // Add summary to log
                        logEntries.push("\nSUMMARY:\n");
                        logEntries.push("Total files processed: " + audioFiles.length + "\n");
                        logEntries.push("Events created: " + successCount + "\n");
                        logEntries.push("Events skipped: " + skipCount + "\n");
                        logEntries.push("Failed imports: " + failCount + "\n");

                        // Write log file
                        if (skipCount > 0 || failCount > 0) {
    writeLog(path, logEntries.join(""));
    studio.system.message("Import complete with issues!\n" +
        "Successfully created: " + successCount + "\n" +
        "Skipped (already exist): " + skipCount + "\n" +
        "Failed: " + failCount + "\n\n" +
        "See fmod_import_log.txt in source folder for details.");
} else {
    studio.system.message("Import complete without issues!\n" +
        "Successfully created: " + successCount);
}
                    }
                }
            ]
        });
    }
});
