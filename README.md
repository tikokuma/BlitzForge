# BIGBIGWON Lite (Tauri)

Production replacement for the BIGBIG WON settings application.

- Tauri 2
- Vanilla TypeScript frontend
- Rust HID transport using `hidapi`'s Windows native backend
- Exact config-interface matching (`413D:2104`, Usage `FF7A:0001`)
- Shared official profile library backed by `%PROGRAMDATA%\GamepadAssistant\Config.db`
- v37 profile read, CRC verification, JSON import/export, and unknown-byte preservation
- Profile edits are saved to `Config.db`; applying a saved profile to hardware is a separate, explicit `D7` operation
- Device discovery uses the short `EF` UUID and `0B` ZKM probes; startup does not issue a large `D6` read
- Vibration, stick, keymap, and rapid-fire changes are combined into one profile save
- SQLite writes use busy timeouts, transactions, optimistic conflict detection, and an online backup before the first write
- On a read timeout, one read-only `D3` health probe distinguishes a dead interface from the observed large-transfer-path failure without flooding the firmware

## Scope

LED control is intentionally not implemented. This is a deliberate scope decision, not an omitted feature.

The initial shared format is v37 with a 484-byte profile. Other official profile
formats remain visible in the library when possible, but editing and hardware
application are disabled with an incompatibility reason. Macros and lighting
remain hardware/database features outside the shared profile store.

The first write creates an online SQLite backup under
`%LOCALAPPDATA%\com.bigbigwon.lite\backups`. If the official app changes a
profile after Lite opened it, Lite refuses to overwrite the row and offers a
reload-or-save-as path.

The C# project remains a reverse-engineering prototype. Protocol details are documented in `BIGBIGWON_HID_PROTOCOL.md`.

```powershell
npm install
npm run tauri dev
```

Production build:

```powershell
npm run tauri build
```

Use the Tauri CLI for production artifacts; plain `cargo build --release` retains the development URL. The packaged executable and installers are written below `src-tauri/target/release`.

Checks:

```powershell
npm run build
cd src-tauri
cargo test
```
