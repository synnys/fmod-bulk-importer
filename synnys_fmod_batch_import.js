studio.menu.addMenuItem({
    name: "Scripts\\SynnyS Batch Import Audio Files",
    execute: function () {

        // -------------------------------------------------------------------------
        // UTILITIES
        // -------------------------------------------------------------------------

        function normalizePath(path) {
            return path.replace(/\\/g, '/');
        }

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
            return date.toLocaleTimeString() + " - " + status + ": " + file +
                   (reason ? " (" + reason + ")" : "") + "\n";
        }

        // -------------------------------------------------------------------------
        // FILE COLLECTION
        // -------------------------------------------------------------------------

        var MAX_DEPTH = 10;

        function isDirectory(fullPath) {
            // Prefer a direct API check if available; fall back to readDir attempt
            if (typeof studio.system.isDirectory === 'function') {
                return studio.system.isDirectory(fullPath);
            }
            try {
                studio.system.readDir(fullPath);
                return true;
            } catch (e) {
                return false;
            }
        }

        function collectAudioFiles(dirPath, depth) {
            if (depth === undefined) depth = 0;
            if (depth > MAX_DEPTH) return [];

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
                    } else if (isDirectory(fullPath)) {
                        audioFiles = audioFiles.concat(collectAudioFiles(fullPath, depth + 1));
                    }
                }
            } catch (error) {
                studio.system.message("Error scanning directory: " + error);
            }

            return audioFiles;
        }

        // -------------------------------------------------------------------------
        // NAMING CONVENTION PARSER
        //
        // Supported suffixes (case-insensitive, can combine):
        //   _3d      spatial / spatialiser effect
        //   _loop    set loop region on timeline
        //   _multi_N random multi-sound instrument
        //   _scat_N  sound scatterer (always 3D)
        // -------------------------------------------------------------------------

        function getBaseNameAndType(filename) {
            var dotIndex = filename.lastIndexOf('.');
            var baseName = dotIndex !== -1 ? filename.substring(0, dotIndex) : filename;
            var lower = baseName.toLowerCase();

            var flags = {
                is3d:   lower.indexOf('_3d')   !== -1,
                isLoop: lower.indexOf('_loop') !== -1
            };

            // Determine instrument type and strip suffix cluster from base name
            var type, cleanBase;

            var multiMatch = baseName.match(/^(.+?)_multi_\d+/i);
            var scatMatch  = baseName.match(/^(.+?)_scat_\d+/i);

            if (multiMatch) {
                cleanBase = multiMatch[1];
                type = 'multi';
            } else if (scatMatch) {
                cleanBase = scatMatch[1];
                type = 'scatter'; // Scatter is always 3D
                flags.is3d = true;
            } else {
                // Strip known flag suffixes from single-file names
                cleanBase = baseName
                    .replace(/_3d/gi, '')
                    .replace(/_loop/gi, '')
                    .replace(/_+$/, ''); // trim trailing underscores
                type = 'single';
            }

            return { baseName: cleanBase, type: type, flags: flags };
        }

        // -------------------------------------------------------------------------
        // FILE GROUPING
        // -------------------------------------------------------------------------

        function groupFiles(files, rootPath) {
            var groups = {};

            files.forEach(function (filePath) {
                var relPath  = filePath.substring(rootPath.length + 1);
                var lastSlash  = relPath.lastIndexOf('/');
                var folderPath = lastSlash !== -1 ? relPath.substring(0, lastSlash) : "";
                var filename   = lastSlash !== -1 ? relPath.substring(lastSlash + 1) : relPath;

                var info = getBaseNameAndType(filename);
                var key  = (folderPath ? folderPath + '/' : '') + info.baseName + '|' + info.type;

                if (!groups[key]) {
                    groups[key] = {
                        baseName:   info.baseName,
                        type:       info.type,
                        flags:      info.flags,
                        folderPath: folderPath,
                        files:      []
                    };
                }
                groups[key].files.push(filePath);
            });

            return groups;
        }

        // -------------------------------------------------------------------------
        // FOLDER CREATION
        // -------------------------------------------------------------------------

        // Cache scoped to this import session to avoid redundant lookups
        var folderCache = {};

        function createEventFolder(path, rootFolder) {
            var cleanPath   = path.replace(/\\/g, '/').trim();
            if (!cleanPath) return rootFolder;

            var folderNames = cleanPath.split('/').filter(function (f) { return f.length > 0; });
            var currentPath = "";
            var currentFolder = rootFolder;

            for (var i = 0; i < folderNames.length; i++) {
                currentPath += (currentPath ? "/" : "") + folderNames[i];

                if (folderCache[currentPath]) {
                    currentFolder = folderCache[currentPath];
                    continue;
                }

                var existingFolder = null;
                for (var j = 0; j < currentFolder.items.length; j++) {
                    if (currentFolder.items[j].type === 'EventFolder' &&
                        currentFolder.items[j].name === folderNames[i]) {
                        existingFolder = currentFolder.items[j];
                        break;
                    }
                }

                if (!existingFolder) {
                    existingFolder = studio.project.create('EventFolder');
                    existingFolder.name   = folderNames[i];
                    existingFolder.folder = currentFolder;
                }

                folderCache[currentPath] = existingFolder;
                currentFolder = existingFolder;
            }

            return currentFolder;
        }

        // -------------------------------------------------------------------------
        // DUPLICATE CHECK
        // Checks both name AND folder path to avoid false positives
        // -------------------------------------------------------------------------

        function eventExistsInFolder(name, targetFolder) {
            var events = studio.project.model.Event.findInstances();
            for (var i = 0; i < events.length; i++) {
                if (events[i].name === name && events[i].folder === targetFolder) {
                    return true;
                }
            }
            return false;
        }

        // -------------------------------------------------------------------------
        // ASSET LENGTH HELPER
        // Returns the length of the longest asset in a list of file paths
        // -------------------------------------------------------------------------

        function getLongestAssetLength(filePaths) {
            var maxLength = 10; // fallback default
            filePaths.forEach(function (filePath) {
                try {
                    var asset = studio.project.importAudioFile(filePath);
                    if (asset && asset.length && asset.length > maxLength) {
                        maxLength = asset.length;
                    }
                } catch (e) { /* ignore */ }
            });
            return maxLength;
        }

        // -------------------------------------------------------------------------
        // EVENT CREATION
        //
        // conflictMode: 'skip' | 'overwrite' | 'rename'
        // -------------------------------------------------------------------------

        function createEventFromGroup(group, conflictMode, logEntries) {
            try {
                var targetFolder = group.folderPath
                    ? createEventFolder(group.folderPath, studio.project.workspace.masterEventFolder)
                    : studio.project.workspace.masterEventFolder;

                var eventName = group.baseName;

                // --- Conflict resolution ---
                if (eventExistsInFolder(eventName, targetFolder)) {
                    if (conflictMode === 'skip') {
                        logEntries.push(formatLogEntry("SKIPPED", eventName, "Event already exists"));
                        return 'skipped';
                    } else if (conflictMode === 'overwrite') {
                        // Remove existing event
                        var existing = studio.project.model.Event.findInstances().filter(function (e) {
                            return e.name === eventName && e.folder === targetFolder;
                        });
                        if (existing.length > 0) {
                            existing[0].isDestroyed = true;
                            logEntries.push(formatLogEntry("INFO", eventName, "Removed existing event for overwrite"));
                        }
                    } else if (conflictMode === 'rename') {
                        var counter = 1;
                        while (eventExistsInFolder(eventName + "_" + counter, targetFolder)) {
                            counter++;
                        }
                        eventName = eventName + "_" + counter;
                        logEntries.push(formatLogEntry("INFO", group.baseName, "Renamed to " + eventName));
                    }
                }

                // --- Create event ---
                var event = studio.project.create("Event");
                event.name   = eventName;
                event.folder = targetFolder;

                var track = event.addGroupTrack();
                var flags = group.flags;

                // --- Instrument setup ---
                var resolvedLength = 10; // fallback, updated per instrument type below
                if (group.type === 'multi') {
                    var eventLength = getLongestAssetLength(group.files);
                    resolvedLength = eventLength;
                    var multiSound  = track.addSound(event.timeline, 'MultiSound', 0, eventLength);
                    multiSound.name = eventName;

                    group.files.forEach(function (filePath) {
                        var asset = studio.project.importAudioFile(filePath);
                        if (asset) {
                            var singleSound       = studio.project.create('SingleSound');
                            singleSound.audioFile = asset;
                            singleSound.owner     = multiSound;
                            logEntries.push(formatLogEntry("ADDED", filePath, "Added to multi sound"));
                        } else {
                            logEntries.push(formatLogEntry("FAILED", filePath, "Failed to import audio"));
                        }
                    });

                } else if (group.type === 'scatter') {
                    var eventLength      = getLongestAssetLength(group.files);
                    resolvedLength = eventLength;
                    var scattererSound   = track.addSound(event.timeline, 'SoundScatterer', 0, eventLength);
                    scattererSound.name  = eventName;

                    group.files.forEach(function (filePath) {
                        var asset = studio.project.importAudioFile(filePath);
                        if (asset) {
                            var singleSound       = studio.project.create('SingleSound');
                            singleSound.audioFile = asset;
                            // scattererSound.sound holds the MultiSound inside the scatterer
                            try {
                                singleSound.owner = scattererSound.sound;
                            } catch (e) {
                                // Fallback: some versions expose it differently
                                singleSound.owner = scattererSound;
                                logEntries.push(formatLogEntry("WARN", filePath, "Used fallback scatterer ownership"));
                            }
                            logEntries.push(formatLogEntry("ADDED", filePath, "Added to scatter sound"));
                        } else {
                            logEntries.push(formatLogEntry("FAILED", filePath, "Failed to import audio"));
                        }
                    });

                } else {
                    // Single sound
                    var asset = studio.project.importAudioFile(group.files[0]);
                    if (asset) {
                        resolvedLength = asset.length || 10;
                        var sound      = track.addSound(event.timeline, 'SingleSound', 0, resolvedLength);
                        sound.audioFile = asset;
                        sound.length    = resolvedLength;
                        sound.name      = eventName;
                        logEntries.push(formatLogEntry("ADDED", group.files[0], "Created single sound"));
                    } else {
                        logEntries.push(formatLogEntry("FAILED", group.files[0], "Failed to import audio"));
                        return 'failed';
                    }
                }

                // --- Spatialiser ---
                if (flags.is3d) {
                    event.masterTrack.mixerGroup.effectChain.addEffect('SpatialiserEffect');
                    logEntries.push(formatLogEntry("INFO", eventName, "Added spatialiser"));
                }

                // --- Loop region ---
                // Source: FMOD staff example (qa.fmod.com/t/21891)
                // LoopRegion must be created as a project object and assigned
                // a MarkerTrack, timeline, and selector (the event).
                if (flags.isLoop) {
                    try {
                        var loopMarkerTrack = studio.project.create("MarkerTrack");
                        loopMarkerTrack.event = event;

                        if (loopMarkerTrack.isValid) {
                            var loopRegion = studio.project.create("LoopRegion");
                            loopRegion.position   = 0;
                            loopRegion.length     = resolvedLength;
                            loopRegion.selector   = event;
                            loopRegion.timeline   = event.timeline;
                            loopRegion.markerTrack = loopMarkerTrack;

                            if (loopRegion.isValid) {
                                logEntries.push(formatLogEntry("INFO", eventName, "Set loop region (length: " + resolvedLength + ")"));
                            } else {
                                studio.project.deleteObject(loopRegion);
                                logEntries.push(formatLogEntry("WARN", eventName, "Loop region created but invalid, deleted"));
                            }
                        } else {
                            studio.project.deleteObject(loopMarkerTrack);
                            logEntries.push(formatLogEntry("WARN", eventName, "Could not create marker track for loop region"));
                        }
                    } catch (e) {
                        logEntries.push(formatLogEntry("WARN", eventName, "Could not set loop region: " + e));
                    }
                }

                logEntries.push(formatLogEntry("SUCCESS", eventName, "Event created successfully"));
                return 'success';

            } catch (error) {
                logEntries.push(formatLogEntry("ERROR", group.baseName, error.toString()));
                return 'failed';
            }
        }

        // -------------------------------------------------------------------------
        // DRY RUN PREVIEW
        // -------------------------------------------------------------------------

        function buildPreviewText(groups, conflictMode) {
            var lines = [];
            var groupKeys = Object.keys(groups);

            groupKeys.forEach(function (key) {
                var g = groups[key];
                var folder = g.folderPath || "(root)";
                var flagList = [];
                if (g.flags.is3d)   flagList.push("3D");
                if (g.flags.isLoop) flagList.push("loop");
                var flagStr = flagList.length ? " [" + flagList.join(", ") + "]" : "";

                var typeLabel = {
                    single:  "Single",
                    multi:   "Multi (" + g.files.length + " variations)",
                    scatter: "Scatter (" + g.files.length + " variations)"
                }[g.type] || g.type;

                lines.push(folder + " / " + g.baseName + "  —  " + typeLabel + flagStr);
            });

            return lines.join("\n");
        }

        // -------------------------------------------------------------------------
        // MAIN DIALOG
        // -------------------------------------------------------------------------

        studio.ui.showModalDialog({
            windowTitle: "SynnyS Batch Import Audio Files",
            windowWidth: 560,
            windowHeight: 500,
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
                    text: "Naming conventions:\n" +
                          "  filename.*             Single sound event\n" +
                          "  filename_3d.*          Single + spatialiser\n" +
                          "  filename_loop.*        Set loop region\n" +
                          "  filename_multi_1.*     Multi random\n" +
                          "  filename_scat_1.*      Scatter (always 3D)\n" +
                          "  Suffixes combine: e.g. filename_multi_1_3d_loop.*\n" +
                          "  Formats: .wav .mp3 .ogg .aif .aiff .flac\n" +
                          "  Subfolder structure is preserved (up to 10 levels deep)"
                },
                {
                    widgetType: studio.ui.widgetType.Label,
                    text: "If event already exists:"
                },
                {
                    widgetType: studio.ui.widgetType.PushButton,
                    widgetId: "m_conflict_skip",
                    text: "[X] Skip",
                    onClicked: function () {
                        this.findWidget("m_conflict_skip").setText("[X] Skip");
                        this.findWidget("m_conflict_overwrite").setText("[ ] Overwrite");
                        this.findWidget("m_conflict_rename").setText("[ ] Rename");
                    }
                },
                {
                    widgetType: studio.ui.widgetType.PushButton,
                    widgetId: "m_conflict_overwrite",
                    text: "[ ] Overwrite",
                    onClicked: function () {
                        this.findWidget("m_conflict_skip").setText("[ ] Skip");
                        this.findWidget("m_conflict_overwrite").setText("[X] Overwrite");
                        this.findWidget("m_conflict_rename").setText("[ ] Rename");
                    }
                },
                {
                    widgetType: studio.ui.widgetType.PushButton,
                    widgetId: "m_conflict_rename",
                    text: "[ ] Rename",
                    onClicked: function () {
                        this.findWidget("m_conflict_skip").setText("[ ] Skip");
                        this.findWidget("m_conflict_overwrite").setText("[ ] Overwrite");
                        this.findWidget("m_conflict_rename").setText("[X] Rename");
                    }
                },
                {
                    widgetType: studio.ui.widgetType.PushButton,
                    text: "Preview",
                    onClicked: function () {
                        var path = this.findWidget("m_folderPath").text();
                        if (!path) {
                            studio.system.message("Please select a folder first.");
                            return;
                        }
                        path = normalizePath(path);
                        var audioFiles = collectAudioFiles(path);

                        if (audioFiles.length === 0) {
                            studio.system.message("No supported audio files found.");
                            return;
                        }

                        var groups    = groupFiles(audioFiles, path);
                        var groupKeys = Object.keys(groups);
                        var conflictMode = this.findWidget("m_conflict_overwrite").text().indexOf("[X]") !== -1 ? 'overwrite'
                                        : this.findWidget("m_conflict_rename").text().indexOf("[X]")    !== -1 ? 'rename'
                                        : 'skip';
                        var preview = buildPreviewText(groups, conflictMode);

                        studio.system.message(
                            "Found " + audioFiles.length + " file(s) -> " +
                            groupKeys.length + " event(s) would be created:\n\n" + preview
                        );
                    }
                },
                {
                    widgetType: studio.ui.widgetType.PushButton,
                    text: "Import",
                    onClicked: function () {
                        var path = this.findWidget("m_folderPath").text();
                        if (!path) {
                            studio.system.message("Please select a folder first.");
                            return;
                        }

                        path = normalizePath(path);
                        var conflictMode = this.findWidget("m_conflict_overwrite").text().indexOf("[X]") !== -1 ? 'overwrite'
                                        : this.findWidget("m_conflict_rename").text().indexOf("[X]")    !== -1 ? 'rename'
                                        : 'skip';
                        this.closeDialog();

                        var logEntries = [];
                        logEntries.push(formatLogEntry("START", "Import started", "Source: " + path + " | Conflict mode: " + conflictMode));

                        var audioFiles = collectAudioFiles(path);

                        if (audioFiles.length === 0) {
                            studio.system.message("No supported audio files found in the selected directory.");
                            return;
                        }

                        var groups    = groupFiles(audioFiles, path);
                        var groupKeys = Object.keys(groups);

                        if (!studio.system.question(
                            "Found " + audioFiles.length + " audio file(s) that will create " +
                            groupKeys.length + " event(s).\n" +
                            "Conflict mode: " + conflictMode + "\n\n" +
                            "Continue with import?"
                        )) {
                            return;
                        }

                        // Reset folder cache for this import run
                        folderCache = {};

                        var successCount = 0;
                        var skipCount    = 0;
                        var failCount    = 0;

                        for (var i = 0; i < groupKeys.length; i++) {
                            var result = createEventFromGroup(groups[groupKeys[i]], conflictMode, logEntries);
                            if      (result === 'success') successCount++;
                            else if (result === 'skipped') skipCount++;
                            else                           failCount++;
                        }

                        logEntries.push("\nSUMMARY\n");
                        logEntries.push("Total files:     " + audioFiles.length + "\n");
                        logEntries.push("Events created:  " + successCount + "\n");
                        logEntries.push("Events skipped:  " + skipCount + "\n");
                        logEntries.push("Failed imports:  " + failCount + "\n");

                        var hasIssues = skipCount > 0 || failCount > 0;
                        if (hasIssues) {
                            writeLog(path, logEntries.join(""));
                            studio.system.message(
                                "Import complete with issues.\n\n" +
                                "Created:  " + successCount + "\n" +
                                "Skipped:  " + skipCount + "\n" +
                                "Failed:   " + failCount + "\n\n" +
                                "See fmod_import_log.txt in source folder for details."
                            );
                        } else {
                            studio.system.message(
                                "Import complete.\n\nEvents created: " + successCount
                            );
                        }
                    }
                }
            ]
        });
    }
});
