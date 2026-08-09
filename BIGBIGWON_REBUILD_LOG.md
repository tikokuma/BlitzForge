# BIGBIGWON Rebuild Log

This is the project history and decision log for the replacement applications.
The exact HID frames, profile layout, byte mappings, captures, and CRC rules are
maintained in [`docs/BIGBIGWON_HID_PROTOCOL.md`](../../docs/BIGBIGWON_HID_PROTOCOL.md).

## Current state

### Applications

- `src/BigBigWonLite`: .NET WinForms diagnostic and reverse-engineering tool.
- `src/BigBigWonTauri`: Tauri 2 replacement UI with a Rust HID backend.
- Neither application performs startup network calls, automatic updates, or crash-report uploads.

### Verified

- The controller configuration interface is `VID_413D PID_2104`, Usage `0xFF7A:0x0001`, with 65-byte input/output reports.
- A v37 base profile is 484 bytes (`0x01E4`), read with `D6` as nine fragments.
- A v37 profile is written with nine `D7` fragments and acknowledged by `A5 05 D7 00 81`.
- The profile CRC is the `0xFFFF`-initialized nibble-table CRC recovered from `DevMgr.dll`.
- The Tauri backend preserves the validated raw profile, recalculates the CRC after supported edits, preserves unknown bytes, and validates the write ACK.
- The independently verified editable areas include vibration, stick curve/compensation fields, rectangular-algorithm mode, keymap data, M2 rapid-fire, polling rate, and step accuracy. The protocol document records the evidence and confidence for each area.

### Known risk and safety rules

- `D6` is a long, nine-fragment read and can stop before the final fragment. The failure can involve controller transfer state or a host-side timeout/interleaving path; the captures do not prove one cause.
- Automatic `D6` retries were removed. A failed partial sequence is discarded rather than resumed, and the Tauri path uses the cached validated profile for a subsequent save.
- `D3`, `E1`, and `F7` are useful read-only probes; `AD` and `D4` returned explicit unsupported responses on the connected controller.
- A HOME long-press reset recovered `D6` but replaced the customized profile with the default profile. Treat it as destructive and do not use it as a routine retry.
- Macro playback/storage, trigger output calibration, LED zone headers, screen-record initiation, firmware-update, and cloud/local preset metadata are statically mapped where possible. D5/D9 reads, an identical empty-slot D8 write, and a reversible one-step non-empty D8/D9 write with exact restoration are now live-tested; actual macro playback/output, trigger calibration, LED setters, screen-record initiation, firmware-update, and cloud/local preset metadata remain untested. The normal v37 M1--M4 turbo-mask serialization is statically proven, but the captured M1 host-side save mutation and the live write behavior of M1/M3/M4 remain unverified. Unknown profile bytes must be preserved.

## Why the replacement exists

The original `BigBigWonAssistant.exe` was slow and unstable for local controller configuration and included unrelated update/network behavior. The original installation was kept available, but its `torrent_client.exe` was replaced with a no-op stub and the highlight/online switch in `config.xml` was disabled while the replacement was developed. The original binary was preserved as `torrent_client.original.exe`.

The replacement scope is local USB/HID inspection and controller-profile access. It does not attempt to reproduce the original updater, crash reporter, or cloud features.

## Timeline

### Initial discovery

- Added Windows PnP enumeration through `System.Management` and direct HID enumeration through `hid.dll`/`setupapi.dll`.
- The controller exposes several HID collections. Only the configuration collection (`Usage=0xFF7A:0x0001`, `In=65`, `Out=65`) is used for profile access.
- The device list was narrowed to the controller and configuration interfaces by default. `Show all HID/USB` and `--dump-hid` retain the full diagnostic view.

### 2026-08-03 — protocol recovery and first end-to-end validation

- Recovered `D6` profile reads, `D7` profile writes, the 484-byte v37 payload, long-frame fragmentation, the CRC, and the short `D7` ACK from `DevMgr.dll` and live HID traffic.
- Fixed an assembly bug that counted each report checksum as profile data. The corrected reader validates the declared length, CRC, and 484-byte payload.
- The unchanged-profile transaction passed in the C# prototype and the Rust/Tauri backend: read, validate, write nine `D7` reports, validate the ACK, and confirm byte-identical read-back.
- Isolated left/right vibration maxima at `0x14C` and `0x14D`; both are raw bytes in the official `0..255` range.
- Began the Tauri migration with Tauri 2, TypeScript, Rust, and `hidapi`'s Windows-native backend.
- Repeated stress reads exposed the `D6` timeout behavior. The production flow was changed to one explicit read, no automatic retry, cached-profile saves, and a read-only `D3` probe after a failure.

### 2026-08-08 — revalidation and static compatibility analysis

- Revalidated the exact configuration interface and confirmed that `D3`, `E1`, and `F7` still responded while `D6` could fail.
- A complete official-app capture showed repeated incomplete `D6` transfers: some attempts produced fragments 1–8 but not fragment 9, while `D7` completed and returned its ACK.
- After a HOME long-press reset, one `D6` returned all nine fragments and the default `D0A4` profile. This recovered the transfer path but destroyed the customized onboard state.
- The C# transport was changed to overlapped I/O with `CancelIoEx`, completion wait before handle close, and no automatic D6 retry. The Rust diagnostic path closes the read handle before opening the probe handle.
- Static analysis of `WndMgr.dll` connected the six v37 curve blocks to the official left/right Default, Curve1, and Curve2 loaders. Live isolation then mapped the tested curve-point, center, edge, stabilization, and rectangular-algorithm bytes.
- Firmware analysis of `APP_mcu_v33.bin` confirmed separate 24-byte runtime records for the two sticks and one radial multiplier per selected stick.
- The official compatibility surface was mapped for profile versions v34, v35, v36, v37, v39, and v60, plus raw-v37 JSON, macro/trigger fields, auxiliary commands, and lighting persistence. These findings are static unless the protocol document cites a live capture.

### 2026-08-09 — editor expansion

- Added the v37 keymap editor and preserved the complete 32-entry raw keymap. Controller, keyboard, and Null encodings are evidence-backed but require more firmware-version coverage before being generalized.
- Isolated M2 rapid-fire at profile byte `0x140`, bit 0. Firmware analysis now maps the complete M1--M4 turbo mask to runtime bits 23--26 and classifies M1's observed `0x146` mutation as an adjacent host-side save field, not the v33 turbo mask.
- Added the official polling-rate choices through `F6` and step-accuracy choices through `F7`, while preserving unknown raw combinations.
- Confirmed negative center and edge compensation use separate slots in each curve block. The preview now shows compensation bands and does not draw unsupported deadzone overlays.
- Added raw v37 profile import/export. Import validates the 484-byte payload or 488-byte `A4 D7 E4 01` form before editing; apply writes the complete profile so unknown fields survive round trips.
- Firmware analysis identified `0x140..0x143` as the turbo mask and `0x144` as a separate speed-index area. The v33 table is `200/100/50 ms` full periods (`5/10/20 Hz`).

### 2026-08-09 — firmware runtime completion

- Recovered the v33 turbo table at APP raw `0xF730`: speed indexes `0/1/2` select `200/100/50` timer values; the runtime toggles at half-periods.
- Proved the M-key group is runtime mask `0x07800000`: M1=`0x00800000`, M2=`0x01000000`, M3=`0x02000000`, M4=`0x04000000`. Stored profile bytes are the byte-swapped rows documented in the protocol reference.
- Reclassified the three simultaneous M1-save changes: `0x03B` is right Default `stickRightCurveYDivx`, `0x167` is keymap entry 0 output byte 2, and `0x146` is an adjacent host-side/legacy field not read as turbo by APP v33.
- Completed the negative `0x146` audit: the v37 extract/implant paths assign only profile `0x144` in that neighborhood and leave `0x145..0x147` outside the known serialized fields; APP v33 has no read of `0x146`. The observed `00 -> 80` is therefore an opaque/preserved host-side gap or legacy subfield, not an M1 enable, speed index, or firmware turbo bit.
- Traced the official host path one step further: the M1 checkbox handler stores a UI/global turbo-row boolean, while the v37 `DevMgr` serializer byte-swaps the complete dword at `+0x144`. No independent host or firmware read of `+0x146` was found, so its exact subfield meaning remains deliberately unknown.
- Completed the normal v37 M3/M4 save mapping statically: `WndMgr.dll` serializes host rows at `+0x6D8 + row*0x1C`, maps host IDs 0--3 to the M1--M4 mask bits at profile `+0x140`, and all four checkbox handlers update the same row-level boolean. The proven M3/M4 stored patterns are `00 00 02 00` and `00 00 04 00`; the captured M1 `+0x146=80` side effect remains outside that normal mask write.
- Completed the keymap runtime model: byte 0 is mode, bytes 1--3 are three controller outputs or one keyboard modifier plus two usages. The APP v33 target namespace includes C/Z, L1/R1, M5--M8, and POWER in IDs previously labelled dynamic.
- Completed static macro storage/playback analysis: four `0x294`-byte slots, 64 ten-byte steps, D8/D9 storage, M1--M4 trigger dispatch, hold/toggle bit, loop bit, and repeat-limit comparison. A reversible one-step non-empty D8 probe on the originally empty slot 0 returned `A5 05 D8 00 82`; D9 preserved the six header bytes and all ten step bytes, and a second D8 restored the original empty record byte-for-byte. Actual playback/output remains untested.
- Separated the four official key namespaces that had been conflated in earlier notes: profile input-bit slots, WndMgr source-key IDs, macro JSON IDs, and macro-playback mask IDs. `FUN_1037CC20` now supplies the fixed host source-key masks and the exact variant-dependent mappings for dynamic IDs `21..24`; `FUN_103A1320` supplies the complete JSON-to-macro-event conversion including invalid sentinels; `FUN_103A1D10` supplies the 33-entry macro display-name table, including the two deliberately reserved `?` strings. The profile keymap remains indexed by the resulting input-bit position, so M1--M4 are slots `23..26` despite host IDs `0..3`.
- Closed the keyboard side of keymap conversion from `FUN_10271590` and `FUN_1037D4B0`: the host vector is `[modifier-or-zero, VK0, VK1]`, modifiers `A0..A5` become the HID modifier bits `02,20,01,10,04,40`, standard VK ranges map to their HID usages, and all unsupported VKs become zero. This explains the exact `02 00 usage 00` representation and rules out a hidden fourth keyboard byte.
- Recovered the official v37 WndMgr macro encoder: run-key mapping, the four visible LongPress/Tap × Loop/NoLoop modes, `repeatTime` packing, `mapList` key/duration/interval conversion, and the controller/analog step tables. DevMgr's v35-named writer is now decoded as a variable active-prefix `A4 D8` logical buffer: `LE(L+1)` length, slot index, device-accepted reflected CRC-16/MODBUS over the active record, six-byte header fragment, and byte-swapped step input masks; its response parser is `A5 05 D8 status SUM8`. The device still stores a fixed `0x294`-byte slot. `CSendPacket::operator<<` statically proves D8 uses `A4 LEN D8 SEQ PAYLOAD SUM8`, up to 59 payload bytes per 64-byte packet; 64 steps produce 12 reports (11 full plus final `LEN=07`). One-step non-empty storage is live-confirmed; actual playback/output, full multi-step live fragmentation, and final version-specific dispatch remain unverified.
- Recovered the exact v33 radial curve coefficients and the signed stabilization filter: positive values use PRNG jitter within `20*f`, zero uses a deterministic five-count gate, and negative values use threshold/40-sample settling.
- Closed the v37 curve-record tail statically. Each 44-byte record maps eight signed native dwords, one stabilization byte, four native words, and four auxiliary input-mapping/preset-switch slots. The raw/class fields are at relative `+0x14/+0x16`, `+0x1A/+0x1C`, `+0x20/+0x22`, and `+0x26/+0x28`; `FUN_1037C920` returns the exact class values `0/1/2`. Inter-field gaps are not written by the official v37 converter and remain preservation bytes.
- Decoded trigger/sensor/calibration field ownership and separated profile identity/LED metadata from the 484-byte v37 payload. Static v37 serialization now ties trigger bytes, sensor mode high/low nibbles, `0x11F` axis/sign bits, and the `0x120/0x124/0x126` runtime calibration calculation to their official host-side sources. APP v33 `FUN_00008958` further proves `0x184` suppresses original LT input and `0x188` suppresses original RT input during keymap remapping, including the opposite-trigger copy rule. The trigger ADC transfer law and the persistent result of the calibration command remain live-unverified where the current device state would be changed.
- Closed the static identity boundary: `EF` is a 12-byte query whose parser retains an eight-byte UUID, while `0B` returns one ZKM-version byte and the native caller normalizes ASCII `8` to `6`; neither field is stored in the v37 profile, and firmware identity comes from update metadata.
- Closed the DevMgr lighting and screen-record request layer statically. `F5` sends/receives the logo RGB triplet, `72` controls brightness, `70` requests LED show, `73` reads/sets lighting mode, and the two `71` overloads serialize fixed or variable RGB-zone payloads with `SUM8`. `FD` is the host-side screen-record flag setter (`A5 05 FD flag SUM8`), while `FC` is parsed as a five-byte device-to-host start-record event. The caller-specific `71` base header and live success/response behavior remain intentionally unverified.
- Performed live probes on the connected `VID_413D PID_2104` unit: `D5`/`D9` returned four empty macro slots with active length `0x000A`; an identical empty slot-0 D8 write returned `A5 05 D8 00 82` and D9 readback matched; a reversible one-step non-empty slot-0 probe returned the same ACK and read back `7A 7D 00 14 A5 5A 1F 03 12 34 50 00 12 34 56 78 11 22 33 44`, then restored `DF ED 00 0A 00 00 1F 00 00 00` exactly. `EF` returned UUID `55 E8 22 4A 7A 68 00 00`; `0B` returned raw ZKM `0x37`; `F5`, `72`, `70`, and `73` returned explicit unsupported frames; `F8` timed out. A same-content `D7` write of preserved CRC `0x8847` returned `A5 05 D7 00 81`, while the subsequent `D6` still timed out before fragment 1. No reset, LED setter, calibration, playback-trigger, or recording command was sent.

## Implementation map

### C# tool (`src/BigBigWonLite`)

- `Program.cs`: CLI entry points such as `--dump-hid`, `--read-profile`, `--probe-macros`, `--probe-live-readers`, and `--build-set-profile-frame`.
- `MainForm.cs`: WinForms UI and data binding.
- `BigBigWonProtocol.cs`: HID reads, writes, timeout handling, and profile framing.
- `HidDeviceScanner.cs`, `HidDeviceInfo.cs`, `DeviceScanner.cs`, `DeviceInfo.cs`: HID/PnP discovery and filtering.
- `ProfileCatalog.cs`, `ProfileTemplateMatcher.cs`: bundled profile and lighting-template handling.
- `ProfileFieldDecoder.cs`, `ProfileByteDecoder.cs`, `ProfileSnapshotStore.cs`: profile inspection and snapshots.
- `SetProfileFrameBuilder.cs`: CRC refresh, 488-byte v37 frame construction, and nine-report fragmentation.

### Tauri tool (`src/BigBigWonTauri`)

- `src-tauri/src/device.rs`: HID discovery, report I/O, timeout cleanup, and short device-setting commands.
- `src-tauri/src/protocol.rs`: v37 profile framing, CRC, keymap, curve, vibration, and device-setting encoders/decoders.
- `src-tauri/src/lib.rs`: Tauri commands and profile/settings state.
- `src/main.ts` and `src/styles.css`: editor state, profile manager, and UI presentation.

## Build and verification history

- `dotnet build src/BigBigWonLite/BigBigWonLite.csproj -c Release`: passed with 0 errors and 0 warnings.
- `dotnet publish src/BigBigWonLite/BigBigWonLite.csproj -c Release -r win-x64 --self-contained false -o dist/BigBigWonLite`: completed.
- The published C# tool enumerated HID interfaces and read the live 484-byte profile.
- The Tauri TypeScript/Vite build, Rust tests, and `npm run tauri build` passed during the migration.
- Release artifacts were produced under `src/BigBigWonTauri/src-tauri/target/release`.
- Distribution builds must use `npm run tauri build`; plain `cargo build --release` leaves Tauri's development URL in the executable.

## Evidence index

The full capture paths, hashes, byte dumps, and interpretation are kept in
[`BIGBIGWON_HID_PROTOCOL.md`](../../docs/BIGBIGWON_HID_PROTOCOL.md). The main
captures are:

- `tools/usbpcap/official-20260803-082927.pcap`: official-app D6 failure and interface comparison.
- `tools/usbpcap/hard-reset-20260803-084033.pcap`: post-reset complete D6 and default-profile recovery.
- `tools/usbpcap/field-map-20260803-084506.pcap` and `field-map-right-20260803-090500.pcap`: vibration fields.
- `tools/usbpcap/official-api-bus2-20260808-1.pcap`: incomplete D6 versus completed D7 traffic.
- `tools/usbpcap/postreset-bus2-20260808-reset-d6.pcap`: complete post-reset D6.
- `tools/usbpcap/curve-isolation-20260808-*.pcap`: live curve-field isolation.
- `tools/usbpcap/rect-algorithm-20260808-1.pcap`: rectangular-algorithm byte.
- `tools/usbpcap/negative-right-center-20260809-b.pcap` and `negative-right-edge-20260809.pcap`: negative center/edge slots.

Static evidence comes from `DevMgr.dll.c`, `WndMgr.dll.c`, the extracted
`APP_mcu_v33.bin`, and the supplied v37 profile templates. Static findings are
not treated as live command validation.

## Remaining work

- Validate actual macro playback, trigger, LED, and screen-record behavior with disposable-profile live captures; D8/D9 storage is already live-confirmed.
- Extend curve isolation to the remaining presets and assign the official JSON aliases.
- Confirm keyboard/keymap encodings across firmware revisions.
- Capture official M1, M3, and M4 saves to map host-side mutations beyond the normal mask serializer; the v33 hardware mask and speed timing, and the normal M3/M4 mask bytes, are already static-proven.
- Recover caller-specific LED headers and response semantics for auxiliary commands.
- Preserve and test cloud/local preset metadata only if compatibility with the official application becomes a requirement.

Do not induce another D6 abort or send reset/update/LED commands solely for testing while the current controller state is being preserved.
