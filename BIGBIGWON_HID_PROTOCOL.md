# BIGBIG WON HID Protocol

This document records the v37 base-profile protocol recovered from `DevMgr.dll` and verified on connected hardware. It is implementation-neutral and is the source of truth for the Rust/Tauri port.

## Status and scope

- **Verified** means confirmed by live HID traffic, a preserved profile, or both.
- **Static** means recovered from the official binaries or firmware but not confirmed by a live state-changing capture.
- **Open** means the current evidence is insufficient to assign a field meaning or command behavior.

The sections up to `Live validation result` describe the verified v37 read/write path. Later sections separate live field isolation from static compatibility findings and firmware analysis. Do not treat a static frame as permission to send that command to the connected controller.

## Verified interface

- Vendor ID: `0x413D`
- Product ID: `0x2104`
- Usage page: `0xFF7A`
- Usage: `0x0001`
- Windows input/output report length: 65 bytes
- Byte 0 is the Windows HID report ID (`00`); the controller protocol packet occupies the following 64 bytes.

Do not select another interface by VID/PID alone. This device also exposes gamepad, keyboard, consumer-control, and other HID collections.

## Read v37 base profile (`D6`)

Send one zero-padded 65-byte output report:

```text
00 A5 04 D6 7F 00 ...
```

The controller returns 9 reports. Ignoring the Windows report ID, each fragment is:

```text
A4 LEN D6 SEQ PAYLOAD SUM8
```

- `LEN`: logical fragment length including header and checksum
- `SEQ`: one-based sequence number
- `PAYLOAD`: up to 59 bytes
- `SUM8`: wrapping 8-bit sum of every preceding byte in the logical fragment
- Full fragments have `LEN=0x40`; the final v37 fragment has `LEN=0x11`.

Concatenate fragment payloads in sequence order. Profile bytes `2..3` contain the total profile length as a big-endian integer (`01 E4` = 484).

The device occasionally failed to answer the first read immediately after connection. A failed partial fragment sequence must never be resumed. The production transport now sends one `D6` only when the user explicitly reads the profile; automatic retries were removed after repeated stress reads left the large-transfer path unresponsive. A validated read is cached in memory, so later setting saves send `D7` without another `D6`.

### Read-only health probes

The following four-byte requests were recovered from `DevMgr.dll` and checked against the same interface:

```text
GetProfileSize     A5 04 D3 7C
GetDeviceModeInfo  A5 04 E1 8A
GetDevicePowerInfo A5 04 AD 56
GetStepAccuracy    A5 04 F7 A0
GetGamepadMode     A5 04 D4 7D
```

After the `D6` path stopped responding, `D3`, `E1`, and `F7` still returned checksum-valid reports. `AD` and `D4` returned the explicit unsupported frame `A5 05 FF CMD SUM8`; they did not time out. The `D3` response was:

```text
A5 0A D3 34 0C E4 01 94 02 3D
```

It contains the byte pair `E4 01`, interpreted little-endian as `0x01E4` (484), matching the v37 base-profile size. This isolates the failure to the large profile-transfer path rather than HID enumeration or generic command I/O. Neither restarting the controller nor rebooting Windows recovered `D6`; this does not distinguish a controller-side transfer state from a host-side pending-I/O state.

### Official application USBPcap verification

The official application v1.0.5.7 was captured from launch through connection and entry into the Blitz 2 configuration screen on 2026-08-03. The capture is `tools/usbpcap/official-20260803-082927.pcap`:

- USBPcap bus: 1
- Device address: 3
- Configuration endpoints: interrupt OUT `0x03`, interrupt IN `0x83`
- Capture duration: 154.034793 seconds
- Packets: 305,462
- SHA-256: `826B52C7550483EADAAAAF8C437510A9EC41BF2E91D88C8B763C6AD6C016CF42`

The official application sent the same zero-padded 64-byte wire request recovered from DevMgr:

```text
A5 04 D6 7F 00 ...
```

It sent `D6` at relative times 40.188086, 41.022285, 46.136937, and 123.286206 seconds. No `D6`/`A4` response appeared on endpoint `0x83`. In the same session, the surrounding `0B`, `D3`, `EF`, `FA`, `E1`, and `04` requests all received data responses; unsupported probes `73` and `F5` received explicit `A5 05 FF CMD SUM8` responses. Therefore:

- The lightweight implementations use the same `D6` request bytes, padding, endpoint, and interface as the official application.
- The official application also cannot read the current profile in this observed failure state.
- The configuration screen shown after the timeout is fallback/cached UI state, not evidence of a successful `D6` read. It displayed `current configuration: unnamed` while the USB trace contained no profile payload.
- There is no missing successful initialization command in the official pre-`D6` sequence. The failure is confined to the observed large-transfer exchange, but the capture alone does not distinguish controller-side state from a host receive/reassembly problem.

The official Japanese Blitz 2 manual distinguishes ordinary power control from a controller reset: HOME for 2 seconds powers on/off, while HOME for 10 seconds until vibration performs the reset. The separate "hold configuration button for 3 seconds" operation explicitly deletes all onboard configurations. Source: <https://bigbigwon-jp.oss-ap-northeast-1.aliyuncs.com/Support/Instructions/Blitz%202_User%20Manual-JP-0819.pdf>.

### HOME-reset recovery verification

After holding HOME for 10 seconds until vibration, the controller re-enumerated from USB device address 3 to 13. One `D6` request then produced all 9 profile fragments:

- Request: relative time 28.248439, endpoint `0x03`
- Fragment 1: 28.305689, endpoint `0x83`
- Fragment 9: 28.337686, endpoint `0x83`
- Complete request-to-final-fragment time: 89.247 ms
- Capture: `tools/usbpcap/hard-reset-20260803-084033.pcap`
- SHA-256: `69FE9ECB42A9CBBA807E29ECCBFC792722DD51D3A73F6B4E84E5C4D10C6A130B`

The recovered 484-byte profile has CRC `D0A4` and is byte-identical to both `BLITZ2_0x37` and `Default_0x37`. It differs from the pre-reset `29AA` profile at 34 bytes, including the CRC. Therefore the HOME reset must be treated as destructive to current settings despite being distinct from the manual's explicit "delete all configurations" operation.

The complete pre-reset `29AA` profile remains preserved as bytes `4..487` of `profiles/set-profile-v37-frame.bin`. It can be restored through the already verified unchanged v37 `D7` write path, but no automatic restore was performed.

## v37 profile checksum (CRC)

- Profile length: 484 bytes
- Stored checksum: bytes `0..1`, big-endian
- Input to CRC: profile bytes `2..483`
- Initial value: `0xFFFF`
- Algorithm: the nibble lookup table recovered from `Utils::crc16_1021`

```text
0000 CC01 D801 1400 F001 3C00 2800 E401
A001 6C00 7800 B401 5000 9C01 8801 4400
```

Observed valid CRCs on 2026-08-03 include `29AA` for the pre-reset customized profile, `D0A4` for the default profile, `AC5A` for default with left vibration 123, and `7738` for default with right vibration 121.

## Verified v37 vibration fields

The official UI calls this setting `バイブレーションレベル` and represents each grip as a minimum and maximum value. The four wire fields are raw unsigned bytes:

| Profile offset | Meaning | Range | Default |
| --- | --- | --- | --- |
| `0x148` | Left-grip minimum | `0..255` | `0` |
| `0x149` | Right-grip minimum | `0..255` | `0` |
| `0x14C` | Left-grip maximum | `0..255` | `255` |
| `0x14D` | Right-grip maximum | `0..255` | `255` |

The earlier field-isolation records below changed the maximum fields; their old “strength” label is now corrected to “maximum”.

The official UI derives its visible mode from the paired minimum/maximum values; it does not store a separate vibration-mode byte. The normal adjustable range must be at least 20 wide. The explicit `Off` preset is the exception and uses `0..1`. The current preset values are `Strong 50..200`, `Standard 50..150`, and `Weak 50..100`; only `Off` and custom `0..255` have been live-validated.

Both offsets were isolated with the official v1.0.5.7 editor while USBPcap recorded its `D7` frames:

- Left-only test: changing left from 255 to 123 changed only profile byte `0x14C` from `FF` to `7B`, apart from the two CRC bytes. The resulting CRC was `AC5A` and the controller returned `A5 05 D7 00 81`.
  - Capture: `tools/usbpcap/field-map-20260803-084506.pcap`
  - SHA-256: `E969D3DDC7F0CF6D71FC6FD96B792946B1DEDD1805D9405C0E937944F778491F`
- Right-only test: the official app emitted `FF 77` at offsets `0x14C..0x14D` for right 119, then `FF 79` for right 121, while left remained 255. The right-121 profile CRC was `7738`; each write received the same valid ACK.
  - Capture: `tools/usbpcap/field-map-right-20260803-090500.pcap`
  - SHA-256: `FFCABC2E394306B72D6B853B7353CAAC2F3B316F1972FF047F5DF25AE7E1F75A`

After mapping, both values were restored to 255 by sending the default `D0A4` profile through `D7` only. The final capture contains exactly nine `D7` output fragments and the ACK; it contains no `D6` request:

- Capture: `tools/usbpcap/restore-vibration-final-20260803-091000.pcap`
- SHA-256: `71BDF3714D2DF98EC639F4C78D9CDBBC4963713234EF1D4C9B7BB25C8F51ED06`

## Write v37 base profile

The unfragmented DevMgr frame is:

```text
A4 D7 E4 01 + 484 profile bytes
```

DevMgr fragments only the 484-byte payload. With a 64-byte wire report, each output packet is:

```text
A4 LEN D7 SEQ PAYLOAD SUM8
```

The result is 9 packets carrying `59 x 8 + 12` profile bytes. Packets 1-8 have logical length 64. Packet 9 has logical length 17 and is zero-padded to 64 bytes. Windows writes report ID `00` followed by that packet, for 9 writes of 65 bytes.

Before fragmentation, DevMgr converts multi-byte host fields to wire order and recalculates the profile CRC. The Tauri implementation accepts an already wire-format profile, preserves unknown bytes, and writes the independently confirmed vibration, curve, rectangle, keymap, complete M1--M4 turbo mask, and speed-index fields. It also exposes live D5/D9 macro reads, D8 active-prefix writes with D9 readback, UUID/ZKM/auxiliary probes, and the statically known logo/brightness/lighting setter frames. Full-profile apply remains available for fields that Lite does not interpret.

## SetBaseProfile ACK

ACK format:

```text
A5 05 D7 VALUE SUM8
```

The live Windows HID and Rust `hidapi` tests both observed:

```text
A5 05 D7 00 81
```

`81` is the wrapping sum of `A5 05 D7 00`. The original parser validates the header and checksum but does not assign a confirmed semantic name to `VALUE`.

## Live validation result

The unchanged-profile test performs these operations as one transaction:

1. Read the current profile from the exact config interface.
2. Require 484 bytes, declared length 484, and a valid stored CRC.
3. Send the same profile as 9 write reports.
4. Require a valid `A5 05 D7` ACK.
5. Read the profile again and require byte-for-byte equality.

This passed in both the C# prototype and the Rust/Tauri backend on 2026-08-03. The Tauri backend retains the validated profile and originating HID path after a read; supported saves update the cached bytes, recalculate CRC, confirm the same controller is still connected, send the 9 `D7` reports, validate the ACK, and update the cache without another `D6` or automatic read-back. Unknown bytes, including the adjacent M1-save mutations at `0x03B`, `0x146`, and `0x167`, remain untouched.

## Live evidence: read-only revalidation (2026-08-08)

The connected controller was revalidated on the exact configuration interface before reading:

- `VID_413D PID_2104`
- Usage `0xFF7A:0x0001`
- input/output report lengths `65/65`
- access probe: `RW`

Read-only probes returned:

```text
D3  00 A5 0A D3 34 0C E4 01 94 02 3D
E1  00 A5 0A E1 20 06 00 20 00 00 D6
AD  00 A5 05 FF AD 56 00 ...
F7  00 A5 08 F7 01 00 01 00 A6
D4  00 A5 05 FF D4 7D 00 ...
```

`D3`, `E1`, and `F7` are valid responses. `AD` and `D4` are explicit unsupported responses. The first single `D6` request then returned all 9 fragments and assembled a valid 484-byte profile with CRC `DD60`. No `D7`, reset, or other state-changing command was sent.

Compared with `Default_484_0x37`, the live profile differs at 21 bytes: the CRC bytes, offsets in the first two serialized curve blocks (`0x010`, `0x012..0x016`, `0x03C`, `0x03F`, `0x041..0x042`, `0x044`), vibration bytes `0x14C..0x14D`, and keymap bytes `0x1C0`, `0x1C2`, `0x1C4..0x1C7`.

For the post-change runtime smoke test, one further `D6` read returned CRC `7738` instead. The latest `profiles/current-profile.bin` therefore contains the `7738` result, which is only three bytes different from `Default_484_0x37`: the two CRC bytes and right vibration `0x14D=0x79`. The user confirms that `DD60` was the state before entering the settings screen for screenshots, and `7738` is the resulting state after that operation. `docs/screenshot/bive.png` shows the corresponding `vibR121` profile with right vibration strength 121, matching the `0x79` value. This transition is therefore expected; no restore is required, and this tool did not send `D7` or a reset.

## v37 profile layout from `WndMgr.dll`

`CProfileAdaptor::Implant2PadSet_v37` proves the following serialized curve-block mapping:

| Profile block | Native source base |
| --- | --- |
| `0x0E` | `+0x1B4` |
| `0x3A` | `+0x468` |
| `0x66` | `+0x27C` |
| `0x92` | `+0x530` |
| `0xBE` | `+0x344` |
| `0xEA` | `+0x5F8` |

The v37 converter and the targeted UI loaders together prove the logical labels of all six serialized blocks. The same converter proves trigger fields at `0x05..0x08` (left/right deadzone center/side, with side encoded as `0x64 - source`) and a 32-entry four-byte keymap region at `0x164..0x1E3`.

### v37 curve labels confirmed from WndMgr UI loaders

`CProfileAdaptor::ExtractFromPadSet_484_v37` fills the native app-base curve structures at `+0x1B4`, `+0x27C`, `+0x344`, `+0x468`, `+0x530`, and `+0x5F8` from wire blocks `0x0E`, `0x66`, `0xBE`, `0x3A`, `0x92`, and `0xEA`, respectively. Targeted decompilation of the six `CAdvanceConfigJoystick*VirtualWnd::LoadProfile_*` functions then identifies which logical UI preset reads each base structure:

| UI loader | App-base curve source | v37 wire block |
| --- | ---: | ---: |
| `LeftDefault::LoadProfile_v37` | `+0x1B4` | `0x0E` |
| `RightDefault::LoadProfile_v37` | `+0x468` | `0x3A` |
| `LeftCurve1::LoadProfile_v37` | `+0x27C` | `0x66` |
| `RightCurve1::LoadProfile_v37` | `+0x530` | `0x92` |
| `LeftCurve2::LoadProfile_v60` | `+0x344` | `0xBE` |
| `RightCurve2::LoadProfile_v39` | `+0x5F8` | `0xEA` |

The `v60`/`v39` suffixes on the two Curve2 methods identify the version-specific extraction helpers used by those UI pages in this binary; they do not change the v37 block labels above. This is a static label/order proof, not a live field-isolation capture. The read-side numeric endian convention and per-field JSON transformations are still unresolved, so these fields remain read-only.

### 2026-08-08 live v37 curve field isolation

The official application was driven through the Computer Use API while USBPcap2 monitored the live controller. The left-stick Default curve in profile `cstab1` was changed one control at a time, saved, and compared with the resulting `D7` profile payload. The six block labels above are static for all presets; the following byte layout is live-confirmed for the left Default block (`0x0E`) and is therefore the template for the other 44-byte blocks until a preset-specific exception is observed.

For a curve block beginning at profile offset `b`, the observed fields are:

| Relative offset | UI control / meaning | Live result |
| ---: | --- | --- |
| `+0x00` | curve mode byte | `01` in the tested preset |
| `+0x01` | `YDivx`/scale byte | `20` in the tested preset |
| `+0x02` | stick center | UI `12 -> 13`: `0C -> 0D` |
| `+0x03` | negative center compensation magnitude | remained `00` for the positive-only test |
| `+0x04` | graph point 1 X | `30 -> 40`: `1E -> 28` |
| `+0x05` | graph point 1 Y | `30 -> 29`: `1E -> 1D` |
| `+0x06` | graph point 2 X | `70 -> 91`: `46 -> 5B` |
| `+0x07` | graph point 2 Y | remained `70` (`46`) while X changed |
| `+0x08` | stick edge/deadzone | UI `3 -> 4`: `61 -> 60`, i.e. `0x64 - UI` |
| `+0x09` | negative edge compensation slot | remained neutral `64` for the positive-only test |
| `+0x0A` | signed stabilization/filter byte | UI `0 -> 1`: `00 -> FF`; positive/zero/negative runtime branches are decoded below |

The final first-block bytes were `01 20 0D 00 28 1D 5B 46 60 64 FF`, followed by unchanged bytes. The graph label transitions were `(30,30)-(70,70) -> (40,29)-(70,70) -> (40,29)-(91,70)`. The point coordinates are direct byte values; no additional scaling or endian conversion was observed for these live UI controls. The remaining bytes were initially left open; the static tail mapping below now closes their serialization, while the exact logical JSON aliases remain unassigned.

### v37 curve-record tail and preset-switch serialization (static)

The untouched tail is now closed by the v37 `Implant2PadSet_v37` / `ExtractFromPadSet_484_v37` pair. For curve record `i`, the native record address used by the WndMgr converter is `N_i = object + 0x158 + 0xC8*i + 0x5C`. The corresponding wire record starts are ordered as `[0x0E, 0x66, 0xBE, 0x3A, 0x92, 0xEA]`; the logical UI labels for those starts are given in the table above.

For a wire record beginning at `b`, the proven mapping is:

| Wire offset | Native source | Meaning / representation |
| ---: | ---: | --- |
| `b+0x00` | `N+0x00` | Curve mode byte |
| `b+0x01` | `N+0x01` | `YDivx` / scale byte |
| `b+0x02..0x09` | `N+0x04,+0x08,+0x0C,+0x10,+0x14,+0x18,+0x1C,+0x20` | Eight signed native dwords serialized as their low bytes; the reverse converter sign-extends them |
| `b+0x0A` | `N+0x34` | Stabilization/filter byte |
| `b+0x0C,+0x0E,+0x10,+0x12` | `N+0x38,+0x3C,+0x40,+0x44` | Four native 16-bit fields; the surrounding v37 word-swap routine controls wire order |
| `b+0x14` | `N+0x48` | Auxiliary mapping slot 0 raw byte (native dword, wire low byte) |
| `b+0x16` | `class(N+0x4C)` | Auxiliary mapping slot 0 type/class byte |
| `b+0x1A` | `N+0x68` | Auxiliary mapping slot 1 raw byte |
| `b+0x1C` | `class(N+0x6C)` | Auxiliary mapping slot 1 type/class byte |
| `b+0x20` | `N+0x88` | Auxiliary mapping slot 2 raw byte |
| `b+0x22` | `class(N+0x8C)` | Auxiliary mapping slot 2 type/class byte |
| `b+0x26` | `N+0xA8` | Auxiliary mapping slot 3 raw byte |
| `b+0x28` | `class(N+0xAC)` | Auxiliary mapping slot 3 type/class byte |

The converter does not write the gaps between these fields (`b+0x0B`, `b+0x0D`, `b+0x0F`, `b+0x11`, `b+0x13`, `b+0x15`, `b+0x17..0x19`, `b+0x1B`, `b+0x1D..0x1F`, `b+0x21`, `b+0x23..0x25`, and `b+0x27,b+0x29..0x2B`). They must remain preserved bytes, not be synthesized as zero.

`class()` is the official helper at `FUN_1037C920`: it returns `2` when the native auxiliary entry's mode field at `+0x04` is `1`; otherwise it returns `1` when that field is `0` and the entry's first value differs from the first element of its native vector at `+0x0C`; all other cases return `0`. This is a four-slot auxiliary input-mapping/preset-switch record, not another curve coefficient. Its internal UI labels are still not named, but its wire positions, type values, and native round-trip rule are complete. The generic type-0/type-1/type-2 payload rules are the same ones used by the official mapping encoder described in the keymap section.

The captures are `tools/usbpcap/curve-isolation-20260808-1.pcap` through `curve-isolation-20260808-5.pcap`. The fifth capture has SHA-256 `D7EAD20360B868EB9C9E16208EA78CC181762CDC3EBA0D0F2D92E69A6FEFC53F`. The official app emitted repeated/delayed `D7` saves; early packets can contain the previous profile, so the final stable packet or a completed `D6` read must be used as the saved value.

The official v37 implant/extract pair proves the raw wire positions and preserves the inter-field gaps. The separate logical-profile JSON path still has aliases whose endian/scale convention is not proven; raw bytes remain the source of truth for those aliases in the decoder.

### Live evidence: rectangular-algorithm isolation (2026-08-08)

The UI label is `矩形アルゴリズム` (rectangular algorithm). After the user's HOME reset, a completed read established the default profile (`D0A4`) with profile byte `0x00C = 00` while the switch was visually off. Turning the switch on through the Computer Use API changed the first `D7` profile fragment as follows:

| Capture frame | Relative time | `profile[0x00C]` | Profile prefix after the D7 CRC/length header |
| ---: | ---: | ---: | --- |
| 347 | `8.611353` | `10` | `00 05 05 05 05 00 00 00 10 00 01 20 ...` |
| 885 | `21.580396` | `10` | `00 05 05 05 05 00 00 00 10 00 01 20 ...` |
| 905 | `21.614345` | `00` | `00 05 05 05 05 00 00 00 00 00 01 20 ...` |

The first two rows are the orange/on state; the last row is the default/off profile that the app applied again when it returned to the configuration list. The D7 packet's `profile[0x00C]` is the byte at capture-data index `0x10`, because the first fragment carries profile bytes `0x004..` after the four-byte CRC/length header. The static JSON converter already names this location `joystickCircleLimit`, with `stickTurn` at `0x00D`; live capture now binds the UI's rectangular-algorithm switch to `joystickCircleLimit = 0x10` when enabled and `0x00` in the reset/default state.

The capture is `tools/usbpcap/rect-algorithm-20260808-1.pcap` (SHA-256 `DDCC6FAE8E397152B265B02DE17A434FFD2A591F22AE6D97A5F0D4C2D83B1A1C`). The later direct D6 read completed normally and returned the reset/default `D0A4` profile, including `profile[0x00C] = 00`. This proves the serialized mode value, but not yet the mathematical stick-coordinate transform performed by the firmware; measuring that requires synchronized stick-motion input/output samples with the switch on and off.

## Failure handling: incomplete `D6` transfers

The firmware-side hypothesis remains plausible: `D6` is the only observed command that produces a 9-fragment device-to-host transfer, while short probes and `D7`/ACK continue to work. A failed long transfer followed by HOME-reset recovery is consistent with a controller-side busy flag, sequence state, or buffer-pool leak.

There is also a concrete host-side confounder in the replacement C# transport. Before the 2026-08-08 fix, `ReadOneReport` queued a blocking synchronous `ReadFile` on a ThreadPool thread, returned after 2 seconds, and allowed the caller to dispose the HID handle and retry while the old read could still be pending. The verification CLI also retried `D6` up to three times. That sequence can overlap old and new reads without requiring a firmware bug.

The native DevMgr path has a similar timing boundary: `CDeviceBBwon::GetBaseProfile_484_v37` calls `CUsbCmdHelper::SendRecvCmdKeyword` with a 5000 ms timeout; `CUsbRecvThread::ReadFromUsb` calls `libusb_interrupt_transfer` with 5000 ms; `CCmdSender::Send` marks a timed-out command as failed but the decompiled path does not show an explicit cancellation of the receive transfer. The official application's quick repeated `D6` requests therefore do not isolate firmware from transport-state failure.

The decompiled receiver exposes a second, more specific host-side risk. On `A4` fragment `SEQ=1`, `CUsbRecvThread::OnRecvData` creates or replaces a shared `CRecvPacket` and stores the declared total length. `CRecvPacket::operator<<` then validates the per-fragment checksum and the `A4`/command bytes, but does not compare `SEQ` against the expected next sequence. `CRecvPacket::IsEnd` is only `received_count >= ceil((total_length - 1) / (bulk_size - 5))`; for v37 this is 9. A timed-out command is marked status 3 and signalled by `CCmdSender::Send`, while the receive transfer and current reassembly object are not explicitly cancelled in that path. A later old or duplicated fragment can therefore be associated with a new transfer. A new `SEQ=1` replaces the old shared object, so this is a late-fragment/interleaving hazard rather than proof of a permanently stuck host object. The invalid-checksum path also clears an internal validity byte that `IsEnd` does not consult, so the native reassembler is not a strict sequence/validity gate.

The C# transport now uses overlapped HID reads/writes, calls `CancelIoEx` on timeout, waits for completion before closing the handle, and performs no automatic D6 retry. The Rust diagnostic path also closes the D6 handle before opening a second handle for the D3 probe, and reports how many D6 fragments/bytes arrived before the timeout. A post-fix probe and one D6 read both succeeded with the unchanged current profile (`7738`, right vibration 121). This is a transport-cleanliness result, not yet a proof that the firmware state machine is healthy under an induced abort; no abort stress test was run because it could require another destructive HOME reset.

## Static compatibility surface (not live-validated)

This section records the additional compatibility surface recovered from the official `DevMgr.dll` and `WndMgr.dll` on 2026-08-08. These are static findings unless a live capture is explicitly cited. No state-changing command from this section was sent to the connected controller.

### Base-profile versions and write headers

The payload size is the profile size reported by `D3`. The `D7` header contains that size as a little-endian 16-bit value; the profile payload follows the four-byte header.

| Version | Payload bytes | JSON/app converter | `D7` header | Serialized curve block bases |
| --- | ---: | --- | --- | --- |
| v34 | 240 (`0x0F0`) | `FUN_10371C00` | `A4 D7 F0 00` | legacy layout |
| v35 | 240 (`0x0F0`) | `FUN_10372710` | `A4 D7 F0 00` | legacy layout plus v35 fields |
| v36 | 280 (`0x118`) | `FUN_103732F0` | `A4 D7 18 01` | `0x0E, 0x18, 0x22, 0x2C, 0x36, 0x40` |
| v37 | 484 (`0x1E4`) | `FUN_10374960` | `A4 D7 E4 01` | `0x0E, 0x3A, 0x66, 0x92, 0xBE, 0xEA` |
| v39 | 508 (`0x1FC`) | `FUN_10377810` | `A4 D7 FC 01` | `0x0E, 0x3E, 0x6E, 0x9E, 0xCE, 0xFE` |
| v60 | 335 (`0x14F`) | `FUN_1037ADA0` | `A4 D7 4F 01` | `0x0E, 0x1C, 0x2A, 0x38, 0x46, 0x54` |

The JSON-to-app entry point is `CProfileAdaptor::Convert2AppBaseProfile`, whose function body begins at `FUN_1038F5E0`. It dispatches on the same payload-size/version families. The reverse JSON builders are `Convert2BaseProfileJson` (`FUN_10394290`) and `Convert2BaseProfileBytesJson` (`FUN_103982A0`). A compatible implementation must preserve the distinction between the app's native profile object and the serialized wire profile; copying fields by visual position is not sufficient.

The common header mappings recovered from the version-specific implant functions are:

| Version family | Output fields receiving source `+0x10C`, `+0x108`, `+0x110`, `+0x114`, `+0x154` |
| --- | --- |
| v34/v35 | `0x2D, 0x2E, 0x30, 0x44, 0x24` |
| v36 | `0x57, 0x58, 0x5A, 0x54, 0x4C` |
| v37 | `0x123, 0x124, 0x126, 0x120, 0x118` |
| v39 | `0x13B, 0x13C, 0x13E, 0x138, 0x130` |
| v60 | `0x6F, 0x70, 0x72, 0x6C, 0x64` |

The v37 converter also proves the trigger region `0x05..0x08`, the 32-entry keymap region `0x164..0x1E3`, feature flags at `0x119`, and vibration-related output fields at `0x148`, `0x149`, `0x14C`, and `0x14D`. The UI-loader cross-reference above assigns the physical curve-block labels. The raw v37 path is exact; only the read-side numeric aliases and JSON transformations for the separate logical-profile schema remain unassigned, so those aliases must not be synthesized from visual byte positions.

The base-profile JSON key inventory recovered from the string table is:

~~~
crc, len, mapKeys, triggerMode, res2
motorMin, motorMax, motorSpeedIdx
sensorMin, sensorSwitch, sensorDir, sensorRightKey0, sensorRightKey1
joystickCircleLimit, stickTurn
triggerLeftDZCenter, triggerLeftDZSide
triggerRightDZCenter, triggerRightDZSide
stickLeftCurveModeb, stickLeftCurveYDivx
stickLeftCurveSpeedORpt1x, stickLeftCurveSmootORpt1y
stickLeftCurveCurveORpt2x, stickLeftCurveRes0ORpt2y
stickRightCurveModeb, stickRightCurveYDivx
stickRightCurveSpeedORpt1x, stickRightCurveSmootORpt1y
stickRightCurveCurveORpt2x, stickRightCurveRes0ORpt2y
sensorRightCurve{0,1,2}{Modeb,YDivx,SpeedORpt1x,
                         SmootORpt1y,CurveORpt2x,Res0ORpt2y}
~~~

The `ORpt` names are official schema names, not an instruction to choose one alias. A compatible JSON layer should preserve these names and the version-specific presence/absence of fields.

### v37 JSON import is a raw-byte schema

The `0x1E4` branch of `CProfileAdaptor::Convert2AppBaseProfile` (`FUN_1038F5E0`, dispatched at `0x1038F6B8` and entered at `0x10392CCD`) does not parse the logical `stick*Curve*` names above. It builds a temporary v37 wire buffer, validates it through `ExtractFromPadSet_484_v37`, and the recovered key references in this branch are:

| JSON key | Temporary v37 offset | Evidence |
| --- | ---: | --- |
| `crc` | `0x000` | 16-bit value |
| `len` | `0x002` | 16-bit value |
| `triggerMode` | `0x004` | byte |
| `triggerLeftDZCenter` | `0x005` | byte |
| `triggerLeftDZSide` | `0x006` | byte |
| `triggerRightDZCenter` | `0x007` | byte |
| `triggerRightDZSide` | `0x008` | byte |
| `joystickCircleLimit` | `0x00C` | byte |
| `stickTurn` | `0x00D` | byte |
| `mapKeys[i]` | `0x164 + 4*i` | 32-entry copy loop |

The same branch's direct destination areas further identify `sensorMode` at `0x118`, `sensorSwitch` at the `0x119` feature-mask area, `sensorRightKey0/1` at `0x11D/0x11E`, `sensorDir` at `0x11F`, `sensorMin` at `0x120`, `turboKey` at `0x140`, `turboSpeedIdx` at `0x144`, and the `motorMin`/`motorMax`/`motorSpeedIdx` byte areas at `0x148/0x14C/0x150`. Several of these names are overloaded and some values are parsed through helper objects, so width, aliases, and fallback selection still need to be preserved exactly.

Conversely, `Convert2BaseProfileBytesJson` (`FUN_103982A0`) handles the v37 export path by copying the native profile at `+0x2122` and calling `Implant2PadSet_v37` (`FUN_10374960`), which does include all six curve blocks. Therefore official compatibility requires separate logical-profile JSON and v37 raw-profile JSON paths; a single flattened schema is not equivalent.

For v37, the feature-list IDs used by the native converter are packed into the 32-bit mask at `0x119` as follows:

~~~
ID:  0  1  2  3  4  5  6  7
BIT:40 100 80 200 1  2  8  10
ID:  8       9        10       11       12     13     14     15
BIT:800000 1000000 2000000 4000000 10000 20000 40000 80000
ID: 16    17    18    19    20
BIT:2000 4000 8000 400  800
~~~

This feature mask is separate from the 32-entry keymap masks and from the macro-key mask table below.

### Trigger, sensor, and calibration fields

The v37 trigger bytes are not an opaque four-byte blob:

| Offset | Meaning | Encoding |
| ---: | --- | --- |
| `0x004` | trigger feature flags / model-specific mode byte | v37 writes bit `0` from host `+0x6C8` and bit `1` from host `+0x6D4`; other bits remain model-specific |
| `0x005` | left trigger center deadzone | byte |
| `0x006` | left trigger side/edge deadzone | byte; logical JSON side value is converted to `0x64 - value` |
| `0x007` | right trigger center deadzone | byte |
| `0x008` | right trigger side/edge deadzone | byte; same `0x64 - value` conversion |

The v33 default initializer sets both center bytes to `5` and both side bytes
to `0`. The converter and profile writer preserve the four values
independently. The final ADC-to-output transfer curve is still not live
isolated, but the two nearby suppression bytes now have a static runtime role.

`FUN_00008958` applies the keymap remap to the current 32-bit controller state.
It treats the input byte at runtime `+0x0C` as LT and `+0x0D` as RT. If
`profile+0x184 == 1`, it zeros the original LT byte before remapping; if
`profile+0x188 == 1`, it zeros the original RT byte. For a mapped entry whose
target is the opposite trigger, source 8 (LT) copies the saved original LT
byte to target 9 (RT), and source 9 (RT) copies the saved original RT byte to
target 8 (LT); the opposite-trigger target is otherwise forced to `0xFF`.
All other non-`0xFF` mapped targets contribute their corresponding output bit
to the returned controller mask. Thus `0x184/0x188` are remap-suppression
flags, not additional analog deadzone values. Their exact UI control names and
the ADC transfer law remain model/live questions.

The official v37 writer `Implant2PadSet_v37` (`WndMgr.dll` `FUN_10374960`)
connects the trigger/sensor UI object to the raw bytes as follows:

~~~text
profile +0x004 bit 0 <- host +0x6C8 != 0
profile +0x004 bit 1 <- host +0x6D4 != 0
profile +0x005      <- host +0x6C0
profile +0x006      <- 0x64 - host +0x6C4
profile +0x007      <- host +0x6CC
profile +0x008      <- 0x64 - host +0x6D0

profile +0x118      <- (host +0x154 << 4) | host +0x150
profile +0x120      <- host +0x114
profile +0x123      <- host +0x10C
profile +0x124      <- host +0x108
profile +0x126      <- host +0x110
~~~

For the two explicitly handled low-nibble sensor modes, the same writer maps
the UI booleans into `profile+0x11F`: when `host+0x150 == 1`, host `+0x12C`
sets bit `0x02` and host `+0x130` sets bit `0x04`; when
`host+0x150 == 2`, host `+0x11C` sets bit `0x01`, host `+0x12C` sets bit
`0x08`, and host `+0x130` sets bit `0x10`. This is a static host-side proof
of the field ownership; it does not prove that every firmware revision exposes
the same UI.

The sensor block is similarly now structurally decoded:

| Offset | Meaning in APP v33 |
| ---: | --- |
| `0x118` | low nibble sensor enable/mode; high nibble `0x10` toggle, `0x20` hold, other nonzero mode always-on |
| `0x119..0x11C` | 32-bit sensor switch mask |
| `0x11D`, `0x11E` | sensor-assigned output keys; not read by the v33 `FUN_0000813C` path itself |
| `0x11F` | sensor axis/select and sign flags; bits `0x01`, `0x02`, `0x04`, `0x08`, and `0x10` are consumed by `FUN_0000813C` |
| `0x120` | sensor minimum, scaled by `<< 6` |
| `0x123` | sensor sensitivity multiplier |
| `0x124` | sensor scale/curve selector used by `FUN_000096A0` |
| `0x125` | calibration/debug input reported by `FUN_000083DC`; not used by its `sp max` arithmetic |
| `0x126` | calibration input converted into the `sp max` calculation |

`FUN_0000813C` has now been reduced to the following v33 runtime branches:

* A separate global runtime gate must be open. Low nibble `0` disables the
  path. High nibble `0x10` is an edge-triggered toggle: the big-endian
  `0x119..0x11C` switch mask must intersect the current input, and one rising
  edge flips the enabled state. High nibble `0x20` is hold mode: enabled is
  exactly the current mask intersection. Any other nonzero high nibble is
  treated as always enabled by this function.
* Low nibble `2` reads three signed sensor deltas from paired raw samples,
  clamps them to signed 16-bit values, and scales one delta by `0x123` for the
  first stick component (`0x11F` bit `0x01` selects the alternate component).
  The second component uses the middle delta. Unless a separate global
  deadband override is set, all three deltas in `[-20,20]` zero the injection.
  The two values then pass through `FUN_000031C0`, are combined with the
  current stick values by `FUN_0000B300`, and are sign-inverted by bits
  `0x08` (first component) and `0x10` (second component).
* Low nibble `1` runs only while the current input pair is near center:
  `FUN_0000AB1C` accepts signed values in `[-4500,4500]`. It normalizes the
  sensor/input vector, applies the `FUN_00003088` small-deadband/clamp stage,
  and writes the two output components. Bits `0x02` and `0x04` apply a
  saturating signed-negation to the first and second output respectively.
  Other nonzero low-nibble values reach the enable gate but have no explicit
  output branch in this v33 function.

`FUN_000083DC` also resolves the calibration/runtime relationship. It stores
`profile+0x120 << 6` as a separate runtime minimum, converts `profile+0x126`,
and converts `profile+0x124` (clamped to `99`) into a fixed-point scale:

~~~text
K     = 0x51EB851F  (Q0.32 representation of approximately 0.32)
scale = ((K * ((100 - min(profile[0x124], 99)) * 0x7FF)) >> 32) >> 5
spMax = profile[0x126] * scale       (fixed/float helper representation)
~~~

The `FUN_000093D8` helper returns fixed `0x47000000` when the scale is zero;
the shifted `0x120` value is retained separately in the runtime record. Byte
`0x125` is included in the debug/calibration report at this point but is not
used by this `sp max` calculation. These fields are separate from the six
stick curve blocks and ordinary center/edge compensation bytes. The
command-level calibration encoder is known (`A5 06 1B p1 p2
(p1+p2-0x3A)`), but it was intentionally not sent, so the exact persistent
mapping from that command to `0x120..0x126` remains unverified.

### Keymap, trigger, and macro compatibility

The official JSON surface contains the following macro and trigger field families:

~~~
runKey, runKeyName, isRepeat, repeatTime, macroJson, mapList,
duration, interval, keyText, showUpLine, showDownLine, showAdd,
id, inUse, option_macro_selected
~~~

`Convert2AppMacroProfile` (`FUN_1039CE60`) converts JSON into the internal macro object. `Convert2MacroJson` (`FUN_1039DEC0`) emits individual event records, and `Convert2MacroProfileJson` (`FUN_1039E8C0`) wraps them in the profile-level object. The internal event list is at `+0x118`; each item has a key count at item `+0`, key bytes beginning at `+1`, primary timing at `+0x0C`, and an optional second timing at `+0x10`. `Implant2PadDef` (`FUN_1039F810`) converts this list into the hardware macro definition; timing is quantized in 8 ms units and the macro duration is capped by `0x7FF8`. v35 uses the related `Implant2PadDef_v35` path for analog/special keys.

The recovered trigger JSON mappings are:

~~~
JSON trigger key 0x17, 0x18, 0x19, 0x1A  <->  app trigger key 0, 1, 2, 3
JSON trigger mode 0, 1, 2, 3               <->  app mode 1, 0, 3, 2
hardware trigger masks                    0x00800000, 0x01000000,
                                           0x02000000, 0x04000000
~~~

`Transform2HWkey_macroKey` (`FUN_103A0160`) uses non-linear hardware masks. The complete logical-ID table recovered from the official helper is:

~~~
0:01000000  1:09000000  2:08000000  3:0A000000
4:02000000  5:06000000  6:04000000  7:05000000
8:10000000  9:90000000 10:80000000 11:A0000000
12:20000000 13:60000000 14:40000000 15:50000000
16:00000800 17:00000400 18:00040000 19:00010000
20:00020000 21:00080000 22:00000001 23:00000002
24:00000008 25:00000010 26:00000040 27:00000100
28:00000080 29:00000200 30:00002000 31:00004000
~~~

The table above is the **macro playback** namespace. It is not the same as
the profile keymap slot namespace or the WndMgr source-key namespace. The
official host-side profile converter has a separate `keyId -> current-input
mask` helper (`FUN_1037CC20`). Its fixed portion is:

```text
host keyId  0..3   -> M1,M2,M3,M4 -> 00800000,01000000,02000000,04000000
host keyId  4..7   -> A,B,X,Y     -> 00000001,00000002,00000008,00000010
host keyId  8..11  -> LB,RB,LT,RT -> 00010000,00020000,00040000,00080000
host keyId 12..20  -> masks       -> 00000040,00000100,00000080,
                                    00000200,00002000,00004000,00008000,
                                    00000800,00000400
```

Host key IDs `21..24` are the device-dependent/dynamic source IDs. The
official helper reads a variant selector from a global device descriptor and
uses `(descriptor[+0x20] - 5)` as an index into the same 11-entry lookup. The
nonzero results are exactly:

| Host key ID | Variant descriptor value | Profile/input bit selected |
| ---: | --- | ---: |
| 21 | `5, 7, 15` / `11` | bit `27` / bit `30` |
| 22 | `5, 7, 15` / `11` | bit `29` / bit `28` |
| 23 | `5, 7, 15` / `11` | bit `22` / bit `27` |
| 24 | `5, 7, 15` / `11` | bit `28` / bit `29` |

Other selector values produce no mask. This is the exact static meaning of
the dynamic source slots; it is not a claim that all four IDs are displayed
by the current v37 page. The `0x164..0x1E3` profile table is indexed by the
resulting input-bit position, which is why M1--M4 appear at profile slots
`23..26` even though the host source IDs are `0..3`.

The official macro JSON converter is a third namespace. `Json2AppMacroKey`
(`FUN_103A1320`) maps the JSON numeric enum to the internal macro event ID as
follows; `--` is the native invalid/sentinel result:

```text
JSON: 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
App : 16 17 -- 18 19 -- 1A 1C 1B 1D 11 10 -- 1E 1F --

JSON: 10 11 12 13 14..21 22 23 24 25 26 27 28 29 2A 2B 2C 2D 2E 2F 30 31
App : 13 14 12 15 --     0E 0A 08 0C 06 02 00 04 0F 09 0D 0B 07 01 05 03
```

`Translate2JsonKeyName` (`FUN_103A1D10`) performs the inverse display lookup
for the macro-event ID. The function adds one before indexing its string
table, so the actual input ID and the displayed string are:

| App event ID | Display name |
| ---: | --- |
| 0..7 | `L↑`, `L↗`, `L→`, `L↘`, `L↓`, `L↙`, `L←`, `L↖` |
| 8..15 | `R↑`, `R↗`, `R→`, `R↘`, `R↓`, `R↙`, `R←`, `R↖` |
| 16..22 | `Start`, `Select`, `?`, `▲`, `▼`, `?`, `Empty` |
| 23..32 | `A`, `B`, `X`, `Y`, `LB`, `LT`, `RB`, `RT`, `L3`, `R3` |

The two literal `?` entries are present in the official string table but have
no proven semantic name and must remain reserved. These JSON/event IDs are
not interchangeable with the profile target-ID table below or with the
`Transform2HWkey_macroKey` masks above.

#### Keyboard vector conversion

Type `0x02` is assembled from a three-element host keyboard vector. Element 0
is either a Windows virtual-key modifier (`VK_LSHIFT` through `VK_RMENU`) or
zero; elements 1 and 2 are the two ordinary virtual keys. `FUN_10271590`
recognizes the modifier in element 0, and `FUN_1037D4B0` converts every
element to the byte stored in the profile entry. The exact nonzero conversion
table is:

```text
VK 08->2A  09->2B  0D->28  1B->29  20->2C
VK 21..28 -> 4B,4E,4D,4A,50,52,4F,51
VK 2D->49  2E->4C
VK 30->27; 31..39->1E..26
VK 41..5A->04..1D
VK 60..69 -> 62,59,5A,5B,5C,5D,5E,5F,60,61
VK 70..7B -> 3A..45
VK A0..A5 -> 02,20,01,10,04,40   (modifier bits)
VK BA..C0 -> 33,2E,36,2D,37,38,35
VK DB..DE -> 2F,31,30,34
```

All other input values, including the unhandled keypad operators and Windows
browser/media keys, return `0`. Values below `0x08` or above `0xDE` also
return `0`. When the first vector element is a modifier, its converted byte
is stored at `entry[1]` and the next two converted values go to `entry[2]`
and `entry[3]`. When it is zero, `entry[1]` is zero and the two ordinary keys
still occupy `entry[2]` and `entry[3]`; this is why the observed `X` record is
`02 00 1B 00`, not `02 1B 00 00`. `FUN_1037EA30` is the corresponding small
reverse lookup used by the official display path for modifier/keyboard
labels; it does not expand the profile entry into a fourth key.

Analog macro keys are represented as byte pairs by `Transform2JoystickAnalog_macroKey`: the eight directional pairs are `(00,7F)`, `(5A,5A)`, `(7F,00)`, `(5A,A5)`, `(00,80)`, `(A5,A5)`, `(80,00)`, and `(A5,5A)`, with the same set available in the second analog slot. This mapping is required for macro JSON round-tripping; treating these values as ordinary button IDs loses information.

#### APP v33 macro storage and playback

The firmware closes the macro storage model even though no official-app
macro-edit capture was taken. A later reversible direct D8 probe is recorded
below. `FUN_000035D0` dispatches `D5`, `D8`, and `D9` over a RAM
area whose base is the macro store pointer at runtime offset `+0x24`:

```text
slot[s] = macro_base + s * 0x294,   s = 0..3
```

Every slot is exactly `0x294` bytes. The active record has this header:

| Offset | Size | Meaning |
| ---: | ---: | --- |
| `+0x00` | 2 | CRC over the active macro prefix, stored big-endian |
| `+0x02` | 2 | active length, big-endian; `10 + step_count * 10` |
| `+0x04` | 1 | recorder setting byte 0 / reserved in the normal run path |
| `+0x05` | 1 | M-key ordinal saved by the recorder |
| `+0x06` | 1 | run-key hardware bit, normally 23..26 for M1..M4 |
| `+0x07` | 1 | flags: bit 0 allows running after release; bit 1 enables looping |
| `+0x08` | 2 | loop/repeat limit, big-endian |
| `+0x0A` | 10 | first step |

Each step is 10 bytes:

```text
+0x00  duration low nibble in bits 4..7; bit 0 is the event/hold marker
+0x01  duration high bits
+0x02..+0x05  24-bit controller input mask in a 32-bit slot
+0x06..+0x09  two signed analog pairs, each byte in -128..127 form
```

The duration is `(((step[0] >> 4) | (step[1] << 4)) << 3)` timer units,
clamped to a 12-bit count (`0xFFF`, or 32760 ms). A maximum of 64 ten-byte
steps is accepted by the recorder. For a marker with bit 0 clear, playback
loads the byte-swapped input mask and analog values. For bit 0 set, it carries
the previous mask/analog state into the second timing stream. Analog bytes are
linearly mapped from `[-128, 127]` to signed stick output `[-32768, 32767]`.

There is no dedicated playback HID command. The main input loop watches
`0x07800000`, finds the slot whose `+0x06` run key matches M1..M4, and invokes
the runtime player. The player ends after both press/release streams finish
unless `slot[+0x07] & 2` is set. In loop mode it waits 399 timer ticks, bumps
the repeat counter, and ends when `2 * byte_swap(slot[+0x08]) <= old_counter`;
this exact comparison explains the apparent UI off-by-one in repeat counts.
If `slot[+0x07] & 1` is clear, releasing the run key ends playback; if set,
release is not required and the macro can complete as a one-shot/toggle run.

The protocol-side storage operations are:

| Operation | Firmware behavior |
| --- | --- |
| `D5` | returns a 20-byte logical response (`A5`, length, `D5`, 16 bytes of four slot headers, checksum); the useful slot-header payload is 16 bytes |
| `D8` | the MCU slot writer addresses a fixed `0x294`-byte slot allocation, validates the active record's CRC/length, stores it, clears its run-key bit from `turboKey`, and returns one status byte; the official DevMgr writer sends only the variable-length active prefix described below |
| `D9` | accepts slot index at request `+3`; returns the slot block using its big-endian active length |
| `FC 01` | starts recording with four setting bytes and a two-byte repeat value |
| `FC 00` | stops recording and finalizes length/CRC |

The official JSON editor fields (`runKey`, `isRepeat`, `repeatTime`,
`macroJson`, `mapList`, `duration`, `interval`, and the show-up/show-down
flags) therefore map to the D8 slot image; playback itself is firmware-local.
The logical D8 buffer built by the official `DevMgr.dll` is now also static-
exact. For `N` ten-byte steps, define `L = 10 + 10*N`; the buffer passed to
the generic USB command helper has `L + 5` bytes:

| Offset | Bytes | Meaning |
| ---: | ---: | --- |
| `+0..1` | `A4 D8` | outer logical command key |
| `+2..3` | `LE(L + 1)` | command length used by the DevMgr wrapper |
| `+4` | slot index | macro slot `0..3` |
| `+5..6` | 2 | CRC over `+7`, stored BE; the current v37 unit accepts the reflected CRC-16/MODBUS result with initial `0xFFFF` |
| `+7..8` | `L` BE | active macro-record length |
| `+9..14` | 6 bytes | copied macro header fragment; the final two bytes are byte-swapped to wire order |
| `+15..` | `10*N` | steps; every step's input-mask dword at step `+2` is byte-swapped |

The response parser accepts the five-byte logical status
`A5 05 D8 status SUM8`; it validates `SUM8` over the first four bytes and
does not return the slot image. The fixed `0x294` size is therefore the
device-side slot allocation, not the length of the official active-prefix
request.

The generic `CSendPacket` layer then fragments the D8 source after its first
four bytes using the same static report format as D6/D7:

```text
A4 LEN D8 SEQ PAYLOAD SUM8
```

`PAYLOAD` is copied from the logical D8 buffer at `+4`, is at most 59 bytes,
and each full report has `LEN=0x40`; the Windows HID report adds report ID
`00` and is zero-padded to 65 bytes. For `N` steps the source data length is
`L+1`, so the number of reports is `ceil(L/59)`. At the recorder maximum
`N=64`, `L=650`, the static writer emits 12 reports: 11 full reports and a
final `LEN=0x07` report carrying the last two source bytes. This is the static
transport proof from `CSendPacket::operator<<`; a one-step non-empty record
written into an originally empty slot is live-validated below. Full 64-step
fragmentation remains static-only.

#### Live macro readback (2026-08-09)

The connected `VID_413D PID_2104` configuration interface accepted the
read-only `D5` and `D9` requests. The logical responses were:

```text
D5: A5 14 D5 DF ED 00 0A 1F D0 00 0A 1F 94 00 0A DF A9 00 0A AC
D9[0]: A5 0E D9 DF ED 00 0A 00 00 1F 00 00 00 81
D9[1]: A5 0E D9 1F D0 00 0A 00 01 1F 00 00 00 A5
D9[2]: A5 0E D9 1F 94 00 0A 00 02 1F 00 00 00 6A
D9[3]: A5 0E D9 DF A9 00 0A 00 03 1F 00 00 00 40
```

All four live slots have active length `0x000A`, so they contain zero
ten-byte steps. Their stored CRCs are `DFED`, `1FD0`, `1F94`, and `DFA9`.
The returned empty-slot headers are `+0x04=00`, `+0x05=slot`,
`+0x06=1F`, `+0x07=00`, and repeat `0000`; the raw `0x1F` value is recorded
as a live default and is not reinterpreted as an M-key mask. This validates
the D5/D9 read path on the current unit. A same-content empty slot-0 record
was then sent through D8 and returned `A5 05 D8 00 82`; the immediate D9
readback was byte-identical.

A reversible non-empty probe was then sent to the same originally empty slot.
The normalized active record returned by D9 was:

```text
7A 7D 00 14 A5 5A 1F 03 12 34
50 00 12 34 56 78 11 22 33 44
```

The D8 response was `A5 05 D8 00 82`. The arbitrary header bytes `+0x04..+0x09`
and all ten step bytes survived unchanged; only the CRC and active-length fields
were normalized by the writer. The original empty record
`DF ED 00 0A 00 00 1F 00 00 00` was written back and read back byte-for-byte.
The probe deliberately used `+0x06=1F`, not an M1--M4 run key, so it did not
trigger playback. This is live proof of non-empty D8/D9 storage and restoration,
not yet proof of physical playback output.

The live records resolve the CRC implementation used by the Tauri D8 writer:
reflected CRC-16/MODBUS, polynomial `0xA001`, initial value `0xFFFF`, calculated over
record bytes `+0x02..active_length-1`, stored big-endian. The older static note
`CRC16-1021` describes the decompiler-side helper label and is not the byte result
accepted by this unit. The Tauri live tests now perform D5/D9, a reversible one-step
non-empty D8/D9 probe, ACK validation, restoration, and the EF/0B auxiliary probes
against the connected device.

#### Official WndMgr v37 macro encoder

The official `CProfileAdaptor` closes the UI-to-slot conversion that was
previously missing. `FUN_1039FBE0` consumes the internal macro object at these
fields:

| Host offset | Meaning |
| ---: | --- |
| `+0x10C` | `runKey` ordinal `0..3`; `FUN_103A0080` maps it to M1--M4 masks and `+0x06` becomes runtime bit `23..26` |
| `+0x110` | internal press/loop mode |
| `+0x114` | top-level `repeatTime` scalar; emitted to slot `+0x08` as `(value + 7) >> 3` after the host/wire endian conversion |
| `+0x118` | iterable `mapList` |

The visible mode order is `LongPress_NoLoop`, `Tap_NoLoop`,
`LongPress_Loop`, `Tap_Loop`. The official mode converter maps those four UI
indices to internal values `1, 0, 3, 2`, and the encoder maps the internal
values to slot `+0x07` as follows:

| UI mode | Internal value | Slot `+0x07` |
| --- | ---: | ---: |
| Long press, no loop | `1` | `0x00` |
| Tap, no loop | `0` | `0x01` |
| Long press, loop | `3` | `0x02` |
| Tap, loop | `2` | `0x03` |

Thus bit 0 is the tap/release-insensitive selection and bit 1 is the loop
selection. This agrees with the firmware player: bit 0 clear requires the
run key to remain asserted, while bit 0 set allows the player to finish after
release; bit 1 enters the loop/repeat path.

Each `mapList` element has a key-count byte at `+0`, key IDs at `+1..`, a
press duration at `+0x0C`, and an optional release/interval duration at
`+0x10`. The encoder emits one ten-byte firmware step for the press and a
second zero-mask timing step when the optional interval is nonzero. Macro
logical IDs `0..15` are reserved by the official helper for the two sets of
eight analog-direction pairs; IDs `16..31` are converted to the non-linear
controller mask table already listed above. The host database separately
persists `FMacroJson`, `FRunKey`, `FRunKeyName`, `FIsRepeat`, and
`FRepeatTime`.

The version dispatcher `FUN_1038EF40` selects this encoder for the v37
compatibility branch (`0x01E4/0x37`) and has parallel v34/v35/v36/v39 paths.
This proves the official UI conversion path, but not a single universal outer
HID frame: the final dispatch is a version-specific virtual call. The raw v33
firmware D8/D9 slot offsets and the v35-named DevMgr logical encoder are now
known; one-step non-empty storage and restoration are live-confirmed. Actual
step playback/physical output, full multi-step fragmentation, and the final
version-specific outer dispatch remain unverified.

### Official update and auxiliary parser frames

The following frames are recovered from parser encoders and their callers. `SUM8` means the wrapping sum of the preceding transmitted logical bytes unless a fixed buffer slot is called out.

| Operation | Official wire shape | Call-site detail |
| --- | --- | --- |
| Launch keymap | `A5 05 FB mode SUM8` | five bytes |
| Begin MCU update | `A5 09 86 16 p1LE[2] p2LE[2] SUM8` | nine bytes |
| MCU update data | `A5 LEN 88 payload` | payload is at most 60 bytes; caller sends a fixed 64-byte buffer and encoder stores its checksum at byte 63 |
| End MCU update | `A5 05 05 00` | official caller passes four bytes even though the encoder writes the checksum into the following buffer slot; mirror the four-byte call until a live capture proves otherwise |
| Switch to U-disk | `A5 05 D3 mode SUM8` | mode is `03`, or `83` when the caller's mode parameter is zero |
| Set screen-record flag | `A5 05 FD flag SUM8` | flag preserves/changes bits `0x7E`/`0x01` according to the requested enable state |
| Start macro recording | `A5 0B FC 01 p1LE[4] p2LE[2] AD` | eleven bytes |
| Stop macro recording | `A5 05 FC 00 A6` | five bytes |

The parser for `StartScreenRecord::Encode` is empty, but its decoder is not empty: it accepts a five-byte event with response key `A5 05 FC` and validates the wrapping checksum. `CDeviceBBwon::OnStartScreenRecord` dispatches that event. Thus the current evidence points to an asynchronous/device-to-host screen-record event, not a normal host-to-device start command; the same `FC` key also appears in the static stop-macro request and must be disambiguated by direction/context. The MCU update timeout in the native caller is 20 seconds. The frame shapes above remain static-only: do not invoke update, U-disk, screen-record, or macro-record operations as a compatibility test on the current device.

### Other command encoders recovered from DevMgr

These additional command families are present in the official library. The same command byte can be overloaded by device/context-specific helpers, so a frame shape recovered from one caller must not be generalized to every model. The live revalidation in this project exercised only the read-only probes listed earlier.

| Function | Request or setter shape |
| --- | --- |
| Profile size | `A5 04 D3 7C` |
| Save profile | `A5 05 0E 00 B8` |
| Wireless flag | `A5 04 FA A3` |
| Device mode get/set | get `A5 04 E1 8A`; set `A5 06 E1 p1 p2 SUM8` |
| Polling rate get/set | get `A5 04 F6 9F`; set `A5 05 F6 value (value-0x60)` |
| Motion-rate get/set | get `AB 05 05 25 DA`; set `AB 07 05 25 pLE[2] SUM8` |
| Step accuracy | get `A5 04 F7 A0`; set forms are `A5 07 F7 ...` and `A5 08 F7 ...` |
| Device UUID | `A5 0C EF [8 reserved bytes] A0` |
| Smart/trigger info | get `A5 04 F8 A1`; set forms are `A5 07 F8 b1 b2 b3 SUM8` and the four-data-byte variant `A5 08 F8 ...` |
| Test mode | `A5 05 19 value (value-0x3D)` |
| Power information | `A5 04 AD 56` |
| ZKM version | `A5 04 0B B4` |
| Receive-key event switch | `A5 05 D2 value (value+0x7C)` |
| Gamepad mode get/set | get `A5 04 D4 7D`; set `A5 07 D4 p1 p2 p3 SUM8` |
| Macro list/info | get list `A5 04 D5 7E`; get item info `A5 05 D9 index (index-0x7D)`; `D8` stores into a fixed `0x294`-byte slot from the variable active-prefix frame above and returns one status byte |
| Logo LED get/set | get `A5 04 F5 9E`; set `A5 0D F5 + 9 data bytes + SUM8` |
| LED brightness | get `A5 04 72 1B`; set `A5 05 72 value (value+0x1C)` |
| LED show/mode | show `A5 04 70 19`; mode get `A5 04 73 1C`; mode set `A5 05 73 mode (mode+0x1D)` |
| Calibration | `A5 06 1B p1 p2 (p1+p2-0x3A)` |
| Reset | `A5 05 1A 00 C4`; destructive |

The exact checksum constants for some setter forms are encoded in the native helper and are already preserved in the decompilation notes; they should be implemented from those helpers rather than inferred from command length. For the short `A5 04 CMD SUM8` requests, the final byte is the modulo-256 sum of `A5 + 04 + CMD`: therefore `AD` uses `56` and `F7` uses `A0`. The live step-accuracy capture sent `A5 04 F7 A0` and returned `A5 08 F7 00 20 00 00 C4`; `F7 0A` is not an alternative USB-switch request and was not observed in the saved captures. `AD` and `D4` were explicitly unsupported on the connected device even though their official parser classes exist. Do not send the reset or any setter while the current profile is intentionally being preserved.

### Lighting and preset database surface

The official preset database `LightPreset.db` contains `t_LightPreset` with these compatibility-relevant columns:

~~~
FID, FID_WebService, FPhoneUUID_WebService, FDevUUID, FDevName,
FUserID_WebService, FLightPresetGUID, FLightPresetName,
FLightPresetJson, FFirmwareVersion, FZKMVersion, FDateTimeCreate, FDeleted
~~~

The built-in `DefaultLight.ini` presets are `Default`, `Rainbow3`, and `Gale2`. Their JSON uses `bright`, `colorMode`, `effectMode`, `lightColorMap`, `lightZoneR3`, `speed`, and `symmetrical`; `lightColorMap` contains zone IDs `"1"` through `"14"` with RGB/ID values. This is the local persistence format that a compatible UI must preserve, independently of the HID lighting command.

Static analysis of the `CDeviceBBwon` lighting vtable refines this boundary. The consecutive methods are `GetLogoLED`, `SetLogoLED`, `GetLEDBrightRequest`, `SetLEDBrightRequest`, the dynamic `SetLED`, the fixed `SetLED`, `SetLEDShow`, `GetLightingMode`, and `SetLightingMode`. The direct encoders prove:

- `SetLogoLED` is `A5 0D F5` followed by three 24-bit big-endian color arguments and `SUM8` (13 logical bytes).
- `SetLEDBrightRequest` is `A5 05 72 value (value+0x1C)`.
- `SetLightingMode` is `A5 05 73 mode (mode+0x1D)`.
- `SetLEDShow`'s no-argument request is `A5 04 70 19`.

The two overloaded `SetLED` methods share the same lower-level send helper but accept caller-supplied headers. The fixed method sends exactly 16 logical bytes and overwrites the most-significant byte of its fourth input word with the wrapping sum of the 15 preceding bytes. The dynamic method copies RGB triples at offset 12, derives `logicalLength = headerByte1 + 3*rgbCount + 1`, and writes `SUM8` at the final logical byte. The command registry contains `70/71/72/73`, while the named `70`, `72`, and `73` methods account for the other three slots; therefore the strongest static mapping is that both overloaded `SetLED` forms use command `71`. If the caller's base header byte is `0x0C`, the dynamic shape is `A5 (0x0D+3N) 71 + 9 header bytes + 3N RGB bytes + SUM8`, and `N=1` has the same 16-byte length as the fixed path. The `71` association and the caller's remaining header bytes are still static inference; a live official LED change is required before sending either form.

Calibration and reset are also direct no-wait encoders rather than response-waiting parser calls: calibration is `A5 06 1B p1 p2 (p1+p2-0x3A)`, and reset is `A5 05 1A 00 C4`. This explains why their wrapper code alone does not establish success/ACK semantics. Neither setter was sent during this analysis.

### Device identity and non-profile persistence

The v37 `0x01E4` payload has no validated profile-name, model-name, or
firmware-version field. The name and version columns in `LightPreset.db`
(`FLightPresetName`, `FFirmwareVersion`, `FZKMVersion`, and the device UUID/name
columns) belong to the host preset database, not to the profile payload. The
HID/device identity surface is separate: VID/PID and usage identify the
configuration interface, `EF` returns an eight-byte device UUID, `0B` returns
one ZKM-version byte, and the firmware/update image supplies the firmware
identity. The exact static request/response boundaries are:

| Query | Request | Parsed result |
| --- | --- | --- |
| Device UUID | `A5 0C EF 00 00 00 00 00 00 00 00 A0` | response `A5 0C EF uuid[8] SUM8`; the parser validates all 12 logical bytes and retains `uuid[8]` |
| ZKM version | `A5 04 0B B4` | response `A5 LEN 0B version SUM8`; the official caller returns response byte `+4` and normalizes ASCII `'8'` to `'6'` |

Neither query is a profile-name or firmware-semver field. The official
firmware/update path obtains its identity from the selected BUP/FOT image and
its update metadata, outside the v37 profile bytes.

The remaining auxiliary state is therefore split as follows:

| Surface | Static result |
| --- | --- |
| Logo LED | `F5` with three 24-bit big-endian RGB values |
| LED brightness | `72 value` |
| LED show/mode | `70` show, `73` mode get/set |
| Per-zone LED colors | fixed/dynamic `71` caller formats; RGB placement is known, remaining header fields need one live capture |
| Screen recording | `FD` stores the flag; `FC` five-byte event is decoded device-to-host, not a proven start request |
| Extra device mode | `E1` get/set is known statically; `D4` gamepad-mode parser exists but returned unsupported on this unit |
| Power/UUID/ZKM | `AD`, `EF`, and `0B` parser families; `AD` was unsupported on this unit |
| Firmware/update | `86/88/05` update family and BUP/FOTA identity; not part of v37 profile bytes |

#### Live auxiliary readback (2026-08-09)

The same configuration interface returned the following read-only results:

```text
EF: A5 0C EF 55 E8 22 4A 7A 68 00 00 2B
0B: A5 05 0B 37 EC
F5: A5 05 FF F5 9E
72: A5 05 FF 72 1B
70: A5 05 FF 70 19
73: A5 05 FF 73 1C
```

Thus the live UUID is `55 E8 22 4A 7A 68 00 00`, the raw ZKM byte is
`0x37`, and this unit explicitly reports the four LED getter/show/mode
requests as unsupported. `F8` smart/trigger info timed out on this run;
the timeout is not treated as a valid zero response. A same-content v37
`D7` write using the preserved `0x8847` profile returned the live ACK
`A5 05 D7 00 81`; a subsequent `D6` still timed out before its first
fragment. No reset, LED setter, calibration, or recording command was sent.

This resolves where the missing name/model/firmware fields live: they must be
kept in host metadata or queried through auxiliary commands, never synthesized
inside the 484-byte v37 profile.

### 2026-08-08 APP_mcu_v33 stick deadzone and compensation analysis

`docs/Blitz2_V313333.bup` contains `APP_mcu_v33.bin`. The extracted image is Thumb code; the stick compensation routine is at raw offset `0x4C64`. The routine is shared as code, but the settings are not shared between sticks: `r0` is the stick index and the internal configuration pointer is calculated as:

```text
config = 0x20004B20 + (stick_index * 0x18)
```

Consequently, center, edge, curve coefficients, and compensation parameters are read from separate 24-byte runtime records for the left and right sticks. The routine applies one radial scale to the two axes of the selected stick; it does not use the left stick's values for the right stick.

The processing sequence recovered from the Thumb instructions is:

1. Read signed 16-bit X/Y values for the selected stick.
2. If the selected curve mode or the global processing flag is disabled, bypass the curve path. Zero input is also bypassed.
3. Calculate the vector magnitude and normalize it by `327.68`, producing an approximately 0–100 axis-percent radius. The routine compares this value against `100.0`.
4. Select the appropriate curve segment and calculate a scalar compensation multiplier with the firmware's software floating-point divide/multiply helpers. The only unconditional zero result in this routine is the near-zero input guard; the user-facing center value is carried through the curve intercept/runtime point data.
5. Multiply both original axes by that same multiplier, rescale by `327.68`, convert back to signed 16-bit values, and write them to the selected stick's X/Y locations.

The live v37 serialization already established the two user-facing mappings independently for each curve block:

| UI value | Wire representation | Firmware meaning |
| --- | --- | --- |
| Center | positive magnitude at `+0x02`; negative magnitude at `+0x03` | inner response/compensation control; not proven to be a standalone hard-zero threshold |
| Edge | positive `0x64 - UI` at `+0x08`; negative `0x64 + UI` at `+0x09` | outer endpoint/compensation threshold |

The edge value therefore does not mean that the output becomes zero at the edge. It moves the point at which the response is compensated toward the 100% endpoint; the routine has a separate segment for the interval between the edge threshold and 100%.

#### Exact v33 runtime curve algorithm

`FUN_00004894(axis, mode)` loads one of three 44-byte source records for each
axis into a 24-byte runtime record at `0x20004B20 + axis*0x18`. The runtime
record is:

```text
+0x00, +0x04, +0x08  float segment slopes c0, c1, c2
+0x0C               enable/mode byte
+0x0D..+0x14        four packed signed point pairs q0, q1, q2, q3
```

The packed pairs are read as `(low_byte, high_byte)` and are validated to
`0..100`. `FUN_000046B0` derives the exact slopes:

```text
c0 = (q1.y - q0.y) / q1.x                 (0 if q1.x == q0.x)
c1 = (q2.y - q1.y) / (q2.x - q1.x)       (0 if q2.x == q1.x)
c2 = (q3.y - q2.y) / (100 - q2.x)        (0 if q3.x == q2.x;
                                           denominator 1 when q2.x == 100)
```

For signed input `(x,y)`, the routine first computes `r=sqrt(x*x+y*y)` and
`m=r/327.68` (the constant is the double `0x3F690000_00000000`, exactly
`0.0030517578125`). It normalizes `(x,y)` by `r`, then selects a scalar gain:

```text
if m <= q1.x: g = q0.y + c0 * m
else if m <= q2.x: g = q1.y + c1 * (m - q1.x)
else if m <= 100: g = q2.y + c2 * (m - q2.x)
else: g = q3.y + (m - q3.x)
```

When the per-axis cap flag is clear, `g` is limited to `103`. The normalized
components are multiplied by `g*327.68` (the reciprocal constant is the
double `327.68`) and saturated back to signed 16-bit values. The same `g` is
used for X and Y, so the transform is radial rather than two independent
axis curves. The only unconditional zero test in this routine is the tiny
`r <= 1e-5` threshold; the user-facing center bytes enter the q0/curve
intercept path and should not be modeled as a separate hard zero without
another input/output capture.

The source records for the three presets have the same complete field layout:
mode, YDivx, q0, q1, q2, q3, filter, signed midpoint offsets, four percentage
bytes, and four three-byte direction-key descriptors. The v37 six blocks are
the three modes for left and right. The loader also copies the selected
center/edge bytes into a small runtime compensation record, so calibration and
curve selection are separate stages rather than one shared coefficient table.

The previously unresolved stabilization/filter byte is the source `filter`
field (`+0x18` in the runtime source record, serialized by the v37 block's
stabilization slot). `FUN_00004FA0` has three distinct cases, with `f` treated
as a signed byte:

```text
f > 0:
    k = f * 20
    candidate_x = x + (PRNG() mod (2*k)) - k
    candidate_y = y + (PRNG() mod (2*k)) - k
    accept both candidates only when
        (candidate_x-x)^2 + (candidate_y-y)^2 < k^2;
    otherwise retain x,y.

f == 0:
    update each axis only when its change from the stored result is >= 5;
    zero and near-full-scale values are always allowed through.

f < 0:
    t = -f;
    before the curve stage, compare each raw-axis change with t. Small
    changes increment a counter and are averaged with the stored result for
    the first 40 samples; a change beyond t resets the counter and holds the
    prior sample. The normal 5-count output gate still applies afterward.
```

The PRNG is the firmware LCG `state = state * multiplier + 0x3039`, returning
`state >> 1`; it is not a floating-point coefficient. This explains why a
positive stabilization value can look noisy in a byte-by-byte output trace,
whereas zero is a deterministic 5-count hold filter and negative values are a
threshold/settling mode. The stabilization byte is therefore now decoded
semantically, although exact user-label wording remains an app/UI concern.

#### Sensor/calibration separation

`FUN_000083DC` consumes profile bytes `0x11F..0x126`: direction flags at
`0x11F`, minimum at `0x120`, sensitivity at `0x123`, scale/curve selector at
`0x124`, and the two calibration/max bytes at `0x125..0x126`. It computes a
runtime sensor maximum using the `0x126` float conversion, the `0x124` scale
helper, and `(0x120 << 6)`. `FUN_0000813C` then applies the sensor mode and
feature mask, selects the axis, applies sensitivity, swaps/inverts the sensor
components according to `0x11F`, and injects the result into the stick path.
Those values do not feed the radial curve coefficients above. The calibration
command (`A5 06 1B ...`) and its persistent result still need a live before /
after capture to establish which user calibration control updates which of
these bytes.

### 2026-08-08 key binding, polling rate, and step accuracy analysis

#### Key bindings

The v37 profile contains a 32-entry keymap region at `0x164..0x1E3`:

```text
entry[i] = profile[0x164 + 4*i .. 0x168 + 4*i], i = 0..31
```

`CProfileAdaptor::Convert2AppBaseProfile` copies `mapKeys[i]` into this region, and the reverse profile path serializes the same four-byte entries. `CAdvanceConfigKeymapVirtualWnd::LoadProfile_v37` and `FUN_1037cc20` provide the logical-name mapping below. The profile slot is the hardware bit index returned by the native conversion; the same table is therefore also used when decoding target bytes in an entry.

| Profile slot / target byte | Logical button name | Evidence or status |
| ---: | --- | --- |
| 0 | A | fixed native mapping |
| 1 | B | fixed native mapping |
| 2 | Reserved / unassigned | native `-1` sentinel |
| 3 | X | fixed native mapping |
| 4 | Y | fixed native mapping |
| 5 | Reserved / unassigned | no named fixed mapping |
| 6 | LB | fixed native mapping |
| 7 | RB | fixed native mapping |
| 8 | LT | fixed native mapping |
| 9 | RT | fixed native mapping |
| 10 | View | fixed native mapping |
| 11 | Menu | fixed native mapping |
| 12 | Reserved / unassigned | no named fixed mapping |
| 13 | L3 | fixed native mapping |
| 14 | R3 | fixed native mapping |
| 15 | Share | fixed native mapping |
| 16 | Up | fixed native mapping |
| 17 | Down | fixed native mapping |
| 18 | Left | fixed native mapping |
| 19 | Right | fixed native mapping |
| 20 | Dynamic / device-specific | not exposed by the current official UI |
| 21 | Dynamic / device-specific | not exposed by the current official UI |
| 22 | Dynamic / device-specific | not exposed by the current official UI |
| 23 | M1 | fixed native mapping |
| 24 | M2 | fixed native mapping |
| 25 | M3 | fixed native mapping |
| 26 | M4 | fixed native mapping |
| 27 | Dynamic / unassigned | no fixed name proven |
| 28 | Dynamic / unassigned | no fixed name proven |
| 29 | Dynamic / unassigned | no fixed name proven |
| 30 | Dynamic / unassigned | no fixed name proven |
| 31 | Dynamic / unassigned | no fixed name proven |

The four bytes in one entry have a fixed mode/output split. `FUN_0000E804` and
`FUN_00008958` in `APP_mcu_v33.bin` prove the following v33 behavior:

| Byte | Type `0x01` (controller) | Type `0x02` (keyboard) |
| --- | --- | --- |
| `entry[0]` | mode selector | mode selector |
| `entry[1]` | controller output 0, or `0xFF` empty | HID modifier byte |
| `entry[2]` | controller output 1, or `0xFF` empty | keyboard usage 0, `0` empty |
| `entry[3]` | controller output 2, or `0xFF` empty | keyboard usage 1, `0` empty |

There is no independent fourth-role byte: the fourth byte is the third output
byte. Type `0x01` replaces one source controller bit with up to three target
bits. Type `0x02` leaves the controller source mask unchanged and instead
updates the eight-byte HID keyboard state; the first output byte is ORed into
the modifier byte and the other two are inserted as usages. The firmware's
keyboard add/remove helpers ignore zero usages and deduplicate the usage list.
The type-`0x01` Null encoding is `01 FF FF FF`; the official clear path also
uses an all-zero type-`0x00` record. A single entry cannot mix controller and
keyboard output modes, but either mode can be composite within its three
output bytes.

The LT/RT entries have one special conversion: source LT (hardware bit 8) and
source RT (bit 9) can copy the original trigger byte to the opposite mapped
trigger output. If the required opposite mapping is absent, the firmware
writes `0xFF` to that output. The profile flags at `0x184` and `0x188` zero
the original LT/RT input bytes before this remap, respectively. This is why a
raw target byte must not always be displayed as an ordinary button name.

The firmware string table supplies a second, lower-level target-name namespace
that resolves the formerly dynamic target IDs for APP v33:

~~~
0 A       1 B       2 C       3 X       4 Y       5 Z
6 L1      7 R1      8 L2      9 R2     10 SELECT 11 START
12 HOME  13 L3     14 R3     15 CAPTURE 16 UP    17 DOWN
18 LEFT  19 RIGHT  20 BACK   21 MODE   22 MENU   23 M1
24 M2    25 M3     26 M4     27 M5     28 M6     29 M7
30 M8    31 POWER
~~~

This table is the firmware target-ID table, not a promise that every target is
exposed by the current v37 WndMgr page. It explains the M5--M8 and POWER
targets and distinguishes the low-level `C/Z`, `L1/R1`, and `L2/R2` aliases
from the older native UI table. Unknown or model-specific aliases must still
be preserved as raw bytes.

#### Tauri key-binding editor (2026-08-09)

The Tauri editor now follows the official interaction model: the visible list is ordered as `M1..M4`, `A..Y`, the four directions, triggers, bumpers, stick clicks, `View`, `Menu`, and `Share`; each row opens a controller-key or keyboard-key selection dialog, with `Null` in the controller list. The 32 raw entries remain available in a collapsed detail section.

Two concrete records in the preserved pre-reset `profiles/set-profile-v37-frame.bin` provide the write shapes used by the editor. After removing the four-byte `A4 D7 E4 01` frame header, the M1 entry at profile offset `0x1C0` is `02 00 1B 00` (keyboard usage `0x1B`, `X`), and the M2 entry at `0x1C4` is `01 09 FF FF` (controller target slot `9`, `RT`). Accordingly, a selected controller target is serialized as `01 target FF FF`, a selected keyboard key as `02 00 usage 00`, and `01 FF FF FF` represents a Null target. An all-zero entry remains the profile's identity/default representation. These keyboard and Null encodings are evidence-backed but should receive another live per-key capture before being treated as universal across firmware revisions.

The official per-row `連射` control is shown in Lite for every visible M-key source. Tauri now reads and writes the statically proven complete `0x140..0x143` mask and `0x144` speed index; it deliberately does not synthesize the unrelated `0x03B`, `0x146`, or `0x167` side effects seen in one M1 save capture. Those bytes remain preserved through raw-profile writes.

#### Live rapid-fire isolation (2026-08-09)

The official app was captured with one UI item changed at a time. The baseline was a 484-byte v37 profile with CRC `0x8E12`. Only the `M1` row's `連射` control was changed from off to on, followed by the official `セーブ` action. The post-save profile readback had CRC `0x419B` and exactly these payload changes:

| Profile offset | Off | M1 連射 ON | Observation |
| ---: | ---: | ---: | --- |
| `0x03B` | `0x0F` | `0x4B` | Right Default curve block `+0x01`, the `stickRightCurveYDivx` field. It is not a turbo field. |
| `0x146` | `0x00` | `0x80` | Adjacent raw byte in the host-side `0x144..0x147` save object; v33 turbo code does not read it as the key mask or speed index. |
| `0x167` | `0x47` | `0xC7` | `entry[0].output[2]` (`0x164 + 3`), the third output byte of source slot 0; its exact interpretation depends on `entry[0]`'s mode. |

The checksum bytes at `0x000..0x001` changed from `8E 12` to `41 9B` as expected. The live M1 save changed `0x144..0x147` from `00 00 00 00` to `00 00 80 00`, but the static firmware path loads only `profile[0x144]` as the speed index; it does not assign `0x146` a turbo meaning. The three simultaneous changes therefore have three different structural owners: `0x03B` is right-stick curve data, `0x146` is an adjacent/legacy host-side field, and `0x167` is a keymap output byte. The capture proves that the official M1 save path mutates all three, but it does not prove that any of the three is the actual M1 enable bit.

The official host code narrows this further. `WndMgr.dll`'s `OnSelectChanged_checkbox_turbo_m1` first stores the checkbox state in a UI/global turbo-row array; it does not write profile byte `0x146` directly. The v37 `DevMgr.dll` send-only path then copies the 484-byte profile and byte-swaps the host-side 32-bit object at `+0x144` (`0x144..0x147`) as one field. On the profile side, the v37 extract/implant paths assign only `0x144` in that neighborhood and leave `0x145..0x147` outside the known serialized fields; the APP v33 turbo reader likewise has no read of `0x146`. No host or firmware routine found so far reads `0x146` as an independent M1 flag. Therefore `0x146=0x80` is best classified as an opaque serialized member of the adjacent host/legacy field or preserved gap; its exact UI-derived subfield remains unresolved, but it is not the firmware turbo mask.

A second static pass closes the normal M3/M4 save bytes. `Implant2PadSet_v37` iterates the host rows at `object + 0x6D8 + row * 0x1C`; the row's third word is the turbo checkbox boolean. `FUN_1037CC20` maps host key IDs `0,1,2,3` to runtime masks `0x00800000, 0x01000000, 0x02000000, 0x04000000`, and the serializer sets or clears the corresponding bits in `profile + 0x140`. Consequently the statically proven M3 and M4 stored patterns are `00 00 02 00` (`+0x142`) and `00 00 04 00` (`+0x143`). The four `WndMgr.dll` M1--M4 checkbox handlers are structurally identical and only update that host-row boolean. The captured M1 `+0x146=80` mutation is therefore outside this normal mask write; its exact legacy/UI path remains unresolved and needs a separate capture or caller-state trace.

This is enough to reject treating the observed M1 save as a single global boolean, but it is not enough to name the changed field. An independent M2 isolation was then performed on the same saved profile; its result is below. The Tauri editor uses the firmware mask mapping for all four M keys and preserves the separately unresolved M1 side effects. The live test was not reverted; the physical controller remains with M2 rapid on.

#### Live M2 rapid-fire isolation (2026-08-09)

The official UI showed the `M2` row's `連射` indicator changing off -> on. Both snapshots were 484-byte reads of the same saved `rapid-m2` profile; the only payload change was:

| Profile offset | M2 連射 OFF | M2 連射 ON | Observation |
| ---: | ---: | ---: | --- |
| `0x140` | `0x00` | `0x01` | Low byte of the statically identified `turboKey` mask; bit-0 M2 candidate. |

The checksum bytes at `0x000..0x001` changed from `88 47` to `40 0A`. No other payload byte changed. Therefore this M2 capture does **not** set the M1 capture's `0x146` bit or alter the M2 keymap entry at `0x168..0x16B`; in this profile M2 rapid is represented by `0x140: 00 -> 01`. A later repeat of the full `D6` read after reapplying M2-on timed out while the profile-size (`D3`) probe still responded, so the result above is based on the two successful full snapshots and should be retained as the byte-level evidence.

#### v33 turbo mask and speed timing

The firmware analysis closes the remaining speed and mask questions for the
v33 APP build. `FUN_0000DD04` stores a byte-swapped 32-bit logical mask at
`profile[0x140..0x143]`; `FUN_0000DCE0` loads it into the runtime turbo state.
The macro/rapid dispatcher independently identifies `0x07800000` as the
four M-key group, so the complete M1--M4 mapping is:

| M key | Runtime logical mask | Stored profile bytes at `0x140..0x143` |
| --- | ---: | --- |
| M1 | `0x00800000` (bit 23) | `00 80 00 00` |
| M2 | `0x01000000` (bit 24) | `01 00 00 00` |
| M3 | `0x02000000` (bit 25) | `00 00 02 00` |
| M4 | `0x04000000` (bit 26) | `00 00 04 00` |

The M2 live result (`0x140` bit 0) is exactly the second row after this
byte-order conversion. The table is both a firmware-level mask proof and a
static v37 host-serialization proof. It is not a live M1/M3/M4 save capture:
the normal bytes are known, but the capture-specific M1 `+0x146` side effect
and the exact UI route for the other rows remain unverified.

`profile[0x144]` is a one-byte index. The pointer literal at APP raw
`0xDF14` resolves, under the image's `0x08003000` code mapping, to raw table
`0xF730`, whose first three bytes are `C8 64 32` = `200, 100, 50`. The runtime
routine toggles the turbo phase when elapsed time reaches half of the selected
value. Thus the complete on/off periods are:

| Index | Table value | Half-toggle interval | Complete period | Frequency |
| ---: | ---: | ---: | ---: | ---: |
| `0` | `200` | `100 ms` | `200 ms` | `5 Hz` |
| `1` | `100` | `50 ms` | `100 ms` | `10 Hz` |
| `2` | `50` | `25 ms` | `50 ms` | `20 Hz` |

These are the v33 firmware timer values; the macro recorder uses the same
timebase and quantizes recorded durations by `>> 3` into 8 ms units. The
`0x144` value is therefore a real timing selector, not merely a UI index.

#### Polling rate (`F6`)

The official `CDeviceBBwon` encoders are:

```text
GetRateOfReturn:  A5 04 F6 9F
SetRateOfReturn:  A5 05 F6 value (value - 0x60)
```

The setter's `value` is a one-byte parameter and the second data byte is calculated by the native helper as `value - 0x60` with byte wrapping. The response observed in the isolation capture was `A5 06 F6 00 03 A4`, where the second data byte is the rate code. The official `WndMgr.dll` option handlers establish the four-choice mapping:

| UI choice | F6 rate code |
| ---: | ---: |
| 250 Hz | `0x02` |
| 500 Hz | `0x01` |
| 1000 Hz | `0x00` |
| 2000 Hz | `0x03` |

The official helper is `CUsbCmdHelper::SendCmdOnlyNoWait`, so the setter does not provide a profile-style ACK. The Tauri UI now displays these four labels, preserves an unknown raw code as an explicit unknown option, and sends the mapped code unchanged.

#### Step accuracy (`F7`)

The official encoders are:

```text
GetStepAccuracy:    A5 04 F7 A0
SetStepAccuracy:    A5 07 F7 wireMode param1LE[2] checksum
SetStepAccuracyEx:  A5 08 F7 wireMode param1LE[2] param3 checksum
```

The native source computes `wireMode = param2 ^ 1`. The checksum expressions are, respectively, `wireMode + low(param1) - 0x5D` for the 7-byte form and `wireMode + low(param1) - 0x5C + param3` for the 8-byte form, with byte wrapping. The current five-choice mapping from the official option handlers is:

| UI choice | Native semantic `param2` | Wire mode | `value` |
| --- | ---: | ---: | ---: |
| Adaptive | `1` | `0x00` | preserve current value; official default is `0x0020` |
| 32 | `0` | `0x01` | `0x0020` |
| 64 | `0` | `0x01` | `0x0040` |
| 128 | `0` | `0x01` | `0x0080` |
| 256 | `0` | `0x01` | `0x0100` |

The official binary also contains a legacy `16` option (`0x0010`), but it is not part of the current five-choice UI requested here. A live read returned:

```text
A5 08 F7 00 20 00 00 C4
```

This is `wireMode=0x00`, `value=0x0020` (little-endian), and `extension=0x00`, which is the Adaptive choice. The Tauri UI exposes the five semantic choices, keeps the raw fields available under the advanced section, and preserves an unknown mode/value combination instead of coercing it. Like F6, the official setter uses `SendCmdOnlyNoWait`; the UI sends the extended four-data-byte form and reports the transmitted frame rather than an ACK.

The three settings are now implemented in the Tauri port as follows:

- key bindings are part of the profile settings save and occupy only `0x164..0x1E3`;
- polling and step accuracy are separate device settings with their own read/reload/save controls;
- left/right stick drafts remain independent objects and are serialized into the left/right curve blocks separately.

### Remaining compatibility gaps

- Capture the official app while changing a macro, trigger mode, LED preset, and screen-record setting to validate the now-decoded static structures against live wire bytes.
- Extend the live curve isolation to the right-stick Default and Curve1/Curve2 presets, and verify the exact positive/negative center mapping into the runtime q0 pair.
- Recover the caller-specific fixed/dynamic LED `71` headers and the host-side trigger that causes the asynchronous `A5 05 FC` screen-record event.
- Exercise actual macro playback only on a disposable profile; one-step non-empty D8/D9 storage and restoration are live-confirmed, but physical step output and loop behavior still need a safe trigger test.
- Complete response semantics for auxiliary commands and cloud/local preset version handling. Profile names, model names, and firmware names remain host metadata, not unknown profile bytes.
- On the next natural D6 failure, classify the wire trace: zero fragments, partial fragments, out-of-order/duplicate fragments, or nine valid fragments followed by an application timeout. The current unit is intentionally left at the preserved `0x8847` profile after a same-content D7 ACK; no reset was induced.

## Live evidence: negative center/edge fields (2026-08-09)

The negative direction was isolated with the official v1.0.5.7 editor and USBPcap2. The right Default block starts at `b = 0x3A`. The stable saved profiles were reconstructed from the nine `D7` fragments, so the following are actual profile bytes rather than an affine inference.

### Center

Center uses two mutually exclusive magnitude slots:

| UI value | `profile[b + 0x02]` | `profile[b + 0x03]` |
| ---: | ---: | ---: |
| `0` | `00` | `00` |
| `-4` | `00` | `04` |
| `-26` | `00` | `1A` |
| positive `12` (previous live capture) | `0C` | `00` |

Therefore the negative center is not a signed int8 at `+0x02`: `+0x02` stores the positive-side magnitude and `+0x03` stores the negative-side compensation magnitude. The Lite read/write path now serializes both slots for every independent curve block.

### Edge

Edge also has separate positive and negative slots, with `0x64` as the neutral raw value for the compensation slot:

| UI value | `profile[b + 0x08]` | `profile[b + 0x09]` |
| ---: | ---: | ---: |
| `3` | `61` (`0x64 - 3`) | `64` (neutral) |
| `-11` | `64` (neutral) | `59` (`0x64 - 11`) |

The same two-slot rule is applied to left/right and all six serialized curve blocks. The official app also rewrites nearby graph-point bytes when saving a compensation change; those neighboring changes are intentionally not treated as the center/edge field itself.

The evidence is preserved in `tools/usbpcap/negative-right-center-20260809-b.pcap`, `tools/usbpcap/right-center0-edge3-baseline-20260809.pcap`, and `tools/usbpcap/negative-right-edge-20260809.pcap`.

### Lite preview and range controls

The official preview does not paint deadzone regions. Lite now paints only the center/edge compensation bands and removes the deadzone overlays. A subtle midpoint tick is shown on each center, edge, and curve-point range control; it represents `0` on signed controls and `50` on `0..100` controls.

## Raw v37 profile interchange

The Tauri port now treats the official v37 profile as a portable raw binary:

- Export writes the official unfragmented 488-byte form `A4 D7 E4 01` followed by the exact 484-byte profile payload, including its two-byte CRC and v37 length header.
- Import accepts both the 484-byte payload and the single-framed 488-byte form. The CRC and declared length are validated before the profile enters the editor.
- Apply sends all 484 bytes through the existing nine-fragment `A4 D7`/`D7` transfer and validates the `A5 05 D7` ACK. Unknown fields are preserved because full-profile apply does not reconstruct the profile from UI fields.
- Saving known settings returns the updated raw profile to the UI, so a subsequent export contains the just-saved bytes.

This is binary compatibility with the official v37 controller profile format; official app-only profile names, cloud metadata, and its local preset database are not part of the wire payload and are not synthesized by Lite. Rapid-fire evidence and the current M2/M1/M3/M4 write boundary are documented with the keymap fields above.

## Firmware findings and limits (2026-08-09)

The supplied `docs/Blitz2_V313333.bup` is a container, not a single flat firmware image. Its header is `BigBigWon Upgrade Pack`, version `V313333`. The APP entry begins at `0x29`; it contains two zlib chunks (`0x8000` and `0x7D38` decoded bytes) and restores to 64,824 bytes. The restored `APP_mcu_v33.bin` SHA-256 is `DB1027128394C162CC7193CD60D14FB6061C413ADF72C0678B261FB03D2F13D0`.

The APP is Thumb code. In an analyzed Ghidra program, raw `0x4C64` is reached inside the larger `FUN_000045F4`; because a no-analysis import has no Thumb context, `0x4C64` must not be reported as an independently confirmed function entry. The routine receives a stick index and uses separate 24-byte runtime records:

```text
record = 0x20004B20 + stick_index * 0x18
```

It reads independent center/edge/curve values for stick 0 or 1, computes one radial multiplier, and applies it to both axes of the selected stick. This confirms the right stick is not accidentally sharing the left record in firmware.

The turbo path is now statically identified in `FUN_0000DD04` and `FUN_0000DC40`:

- `profile + 0x140..0x143` is a byte-swapped 32-bit `turboKey` mask. The M1--M4 group is runtime bits 23--26, with stored byte patterns `00 80 00 00`, `01 00 00 00`, `00 00 02 00`, and `00 00 04 00`.
- `profile + 0x144` is a separate index. APP raw `0xF730` contains `200, 100, 50`; the runtime toggles at half-periods, yielding `5, 10, 20 Hz` complete cycles.
- `FUN_0000B54C` handles turbo events `0..5`, and the update path sends the profile through the normal CRC machinery.

This explains why the successful M2 isolation (`0x140: 00 -> 01`) is
consistent with the second mask row. The Tauri setter changes only that
confirmed bit, so other rapid sources remain intact. The M1 `0x146: 00 -> 80`
capture is an adjacent host-side save mutation, not a v33 turbo-mask byte;
the structural roles of its simultaneous `0x03B` and `0x167` changes are
documented in the live isolation section above. The hardware mask mapping is
closed statically, while official M1/M3/M4 UI write behavior remains a
live-capture compatibility question.

The second BUP entry, `c2sl_ota_dfu_fota_V33_20241011.fot`, restores from 22 zlib chunks to 704,512 bytes (SHA-256 `7BB1AEB9467F7144DF94EEE7B0F534B328C69946EF2D3426E8EB4877BDB4C570`). Its strings identify `BS25-ssb-codeloader`, secure-boot/signature/SHA-256/FOTA handling, not stick or profile settings. It is therefore relevant to secure firmware upgrade compatibility but not to the v37 controller-settings decoder. `BurnTool/tempFile_6/application.bin` is a separate 280,280-byte image with overlapping joystick log strings; it was not merged with the supplied BUP APP because its image identity and address map are different.

### Firmware-analysis limits

- The APP proves the runtime records, stabilization algorithm, and turbo field roles, but not every official M1/M3/M4 host-side save mutation.
- Macro recording and actual playback output, trigger output law, LED zone headers, screen-record initiation, and cloud/local profile metadata remain static-only or require live validation.
- v34/v35/v36/v39/v60 converter layouts are known, but this workspace's full editor/write path is intentionally v37-only; other versions must remain raw-preserved until each is captured.

### Lite shared profile-store boundary

BIGBIG WON Lite shares profiles through the official `%PROGRAMDATA%\\GamepadAssistant\\Config.db` SQLite database. The `t_Config.FConfigJson` value is a JSON array of raw profile bytes; the supported editing format is v37 with a 484-byte payload and the normal v37 CRC. The database layer preserves unknown metadata and unknown profile bytes, uses optimistic snapshots to reject external overwrites, and creates an online backup before its first write.

Startup discovery uses the short `EF` device-UUID and `0B` ZKM-version queries. It does not issue `D6`. A `D6` read is only triggered by the explicit “read from device” action. Saving a profile updates SQLite only; applying a saved profile is a separate `D7` transaction with `A5 05 D7` ACK validation and no automatic `D6` readback.
