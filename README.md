# BIGBIGWON Lite (Tauri)

Production replacement for the BIGBIG WON settings application.

- Tauri 2
- Vanilla TypeScript frontend
- Rust HID transport using `hidapi`'s Windows native backend
- Exact config-interface matching (`413D:2104`, Usage `FF7A:0001`)
- v37 profile read and CRC verification
- Verified v37 vibration editing (`0x14C` left grip, `0x14D` right grip) with CRC refresh and `D7` ACK validation
- One `D6` per explicit profile read; the validated profile and HID path are cached, so setting saves use `D7` without another `D6` or automatic read-back
- On a read timeout, one read-only `D3` health probe distinguishes a dead interface from the observed large-transfer-path failure without flooding the firmware

The C# project remains a reverse-engineering prototype. Protocol details are documented in `../../docs/BIGBIGWON_HID_PROTOCOL.md`.

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
