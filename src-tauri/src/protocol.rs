pub const VENDOR_ID: u16 = 0x413d;
pub const PRODUCT_ID: u16 = 0x2104;
pub const CONFIG_USAGE_PAGE: u16 = 0xff7a;
pub const CONFIG_USAGE: u16 = 0x0001;
pub const HID_REPORT_LENGTH: usize = 65;
pub const V37_PROFILE_LENGTH: usize = 484;
pub const V37_LEFT_VIBRATION_MIN_OFFSET: usize = 0x148;
pub const V37_RIGHT_VIBRATION_MIN_OFFSET: usize = 0x149;
pub const V37_LEFT_VIBRATION_MAX_OFFSET: usize = 0x14c;
pub const V37_RIGHT_VIBRATION_MAX_OFFSET: usize = 0x14d;
pub const V37_RECTANGULAR_ALGORITHM_OFFSET: usize = 0x00c;
pub const V37_LEFT_DEFAULT_CURVE_OFFSET: usize = 0x00e;
pub const V37_RIGHT_DEFAULT_CURVE_OFFSET: usize = 0x03a;
pub const V37_TURBO_KEY_MASK_OFFSET: usize = 0x140;
pub const V37_TURBO_SPEED_INDEX_OFFSET: usize = 0x144;
const V37_TURBO_KEY_MASK_LENGTH: usize = 4;
pub const V37_KEYMAP_OFFSET: usize = 0x164;
pub const V37_KEYMAP_ENTRY_COUNT: usize = 32;
pub const V37_KEYMAP_ENTRY_LENGTH: usize = 4;
pub const MACRO_SLOT_COUNT: usize = 4;
pub const MACRO_HEADER_LENGTH: usize = 10;
pub const MACRO_STEP_LENGTH: usize = 10;
pub const MACRO_MAX_STEPS: usize = 64;
pub const MACRO_MAX_LENGTH: usize = MACRO_HEADER_LENGTH + MACRO_STEP_LENGTH * MACRO_MAX_STEPS;

const GET_BASE_PROFILE: [u8; 4] = [0xa5, 0x04, 0xd6, 0x7f];
const GET_PROFILE_SIZE: [u8; 4] = [0xa5, 0x04, 0xd3, 0x7c];
const GET_POLLING_RATE: [u8; 4] = [0xa5, 0x04, 0xf6, 0x9f];
const GET_STEP_ACCURACY: [u8; 4] = [0xa5, 0x04, 0xf7, 0xa0];
const GET_MACRO_LIST: [u8; 4] = [0xa5, 0x04, 0xd5, 0x7e];
const GET_DEVICE_UUID: [u8; 12] = [0xa5, 0x0c, 0xef, 0, 0, 0, 0, 0, 0, 0, 0, 0xa0];
const GET_ZKM_VERSION: [u8; 4] = [0xa5, 0x04, 0x0b, 0xb4];

pub struct ReadFragment {
    pub sequence: u8,
    pub payload: Vec<u8>,
}

#[derive(Clone, Copy)]
pub struct CurveSettings {
    pub center: i16,
    pub point1_x: u8,
    pub point1_y: u8,
    pub point2_x: u8,
    pub point2_y: u8,
    pub edge: i16,
    pub stabilization: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VibrationGrip {
    pub min: u8,
    pub max: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct VibrationSettings {
    pub left: VibrationGrip,
    pub right: VibrationGrip,
}

#[derive(Clone, Copy)]
pub struct StepAccuracySettings {
    pub mode: u8,
    pub value: u16,
    pub extension: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RapidFireSettings {
    pub keys: [Option<bool>; V37_KEYMAP_ENTRY_COUNT],
    pub speed_index: Option<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MacroListEntry {
    pub crc: u16,
    pub active_length: usize,
}

pub struct MacroInfoFragment {
    pub sequence: u8,
    pub payload: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RapidFireTiming {
    pub period_ms: u16,
    pub half_period_ms: u16,
    pub hz: u8,
}

#[derive(Clone, Copy)]
pub struct ControllerSettings {
    pub rectangle_algorithm: bool,
    pub left_curve: CurveSettings,
    pub right_curve: CurveSettings,
    pub rapid_fire: RapidFireSettings,
    pub key_bindings: [[u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT],
}

pub fn get_polling_rate_report() -> Vec<u8> {
    command_report(&GET_POLLING_RATE)
}

pub fn get_step_accuracy_report() -> Vec<u8> {
    command_report(&GET_STEP_ACCURACY)
}

pub fn get_macro_list_report() -> Vec<u8> {
    command_report(&GET_MACRO_LIST)
}

pub fn get_device_uuid_report() -> Vec<u8> {
    command_report(&GET_DEVICE_UUID)
}

pub fn get_zkm_version_report() -> Vec<u8> {
    command_report(&GET_ZKM_VERSION)
}

pub fn decode_device_uuid(report: &[u8]) -> Result<String, String> {
    let wire = wire_bytes(report);
    if wire.len() < 12 || wire[0] != 0xa5 || wire[1] != 12 || wire[2] != 0xef {
        return Err("unexpected device UUID response".into());
    }
    if byte_sum(&wire[..11]) != wire[11] {
        return Err("invalid device UUID checksum".into());
    }
    Ok(wire[3..11]
        .iter()
        .map(|value| format!("{value:02X}"))
        .collect())
}

pub fn decode_zkm_version(report: &[u8]) -> Result<u8, String> {
    let payload = short_command_payload(report, 0x0b)?;
    let version = payload
        .first()
        .copied()
        .ok_or_else(|| "ZKM version response has no value".to_string())?;
    Ok(if version == b'8' { b'6' } else { version })
}

pub fn get_macro_info_report(slot: u8) -> Result<Vec<u8>, String> {
    if usize::from(slot) >= MACRO_SLOT_COUNT {
        return Err(format!("macro slot must be 0..{}", MACRO_SLOT_COUNT - 1));
    }
    let checksum = 0xa5_u8
        .wrapping_add(0x05)
        .wrapping_add(0xd9)
        .wrapping_add(slot);
    Ok(command_report(&[0xa5, 0x05, 0xd9, slot, checksum]))
}

pub fn build_set_polling_rate_report(value: u8) -> Vec<u8> {
    command_report(&[0xa5, 0x05, 0xf6, value, value.wrapping_sub(0x60)])
}

pub fn build_set_step_accuracy_report(settings: StepAccuracySettings) -> Vec<u8> {
    // The UI stores the raw wire byte. Native SetStepAccuracyEx receives a
    // semantic mode parameter and serializes it as (param2 ^ 1).
    let wire_mode = settings.mode;
    let value = settings.value.to_le_bytes();
    let checksum = wire_mode
        .wrapping_add(value[0])
        .wrapping_sub(0x5c)
        .wrapping_add(settings.extension);
    command_report(&[
        0xa5,
        0x08,
        0xf7,
        wire_mode,
        value[0],
        value[1],
        settings.extension,
        checksum,
    ])
}

pub fn decode_polling_rate(report: &[u8]) -> Result<u8, String> {
    let payload = short_command_payload(report, 0xf6)?;
    payload
        .first()
        .copied()
        .ok_or_else(|| "polling-rate response has no value".into())
}

pub fn decode_step_accuracy(report: &[u8]) -> Result<StepAccuracySettings, String> {
    let payload = short_command_payload(report, 0xf7)?;
    if payload.len() < 4 {
        return Err("step-accuracy response has fewer than four data bytes".into());
    }
    Ok(StepAccuracySettings {
        mode: payload[0],
        value: u16::from_le_bytes([payload[1], payload[2]]),
        extension: payload[3],
    })
}

pub fn get_base_profile_report() -> Vec<u8> {
    let mut report = vec![0; HID_REPORT_LENGTH];
    report[1..5].copy_from_slice(&GET_BASE_PROFILE);
    report
}

pub fn get_profile_size_report() -> Vec<u8> {
    let mut report = vec![0; HID_REPORT_LENGTH];
    report[1..5].copy_from_slice(&GET_PROFILE_SIZE);
    report
}

pub fn decode_profile_size(report: &[u8]) -> Result<usize, String> {
    let wire = wire_bytes(report);
    if wire.len() < 10 || wire[0] != 0xa5 || wire[1] != 10 || wire[2] != 0xd3 {
        return Err("unexpected GetProfileSize response".into());
    }
    if byte_sum(&wire[..9]) != wire[9] {
        return Err("invalid GetProfileSize checksum".into());
    }
    Ok(usize::from(u16::from_le_bytes([wire[5], wire[6]])))
}

pub fn decode_read_fragment(report: &[u8]) -> Result<ReadFragment, String> {
    let wire = wire_bytes(report);
    if wire.len() < 5 || wire[0] != 0xa4 || wire[2] != 0xd6 {
        return Err("unexpected GetBaseProfile response header".into());
    }

    let length = wire[1] as usize;
    if !(5..=wire.len()).contains(&length) {
        return Err(format!("invalid response length {length}"));
    }
    if byte_sum(&wire[..length - 1]) != wire[length - 1] {
        return Err("invalid GetBaseProfile fragment checksum".into());
    }

    Ok(ReadFragment {
        sequence: wire[3],
        payload: wire[4..length - 1].to_vec(),
    })
}

pub fn declared_profile_length(profile: &[u8]) -> Option<usize> {
    (profile.len() >= 4).then(|| usize::from(u16::from_be_bytes([profile[2], profile[3]])))
}

pub fn profile_crc(profile: &[u8]) -> Result<u16, String> {
    if profile.len() < 4 {
        return Err("profile is too short".into());
    }

    const TABLE: [u16; 16] = [
        0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800,
        0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
    ];

    let mut crc = 0xffff_u16;
    for &value in &profile[2..] {
        crc = (crc >> 4) ^ TABLE[usize::from((crc ^ u16::from(value)) & 0x0f)];
        crc = (crc >> 4) ^ TABLE[usize::from(((u16::from(value) >> 4) ^ crc) & 0x0f)];
    }
    Ok(crc)
}

pub fn stored_profile_crc(profile: &[u8]) -> Result<u16, String> {
    profile
        .get(..2)
        .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]]))
        .ok_or_else(|| "profile is too short".into())
}

pub fn normalize_v37_profile(input: &[u8]) -> Result<Vec<u8>, String> {
    let profile = if input.len() == V37_PROFILE_LENGTH {
        input
    } else if input.len() == V37_PROFILE_LENGTH + 4 && input[..4] == [0xa4, 0xd7, 0xe4, 0x01] {
        &input[4..]
    } else {
        return Err(format!(
            "expected a {V37_PROFILE_LENGTH}-byte v37 profile or a single framed profile"
        ));
    };
    if declared_profile_length(profile) != Some(V37_PROFILE_LENGTH) {
        return Err("profile header does not declare 484 bytes".into());
    }
    let stored = stored_profile_crc(profile)?;
    let computed = profile_crc(profile)?;
    if stored != computed {
        return Err("プロファイルの内容を確認できないため、読み込めません".into());
    }
    Ok(profile.to_vec())
}

pub fn vibration_settings(profile: &[u8]) -> Result<VibrationSettings, String> {
    if profile.len() != V37_PROFILE_LENGTH {
        return Err("expected a 484-byte v37 profile".into());
    }
    Ok(VibrationSettings {
        left: VibrationGrip {
            min: profile[V37_LEFT_VIBRATION_MIN_OFFSET],
            max: profile[V37_LEFT_VIBRATION_MAX_OFFSET],
        },
        right: VibrationGrip {
            min: profile[V37_RIGHT_VIBRATION_MIN_OFFSET],
            max: profile[V37_RIGHT_VIBRATION_MAX_OFFSET],
        },
    })
}

pub fn controller_settings(profile: &[u8]) -> Result<ControllerSettings, String> {
    if profile.len() != V37_PROFILE_LENGTH {
        return Err("expected a 484-byte v37 profile".into());
    }

    Ok(ControllerSettings {
        rectangle_algorithm: profile[V37_RECTANGULAR_ALGORITHM_OFFSET] & 0x10 != 0,
        left_curve: read_curve(profile, V37_LEFT_DEFAULT_CURVE_OFFSET, "left")?,
        right_curve: read_curve(profile, V37_RIGHT_DEFAULT_CURVE_OFFSET, "right")?,
        rapid_fire: rapid_fire_settings(profile)?,
        key_bindings: read_key_bindings(profile),
    })
}

pub fn rapid_fire_settings(profile: &[u8]) -> Result<RapidFireSettings, String> {
    if profile.len() != V37_PROFILE_LENGTH {
        return Err("expected a 484-byte v37 profile".into());
    }
    let mask = turbo_key_mask(profile)?;
    Ok(RapidFireSettings {
        keys: std::array::from_fn(|slot| Some(mask & turbo_key_bit(slot) != 0)),
        speed_index: Some(profile[V37_TURBO_SPEED_INDEX_OFFSET]),
    })
}

pub fn turbo_key_mask(profile: &[u8]) -> Result<u32, String> {
    if profile.len() != V37_PROFILE_LENGTH {
        return Err("expected a 484-byte v37 profile".into());
    }
    Ok(u32::from_be_bytes(
        profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + 4]
            .try_into()
            .expect("four-byte turbo mask slice"),
    ))
}

pub fn rapid_fire_timing(index: u8) -> Option<RapidFireTiming> {
    let period_ms = match index {
        0 => 200,
        1 => 100,
        2 => 50,
        _ => return None,
    };
    Some(RapidFireTiming {
        period_ms,
        half_period_ms: period_ms / 2,
        hz: (1000 / period_ms) as u8,
    })
}

pub fn set_controller_settings(
    profile: &mut [u8],
    rectangle_algorithm: bool,
    left_curve: CurveSettings,
    right_curve: CurveSettings,
    key_bindings: [[u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT],
    rapid_fire: RapidFireSettings,
) -> Result<(), String> {
    if profile.len() != V37_PROFILE_LENGTH {
        return Err("expected a 484-byte v37 profile".into());
    }
    if rectangle_algorithm {
        profile[V37_RECTANGULAR_ALGORITHM_OFFSET] |= 0x10;
    } else {
        profile[V37_RECTANGULAR_ALGORITHM_OFFSET] &= !0x10;
    }

    write_curve(profile, V37_LEFT_DEFAULT_CURVE_OFFSET, left_curve, "left")?;
    write_curve(
        profile,
        V37_RIGHT_DEFAULT_CURVE_OFFSET,
        right_curve,
        "right",
    )?;
    write_key_bindings(profile, key_bindings)?;
    for (slot, enabled) in rapid_fire.keys.into_iter().enumerate() {
        if let Some(enabled) = enabled {
            set_turbo_key_bit(profile, turbo_key_bit(slot), enabled);
        }
    }
    if let Some(speed_index) = rapid_fire.speed_index {
        if rapid_fire_timing(speed_index).is_none() {
            return Err(format!("unsupported rapid-fire speed index {speed_index}"));
        }
        profile[V37_TURBO_SPEED_INDEX_OFFSET] = speed_index;
    }
    Ok(())
}

fn turbo_key_bit(slot: usize) -> u32 {
    // turboKey uses the same zero-based input-slot order as the v37 keymap.
    1_u32 << slot
}

fn set_turbo_key_bit(profile: &mut [u8], bit: u32, enabled: bool) {
    let mut mask = u32::from_be_bytes(
        profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + V37_TURBO_KEY_MASK_LENGTH]
            .try_into()
            .expect("four-byte turbo mask slice"),
    );
    if enabled {
        mask |= bit;
    } else {
        mask &= !bit;
    }
    profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + V37_TURBO_KEY_MASK_LENGTH]
        .copy_from_slice(&mask.to_be_bytes());
}

fn read_key_bindings(profile: &[u8]) -> [[u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT] {
    std::array::from_fn(|index| {
        let start = V37_KEYMAP_OFFSET + index * V37_KEYMAP_ENTRY_LENGTH;
        let mut entry = [0_u8; V37_KEYMAP_ENTRY_LENGTH];
        entry.copy_from_slice(&profile[start..start + V37_KEYMAP_ENTRY_LENGTH]);
        entry
    })
}

fn write_key_bindings(
    profile: &mut [u8],
    key_bindings: [[u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT],
) -> Result<(), String> {
    let end = V37_KEYMAP_OFFSET + V37_KEYMAP_ENTRY_COUNT * V37_KEYMAP_ENTRY_LENGTH;
    if end > profile.len() {
        return Err("v37 keymap region is outside the profile".into());
    }
    for (index, entry) in key_bindings.into_iter().enumerate() {
        let start = V37_KEYMAP_OFFSET + index * V37_KEYMAP_ENTRY_LENGTH;
        profile[start..start + V37_KEYMAP_ENTRY_LENGTH].copy_from_slice(&entry);
    }
    Ok(())
}

fn read_curve(profile: &[u8], block: usize, label: &str) -> Result<CurveSettings, String> {
    let center_positive = profile[block + 2];
    let center_compensation = profile[block + 3];
    if center_positive > 100 || center_compensation > 100 {
        return Err(format!(
            "unexpected {label} stick center bytes: {center_positive:02X} {center_compensation:02X}"
        ));
    }
    let center = if center_compensation != 0 {
        -i16::from(center_compensation)
    } else {
        i16::from(center_positive)
    };

    let edge_deadzone = profile[block + 8];
    let edge_compensation = profile[block + 9];
    if edge_deadzone > 100 || edge_compensation > 100 {
        return Err(format!(
            "unexpected {label} stick edge bytes: {edge_deadzone:02X} {edge_compensation:02X}"
        ));
    }
    let edge = if edge_compensation != 100 {
        i16::from(edge_compensation) - 100
    } else {
        100 - i16::from(edge_deadzone)
    };

    Ok(CurveSettings {
        center,
        point1_x: profile[block + 4],
        point1_y: profile[block + 5],
        point2_x: profile[block + 6],
        point2_y: profile[block + 7],
        edge,
        stabilization: profile[block + 0x0A],
    })
}

fn write_curve(
    profile: &mut [u8],
    block: usize,
    curve: CurveSettings,
    label: &str,
) -> Result<(), String> {
    if !(-100..=100).contains(&curve.center) {
        return Err(format!("{label} center must be between -100 and 100"));
    }
    if !(-100..=100).contains(&curve.edge) {
        return Err(format!("{label} edge must be between -100 and 100"));
    }
    for (field, value) in [
        ("point1_x", curve.point1_x),
        ("point1_y", curve.point1_y),
        ("point2_x", curve.point2_x),
        ("point2_y", curve.point2_y),
    ] {
        if value > 100 {
            return Err(format!("{label} {field} must be between 0 and 100"));
        }
    }

    if curve.center < 0 {
        profile[block + 2] = 0;
        profile[block + 3] = (-curve.center) as u8;
    } else {
        profile[block + 2] = curve.center as u8;
        profile[block + 3] = 0;
    }
    profile[block + 4] = curve.point1_x;
    profile[block + 5] = curve.point1_y;
    profile[block + 6] = curve.point2_x;
    profile[block + 7] = curve.point2_y;
    if curve.edge < 0 {
        profile[block + 8] = 100;
        profile[block + 9] = (100 + curve.edge) as u8;
    } else {
        profile[block + 8] = (100 - curve.edge) as u8;
        profile[block + 9] = 100;
    }
    profile[block + 0x0A] = curve.stabilization;
    Ok(())
}

pub fn set_vibration_settings(
    profile: &mut [u8],
    settings: VibrationSettings,
) -> Result<u16, String> {
    if profile.len() != V37_PROFILE_LENGTH
        || declared_profile_length(profile) != Some(V37_PROFILE_LENGTH)
    {
        return Err("expected a 484-byte v37 profile".into());
    }
    validate_vibration_grip(settings.left, "left")?;
    validate_vibration_grip(settings.right, "right")?;
    let left_off = settings.left == VibrationGrip { min: 0, max: 1 };
    let right_off = settings.right == VibrationGrip { min: 0, max: 1 };
    if left_off != right_off {
        return Err("left and right vibration modes must match".into());
    }
    profile[V37_LEFT_VIBRATION_MIN_OFFSET] = settings.left.min;
    profile[V37_RIGHT_VIBRATION_MIN_OFFSET] = settings.right.min;
    profile[V37_LEFT_VIBRATION_MAX_OFFSET] = settings.left.max;
    profile[V37_RIGHT_VIBRATION_MAX_OFFSET] = settings.right.max;
    let crc = profile_crc(profile)?;
    profile[..2].copy_from_slice(&crc.to_be_bytes());
    Ok(crc)
}

fn validate_vibration_grip(grip: VibrationGrip, label: &str) -> Result<(), String> {
    if grip.max < grip.min {
        return Err(format!("{label} vibration max must be at least min"));
    }
    if grip != (VibrationGrip { min: 0, max: 1 }) && grip.max.saturating_sub(grip.min) < 20 {
        return Err(format!(
            "{label} vibration width must be at least 20 (max - min)"
        ));
    }
    Ok(())
}

pub fn build_v37_write_reports(profile: &[u8]) -> Result<Vec<Vec<u8>>, String> {
    if profile.len() != V37_PROFILE_LENGTH
        || declared_profile_length(profile) != Some(V37_PROFILE_LENGTH)
    {
        return Err("expected a 484-byte v37 profile".into());
    }

    let mut payload = profile.to_vec();
    let crc = profile_crc(&payload)?;
    payload[..2].copy_from_slice(&crc.to_be_bytes());

    let payload_capacity = HID_REPORT_LENGTH - 1 - 5;
    let mut reports = Vec::with_capacity(payload.len().div_ceil(payload_capacity));
    for (index, chunk) in payload.chunks(payload_capacity).enumerate() {
        let fragment_length = chunk.len() + 5;
        let mut report = vec![0; HID_REPORT_LENGTH];
        report[1] = 0xa4;
        report[2] = fragment_length as u8;
        report[3] = 0xd7;
        report[4] = (index + 1) as u8;
        report[5..5 + chunk.len()].copy_from_slice(chunk);
        report[fragment_length] = byte_sum(&report[1..fragment_length]);
        reports.push(report);
    }
    Ok(reports)
}

pub fn validate_set_profile_ack(report: &[u8]) -> Result<u8, String> {
    let wire = wire_bytes(report);
    if wire.len() < 5 || wire[0] != 0xa5 || wire[1] != 5 || wire[2] != 0xd7 {
        return Err("unexpected SetBaseProfile ACK".into());
    }
    if byte_sum(&wire[..4]) != wire[4] {
        return Err("invalid SetBaseProfile ACK checksum".into());
    }
    Ok(wire[3])
}

pub fn decode_macro_list(report: &[u8]) -> Result<Vec<MacroListEntry>, String> {
    let payload = short_command_payload(report, 0xd5)?;
    if payload.len() != MACRO_SLOT_COUNT * 4 {
        return Err(format!("unexpected D5 payload length {}", payload.len()));
    }
    Ok(payload
        .chunks_exact(4)
        .map(|entry| MacroListEntry {
            crc: u16::from_be_bytes([entry[0], entry[1]]),
            active_length: usize::from(u16::from_be_bytes([entry[2], entry[3]])),
        })
        .collect())
}

pub fn decode_macro_info(report: &[u8]) -> Result<Vec<u8>, String> {
    let payload = short_command_payload(report, 0xd9)?;
    validate_macro_record(payload)?;
    Ok(payload.to_vec())
}

pub fn decode_macro_info_fragment(report: &[u8]) -> Result<MacroInfoFragment, String> {
    let wire = wire_bytes(report);
    if wire.len() < 5 || wire[0] != 0xa4 || wire[2] != 0xd9 {
        return Err("unexpected long D9 response header".into());
    }

    let length = usize::from(wire[1]);
    if !(5..=wire.len()).contains(&length) {
        return Err(format!("invalid long D9 response length {length}"));
    }
    if byte_sum(&wire[..length - 1]) != wire[length - 1] {
        return Err("invalid long D9 response checksum".into());
    }

    Ok(MacroInfoFragment {
        sequence: wire[3],
        payload: wire[4..length - 1].to_vec(),
    })
}

pub fn macro_record_length(payload: &[u8]) -> Result<usize, String> {
    if payload.len() < 4 {
        return Err("D9 response does not contain a macro length".into());
    }
    let active_length = usize::from(u16::from_be_bytes([payload[2], payload[3]]));
    if !(MACRO_HEADER_LENGTH..=MACRO_MAX_LENGTH).contains(&active_length)
        || !(active_length - MACRO_HEADER_LENGTH).is_multiple_of(MACRO_STEP_LENGTH)
    {
        return Err(format!("invalid D9 macro length 0x{active_length:04X}"));
    }
    Ok(active_length)
}

pub fn validate_macro_record(record: &[u8]) -> Result<(), String> {
    let active_length = macro_record_length(record)?;
    if active_length != record.len() {
        return Err(format!(
            "D9 response contains {} bytes but declares {active_length}",
            record.len()
        ));
    }
    validate_macro_crc(record)
}

pub fn reassemble_macro_info_fragments(reports: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    let first = reports
        .first()
        .ok_or_else(|| "D9 response did not contain any fragments".to_string())?;
    let first_fragment = decode_macro_info_fragment(first)?;
    if first_fragment.sequence != 1 {
        return Err(format!(
            "unexpected D9 fragment sequence {}, expected 1",
            first_fragment.sequence
        ));
    }
    let active_length = macro_record_length(&first_fragment.payload)?;

    let mut record = Vec::with_capacity(active_length);
    for (index, report) in reports.iter().enumerate() {
        let fragment = decode_macro_info_fragment(report)?;
        let expected_sequence = u8::try_from(index + 1)
            .map_err(|_| "D9 response contains too many fragments".to_string())?;
        if fragment.sequence != expected_sequence {
            return Err(format!(
                "unexpected D9 fragment sequence {}, expected {expected_sequence}",
                fragment.sequence
            ));
        }
        record.extend_from_slice(&fragment.payload);
        if record.len() > active_length {
            return Err(format!(
                "D9 response contains more than the declared {active_length} bytes"
            ));
        }
    }

    if record.len() != active_length {
        return Err(format!(
            "D9 response contains {} bytes but declares {active_length}",
            record.len()
        ));
    }
    validate_macro_record(&record)?;
    Ok(record)
}

pub fn normalize_macro_record(input: &[u8]) -> Result<Vec<u8>, String> {
    if !(MACRO_HEADER_LENGTH..=MACRO_MAX_LENGTH).contains(&input.len())
        || !(input.len() - MACRO_HEADER_LENGTH).is_multiple_of(MACRO_STEP_LENGTH)
    {
        return Err(format!(
            "macro record must be 10 + 10*n bytes, got {}",
            input.len()
        ));
    }
    let mut record = input.to_vec();
    validate_macro_input_masks(&record)?;
    let record_length = record.len();
    record[2..4].copy_from_slice(&(record_length as u16).to_be_bytes());
    let crc = macro_crc(&record)?;
    record[..2].copy_from_slice(&crc.to_be_bytes());
    Ok(record)
}

pub fn macro_crc(record: &[u8]) -> Result<u16, String> {
    if record.len() < MACRO_HEADER_LENGTH {
        return Err("macro record is too short".into());
    }
    let mut crc = 0xffff_u16;
    for &value in &record[2..] {
        crc ^= u16::from(value);
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xa001
            } else {
                crc >> 1
            };
        }
    }
    Ok(crc)
}

pub fn validate_macro_crc(record: &[u8]) -> Result<(), String> {
    if record.len() < MACRO_HEADER_LENGTH {
        return Err("macro record is too short".into());
    }
    let stored = u16::from_be_bytes([record[0], record[1]]);
    let computed = macro_crc(record)?;
    if stored != computed {
        return Err(format!(
            "macro CRC mismatch: stored 0x{stored:04X}, computed 0x{computed:04X}"
        ));
    }
    Ok(())
}

fn validate_macro_input_masks(record: &[u8]) -> Result<(), String> {
    for (step_index, step) in record[MACRO_HEADER_LENGTH..]
        .chunks_exact(MACRO_STEP_LENGTH)
        .enumerate()
    {
        let input_mask = u32::from_be_bytes([step[2], step[3], step[4], step[5]]);
        let left_direction = ((input_mask >> 24) & 0x0f) as u8;
        let right_direction = ((input_mask >> 28) & 0x0f) as u8;
        if !matches!(left_direction, 0 | 1 | 2 | 4 | 5 | 6 | 8 | 9 | 10) {
            return Err(format!(
                "macro step {} contains undefined left-stick direction code 0x{left_direction:X}",
                step_index + 1
            ));
        }
        if !matches!(right_direction, 0 | 1 | 2 | 4 | 5 | 6 | 8 | 9 | 10) {
            return Err(format!(
                "macro step {} contains undefined right-stick direction code 0x{right_direction:X}",
                step_index + 1
            ));
        }
    }
    Ok(())
}

pub fn build_macro_write_reports(slot: u8, input: &[u8]) -> Result<Vec<Vec<u8>>, String> {
    if usize::from(slot) >= MACRO_SLOT_COUNT {
        return Err(format!("macro slot must be 0..{}", MACRO_SLOT_COUNT - 1));
    }
    let record = normalize_macro_record(input)?;
    let mut logical = vec![0_u8; record.len() + 5];
    logical[..2].copy_from_slice(&[0xa4, 0xd8]);
    let wrapper_length = (record.len() as u16 + 1).to_le_bytes();
    logical[2..4].copy_from_slice(&wrapper_length);
    logical[4] = slot;
    logical[5..7].copy_from_slice(&record[..2]);
    logical[7..].copy_from_slice(&record[2..]);

    let payload_capacity = HID_REPORT_LENGTH - 1 - 5;
    let mut reports = Vec::with_capacity((logical.len() - 4).div_ceil(payload_capacity));
    for (index, chunk) in logical[4..].chunks(payload_capacity).enumerate() {
        let fragment_length = chunk.len() + 5;
        let mut report = vec![0_u8; HID_REPORT_LENGTH];
        report[1] = 0xa4;
        report[2] = fragment_length as u8;
        report[3] = 0xd8;
        report[4] = (index + 1) as u8;
        report[5..5 + chunk.len()].copy_from_slice(chunk);
        report[fragment_length] = byte_sum(&report[1..fragment_length]);
        reports.push(report);
    }
    Ok(reports)
}

pub fn validate_macro_write_ack(report: &[u8]) -> Result<u8, String> {
    let wire = wire_bytes(report);
    if wire.len() < 2 {
        return Err("truncated macro D8 ACK".into());
    }
    let length = usize::from(wire[1]);
    if length != 5 || wire.len() < length || wire[0] != 0xa5 || wire[2] != 0xd8 {
        return Err("unexpected macro D8 ACK".into());
    }
    if byte_sum(&wire[..4]) != wire[4] {
        return Err("invalid macro D8 ACK checksum".into());
    }
    Ok(wire[3])
}

pub fn wire_bytes(report: &[u8]) -> &[u8] {
    if report.first() == Some(&0) {
        &report[1..]
    } else {
        report
    }
}

fn command_report(logical: &[u8]) -> Vec<u8> {
    let mut report = vec![0_u8; HID_REPORT_LENGTH];
    report[1..1 + logical.len()].copy_from_slice(logical);
    report
}

fn short_command_payload(report: &[u8], command: u8) -> Result<&[u8], String> {
    let wire = wire_bytes(report);
    if wire.len() < 5 || wire[0] != 0xa5 || wire[2] != command {
        return Err(format!(
            "unexpected short response for command 0x{command:02X}"
        ));
    }
    let length = wire[1] as usize;
    if !(5..=wire.len()).contains(&length) {
        return Err(format!("invalid short response length {length}"));
    }
    if byte_sum(&wire[..length - 1]) != wire[length - 1] {
        return Err(format!(
            "invalid short response checksum for command 0x{command:02X}"
        ));
    }
    Ok(&wire[3..length - 1])
}

fn byte_sum(bytes: &[u8]) -> u8 {
    bytes
        .iter()
        .fold(0_u8, |sum, value| sum.wrapping_add(*value))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile() -> Vec<u8> {
        let mut profile = vec![0; V37_PROFILE_LENGTH];
        profile[2..4].copy_from_slice(&(V37_PROFILE_LENGTH as u16).to_be_bytes());
        let crc = profile_crc(&profile).unwrap();
        profile[..2].copy_from_slice(&crc.to_be_bytes());
        profile
    }

    fn rapid_keys(states: &[(usize, Option<bool>)]) -> [Option<bool>; V37_KEYMAP_ENTRY_COUNT] {
        let mut keys = [None; V37_KEYMAP_ENTRY_COUNT];
        for &(slot, enabled) in states {
            keys[slot] = enabled;
        }
        keys
    }

    fn long_macro_info_reports(record: &[u8]) -> Vec<Vec<u8>> {
        let payload_capacity = HID_REPORT_LENGTH - 1 - 5;
        record
            .chunks(payload_capacity)
            .enumerate()
            .map(|(index, chunk)| {
                let frame_length = chunk.len() + 5;
                let mut report = vec![0; HID_REPORT_LENGTH];
                report[1] = 0xa4;
                report[2] = frame_length as u8;
                report[3] = 0xd9;
                report[4] = (index + 1) as u8;
                report[5..5 + chunk.len()].copy_from_slice(chunk);
                report[frame_length] = byte_sum(&report[1..frame_length]);
                report
            })
            .collect()
    }

    #[test]
    fn accepts_raw_and_single_framed_v37_profiles() {
        let profile = profile();
        assert_eq!(normalize_v37_profile(&profile).unwrap(), profile);

        let mut framed = vec![0xa4, 0xd7, 0xe4, 0x01];
        framed.extend_from_slice(&profile);
        assert_eq!(normalize_v37_profile(&framed).unwrap(), profile);

        let mut invalid = profile;
        invalid[10] ^= 0x01;
        assert!(
            normalize_v37_profile(&invalid)
                .unwrap_err()
                .contains("プロファイルの内容を確認できない")
        );
    }

    #[test]
    fn v37_profile_uses_nine_valid_fragments() {
        let profile = profile();
        let reports = build_v37_write_reports(&profile).unwrap();
        assert_eq!(reports.len(), 9);
        assert_eq!(
            reports.iter().map(|report| report[2]).collect::<Vec<_>>(),
            [64, 64, 64, 64, 64, 64, 64, 64, 17]
        );

        let rebuilt = reports
            .iter()
            .flat_map(|report| {
                let length = report[2] as usize;
                assert_eq!(byte_sum(&report[1..length]), report[length]);
                report[5..length].iter().copied()
            })
            .collect::<Vec<_>>();
        assert_eq!(rebuilt, profile);
    }

    #[test]
    fn accepts_observed_ack() {
        assert_eq!(
            validate_set_profile_ack(&[0, 0xa5, 5, 0xd7, 0, 0x81]),
            Ok(0)
        );
    }

    #[test]
    fn decodes_observed_profile_size() {
        assert_eq!(
            decode_profile_size(&[
                0, 0xa5, 0x0a, 0xd3, 0x34, 0x0c, 0xe4, 0x01, 0x94, 0x02, 0x3d
            ]),
            Ok(V37_PROFILE_LENGTH)
        );
    }

    #[test]
    fn decodes_observed_device_identity() {
        assert_eq!(
            decode_device_uuid(&[
                0, 0xa5, 0x0c, 0xef, 0x55, 0xe8, 0x22, 0x4a, 0x7a, 0x68, 0x00, 0x00, 0x2b
            ]),
            Ok("55E8224A7A680000".into())
        );
        assert_eq!(
            decode_zkm_version(&[0, 0xa5, 0x05, 0x0b, 0x37, 0xec]),
            Ok(0x37)
        );
    }

    #[test]
    fn updates_vibration_settings_and_crc() {
        let mut profile = profile();
        let original_crc = stored_profile_crc(&profile).unwrap();
        let settings = VibrationSettings {
            left: VibrationGrip { min: 20, max: 123 },
            right: VibrationGrip { min: 45, max: 200 },
        };
        let crc = set_vibration_settings(&mut profile, settings).unwrap();

        assert_eq!(vibration_settings(&profile), Ok(settings));
        assert_eq!(stored_profile_crc(&profile), Ok(crc));
        assert_eq!(profile_crc(&profile), Ok(crc));
        assert_ne!(crc, original_crc);
    }

    #[test]
    fn allows_off_vibration_but_rejects_narrow_custom_width() {
        let mut profile = profile();
        let off = VibrationSettings {
            left: VibrationGrip { min: 0, max: 1 },
            right: VibrationGrip { min: 0, max: 1 },
        };
        set_vibration_settings(&mut profile, off).unwrap();
        assert_eq!(vibration_settings(&profile), Ok(off));

        let narrow = VibrationSettings {
            left: VibrationGrip { min: 10, max: 29 },
            right: VibrationGrip { min: 0, max: 255 },
        };
        let error = set_vibration_settings(&mut profile, narrow).unwrap_err();
        assert!(error.contains("width must be at least 20"));
    }

    #[test]
    fn reads_and_updates_known_controller_settings() {
        let mut profile = profile();
        profile[V37_RECTANGULAR_ALGORITHM_OFFSET] = 0;
        profile[V37_LEFT_DEFAULT_CURVE_OFFSET] = 1;
        profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 1] = 0x20;
        profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 8] = 0x61;
        profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 0x0A] = 0x12;
        profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 1] = 0x20;
        profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 8] = 0x61;

        set_controller_settings(
            &mut profile,
            true,
            CurveSettings {
                center: -13,
                point1_x: 40,
                point1_y: 29,
                point2_x: 91,
                point2_y: 70,
                edge: -4,
                stabilization: 0xff,
            },
            CurveSettings {
                center: 14,
                point1_x: 41,
                point1_y: 30,
                point2_x: 92,
                point2_y: 71,
                edge: 5,
                stabilization: 0,
            },
            [[0_u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT],
            RapidFireSettings {
                keys: rapid_keys(&[(24, Some(false))]),
                speed_index: None,
            },
        )
        .unwrap();

        let settings = controller_settings(&profile).unwrap();
        assert!(settings.rectangle_algorithm);
        assert_eq!(settings.left_curve.center, -13);
        assert_eq!(settings.left_curve.point1_x, 40);
        assert_eq!(settings.left_curve.point1_y, 29);
        assert_eq!(settings.left_curve.point2_x, 91);
        assert_eq!(settings.left_curve.point2_y, 70);
        assert_eq!(settings.left_curve.edge, -4);
        assert_eq!(settings.left_curve.stabilization, 0xff);
        assert_eq!(profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 0x0A], 0xff);
        assert_eq!(profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 2], 0);
        assert_eq!(profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 3], 13);
        assert_eq!(profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 8], 100);
        assert_eq!(profile[V37_LEFT_DEFAULT_CURVE_OFFSET + 9], 96);
        assert_eq!(settings.right_curve.center, 14);
        assert_eq!(settings.right_curve.point1_x, 41);
        assert_eq!(settings.right_curve.point1_y, 30);
        assert_eq!(settings.right_curve.point2_x, 92);
        assert_eq!(settings.right_curve.point2_y, 71);
        assert_eq!(settings.right_curve.edge, 5);
        assert_eq!(settings.right_curve.stabilization, 0);
        assert_eq!(profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 0x0A], 0);
        assert_eq!(profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 2], 14);
        assert_eq!(profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 3], 0);
        assert_eq!(profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 8], 95);
        assert_eq!(profile[V37_RIGHT_DEFAULT_CURVE_OFFSET + 9], 100);
    }

    #[test]
    fn preserves_independent_keymap_entries() {
        let mut profile = profile();
        let mut key_bindings = [[0_u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT];
        key_bindings[0] = [0x01, 0x02, 0x03, 0x04];
        key_bindings[31] = [0xa0, 0xb0, 0xc0, 0xd0];

        set_controller_settings(
            &mut profile,
            false,
            CurveSettings {
                center: 1,
                point1_x: 2,
                point1_y: 3,
                point2_x: 4,
                point2_y: 5,
                edge: 6,
                stabilization: 0,
            },
            CurveSettings {
                center: 11,
                point1_x: 12,
                point1_y: 13,
                point2_x: 14,
                point2_y: 15,
                edge: 16,
                stabilization: 0,
            },
            key_bindings,
            RapidFireSettings {
                keys: rapid_keys(&[(24, Some(false))]),
                speed_index: None,
            },
        )
        .unwrap();

        let settings = controller_settings(&profile).unwrap();
        assert_eq!(settings.key_bindings[0], [0x01, 0x02, 0x03, 0x04]);
        assert_eq!(settings.key_bindings[31], [0xa0, 0xb0, 0xc0, 0xd0]);
        assert_ne!(settings.left_curve.center, settings.right_curve.center);
    }

    #[test]
    fn toggles_all_turbo_bits_and_preserves_unknown_bits() {
        let mut profile = profile();
        profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + 4]
            .copy_from_slice(&[0x80, 0x22, 0x33, 0x44]);

        set_controller_settings(
            &mut profile,
            false,
            CurveSettings {
                center: 0,
                point1_x: 0,
                point1_y: 0,
                point2_x: 0,
                point2_y: 0,
                edge: 0,
                stabilization: 0,
            },
            CurveSettings {
                center: 0,
                point1_x: 0,
                point1_y: 0,
                point2_x: 0,
                point2_y: 0,
                edge: 0,
                stabilization: 0,
            },
            [[0_u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT],
            RapidFireSettings {
                keys: rapid_keys(&[
                    (0, Some(true)),
                    (23, Some(true)),
                    (24, Some(true)),
                    (25, Some(true)),
                    (26, Some(true)),
                    (31, Some(true)),
                ]),
                speed_index: Some(2),
            },
        )
        .unwrap();
        assert_eq!(
            &profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + 4],
            &[0x87, 0xa2, 0x33, 0x45]
        );
        assert_eq!(profile[V37_TURBO_SPEED_INDEX_OFFSET], 2);
        let keys = rapid_fire_settings(&profile).unwrap().keys;
        assert_eq!(keys[0], Some(true));
        assert_eq!(keys[23], Some(true));
        assert_eq!(keys[24], Some(true));
        assert_eq!(keys[25], Some(true));
        assert_eq!(keys[26], Some(true));
        assert_eq!(keys[31], Some(true));

        set_controller_settings(
            &mut profile,
            false,
            CurveSettings {
                center: 0,
                point1_x: 0,
                point1_y: 0,
                point2_x: 0,
                point2_y: 0,
                edge: 0,
                stabilization: 0,
            },
            CurveSettings {
                center: 0,
                point1_x: 0,
                point1_y: 0,
                point2_x: 0,
                point2_y: 0,
                edge: 0,
                stabilization: 0,
            },
            [[0_u8; V37_KEYMAP_ENTRY_LENGTH]; V37_KEYMAP_ENTRY_COUNT],
            RapidFireSettings {
                keys: rapid_keys(&[(24, Some(false))]),
                speed_index: None,
            },
        )
        .unwrap();
        assert_eq!(
            &profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + 4],
            &[0x86, 0xa2, 0x33, 0x45]
        );
        let keys = rapid_fire_settings(&profile).unwrap().keys;
        assert_eq!(keys[0], Some(true));
        assert_eq!(keys[23], Some(true));
        assert_eq!(keys[24], Some(false));
        assert_eq!(keys[31], Some(true));
    }

    #[test]
    fn decodes_v33_turbo_mask_and_speed_table() {
        let mut profile = profile();
        profile[V37_TURBO_KEY_MASK_OFFSET..V37_TURBO_KEY_MASK_OFFSET + 4]
            .copy_from_slice(&[0x03, 0x80, 0x00, 0x00]);

        assert_eq!(
            turbo_key_mask(&profile).unwrap(),
            turbo_key_bit(23) | turbo_key_bit(24) | turbo_key_bit(25)
        );
        assert_eq!(
            rapid_fire_timing(0),
            Some(RapidFireTiming {
                period_ms: 200,
                half_period_ms: 100,
                hz: 5,
            })
        );
        assert_eq!(
            rapid_fire_timing(1),
            Some(RapidFireTiming {
                period_ms: 100,
                half_period_ms: 50,
                hz: 10,
            })
        );
        assert_eq!(
            rapid_fire_timing(2),
            Some(RapidFireTiming {
                period_ms: 50,
                half_period_ms: 25,
                hz: 20,
            })
        );
        assert_eq!(rapid_fire_timing(3), None);
    }

    #[test]
    fn decodes_live_macro_headers_and_crc() {
        let response = [
            0, 0xa5, 0x0e, 0xd9, 0xdf, 0xed, 0x00, 0x0a, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00, 0x81,
        ];
        let record = decode_macro_info(&response).unwrap();
        assert_eq!(record.len(), MACRO_HEADER_LENGTH);
        assert_eq!(macro_crc(&record), Ok(0xdfed));
        assert_eq!(record[6], 0x1f);
    }

    #[test]
    fn reassembles_a_maximum_length_macro_info_response() {
        let record = normalize_macro_record(&vec![0; MACRO_MAX_LENGTH]).unwrap();
        let reports = long_macro_info_reports(&record);

        assert_eq!(reports.len(), 12);
        assert_eq!(reassemble_macro_info_fragments(&reports).unwrap(), record);
    }

    #[test]
    fn rejects_a_missing_macro_info_fragment() {
        let record = normalize_macro_record(&vec![0; MACRO_MAX_LENGTH]).unwrap();
        let reports = long_macro_info_reports(&record);

        let error = reassemble_macro_info_fragments(&reports[..11]).unwrap_err();
        assert!(error.contains("contains 649 bytes but declares 650"));
    }

    #[test]
    fn rejects_invalid_macro_crc() {
        let mut record = normalize_macro_record(&[0; MACRO_HEADER_LENGTH]).unwrap();
        record[0] ^= 1;
        assert!(validate_macro_crc(&record).is_err());
    }

    #[test]
    fn rejects_undefined_macro_stick_direction() {
        let mut record = vec![0; MACRO_HEADER_LENGTH + MACRO_STEP_LENGTH];
        record[10 + 2] = 0x03;
        let error = normalize_macro_record(&record).unwrap_err();
        assert!(error.contains("undefined left-stick direction code"));
    }

    #[test]
    fn enforces_the_64_step_macro_limit() {
        assert_eq!(MACRO_MAX_LENGTH, 650);
        assert!(normalize_macro_record(&vec![0; MACRO_MAX_LENGTH]).is_ok());
        assert!(normalize_macro_record(&vec![0; MACRO_MAX_LENGTH + MACRO_STEP_LENGTH]).is_err());
    }

    #[test]
    fn builds_empty_macro_write_and_ack() {
        let record = [0, 0, 0, 0, 0, 0, 0x1f, 0, 0, 0];
        let reports = build_macro_write_reports(0, &record).unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(
            reports[0][1..17],
            [
                0xa4, 0x10, 0xd8, 0x01, 0x00, 0xdf, 0xed, 0x00, 0x0a, 0x00, 0x00, 0x1f, 0x00, 0x00,
                0x00, 0x82,
            ]
        );
        assert_eq!(
            validate_macro_write_ack(&[0, 0xa5, 5, 0xd8, 0, 0x82]),
            Ok(0)
        );
    }

    #[test]
    fn builds_and_decodes_short_device_settings_commands() {
        assert_eq!(
            build_set_polling_rate_report(0x63)[1..6],
            [0xa5, 0x05, 0xf6, 0x63, 0x03]
        );
        assert_eq!(get_step_accuracy_report()[1..5], [0xa5, 0x04, 0xf7, 0xa0]);
        assert_eq!(
            build_set_step_accuracy_report(StepAccuracySettings {
                mode: 1,
                value: 0x0100,
                extension: 0,
            })[1..9],
            [0xa5, 0x08, 0xf7, 0x01, 0x00, 0x01, 0x00, 0xa5]
        );
        assert_eq!(
            decode_step_accuracy(&[0, 0xa5, 0x08, 0xf7, 0x01, 0x00, 0x01, 0x00, 0xa6])
                .map(|settings| (settings.mode, settings.value, settings.extension)),
            Ok((1, 0x0100, 0))
        );
    }
}
