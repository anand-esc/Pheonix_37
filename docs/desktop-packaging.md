# Desktop packaging

Build each backend on its native operating system; PyInstaller does not
cross-compile Windows executables and Linux ELF binaries.

From `frontend/`, install the JavaScript build dependencies, then run one of:

```bash
npm run pack:win     # on Windows
npm run pack:linux   # on Linux
npm run dist         # creates installer artifacts for the current platform
```

The backend commands emit `backend/dist/forensic-backend.exe` on Windows and
`backend/dist/forensic-backend` on Linux. `electron-builder` copies the native
file into the packaged application's `resources/bin` directory.

The packaged service deliberately has no embedded ledger key. Before launching
the desktop application, provision `PHOENIX_LEDGER_SECRET` through the approved
machine/user secret-management mechanism (or the service/session environment).
The backend exits on startup when it is absent, which prevents an acquisition
from being recorded with a generated or publicly-known chain secret.

Windows installers intentionally request Administrator rights because raw disk
acquisition needs `\\.\PhysicalDriveN` access.

On Linux, start the AppImage/deb normally for analysis that does not access raw
devices. For an acquisition session, use an administrator-approved elevation
mechanism, for example `pkexec env DISPLAY="$DISPLAY" XAUTHORITY="$XAUTHORITY"
./NTRO-*.AppImage`, or install a narrowly-scoped polkit rule for the acquisition
operator. `sudo` is also possible from a terminal, but avoid running a GUI as
root unless the deployment policy requires it. Ensure the operator is permitted
to read the intended `/dev/sdX` or `/dev/nvmeXn1` device; never grant broad,
unreviewed device permissions.
