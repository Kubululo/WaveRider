============================================================
  WaveRider — Drop any song. Ride the wave.
============================================================

WaveRider is a browser game, so it runs inside your web browser
(Chrome, Edge, Firefox). Because browsers block games from loading
directly off your disk for security reasons, this package includes a
tiny launcher that serves the game locally and opens it for you.

------------------------------------------------------------
  HOW TO RUN
------------------------------------------------------------

Windows:
  1. Double-click  start-windows.bat
  2. Your browser opens at  http://localhost:8765/
  3. To stop the game, close the small server window.

macOS / Linux:
  1. Open a terminal in this folder.
  2. Run:   ./start-macos-linux.sh
       (first time only, you may need:  chmod +x start-macos-linux.sh)
  3. Your browser opens at  http://localhost:8765/
  4. To stop the game, press Ctrl+C in the terminal.

The launcher uses Python 3 (or Node.js) to serve the files — most
systems already have one. If neither is found, install Python from
https://www.python.org/ and run the launcher again.

------------------------------------------------------------
  PLAYING
------------------------------------------------------------

  - Drag & drop any MP3 / WAV / OGG / FLAC / M4A file (max 20 MB),
    or click to browse.
  - Press START and surf!
  - Move lanes:  Left / Right arrows  or  A / D
  - Pause:       Esc

------------------------------------------------------------
  PREFER NO DOWNLOAD?
------------------------------------------------------------

The contents of the "app" folder are a plain static website. You can
also drop them on any static host (GitHub Pages, Netlify, itch.io,
your own server) and play in the browser with no launcher.

Source & updates:  https://github.com/Kubululo/WaveRider
License: MIT
