use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};

use crate::protocol;

const PROFILE_READ_TIMEOUT_MS: i32 = 5_000;
const PROFILE_SIZE_TIMEOUT_MS: i32 = 500;
const SHORT_COMMAND_TIMEOUT_MS: i32 = 1_000;
const ACK_TIMEOUT_MS: i32 = 2_000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSummary {
    pub vendor_product: String,
    pub usage: String,
    pub product: String,
    pub path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSession {
    pub device: DeviceSummary,
    pub uuid: String,
    pub zkm_version: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub device: Option<DeviceSummary>,
    pub stored_crc: String,
    pub computed_crc: String,
    pub vibration: VibrationSettingsSummary,
    pub settings: ControllerSettingsSummary,
    pub raw_profile: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingChange {
    pub label: String,
    pub before: String,
    pub after: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProfileResult {
    pub profile: ProfileSummary,
    pub ack: String,
    pub ack_value: u8,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurveSettingsSummary {
    center: i16,
    point1_x: u8,
    point1_y: u8,
    point2_x: u8,
    point2_y: u8,
    edge: i16,
    stabilization: i16,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RectangleAlgorithmSettings {
    left_stick: bool,
    right_stick: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSettingsSummary {
    rectangle_algorithm: RectangleAlgorithmSettings,
    left_stick: CurveSettingsSummary,
    right_stick: CurveSettingsSummary,
    rapid_fire: RapidFireSummary,
    rapid_fire_speed_index: Option<u8>,
    rapid_fire_timing: Option<RapidFireTimingSummary>,
    key_bindings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSettingsInput {
    rectangle_algorithm: RectangleAlgorithmSettings,
    left_stick: CurveSettingsInput,
    right_stick: CurveSettingsInput,
    key_bindings: Vec<String>,
    #[serde(default)]
    rapid_fire: RapidFireInput,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RapidFireSummary {
    keys: Vec<Option<bool>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RapidFireTimingSummary {
    period_ms: u16,
    half_period_ms: u16,
    hz: u8,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapidFireInput {
    #[serde(default)]
    keys: Vec<Option<bool>>,
    speed_index: Option<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VibrationGripSummary {
    min: u8,
    max: u8,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VibrationSettingsSummary {
    left: VibrationGripSummary,
    right: VibrationGripSummary,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VibrationGripInput {
    min: u8,
    max: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VibrationSettingsInput {
    left: VibrationGripInput,
    right: VibrationGripInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurveSettingsInput {
    center: i16,
    point1_x: u8,
    point1_y: u8,
    point2_x: u8,
    point2_y: u8,
    edge: i16,
    stabilization: i16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepAccuracySummary {
    mode: u8,
    value: u16,
    extension: u8,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettingsSummary {
    polling_rate: u8,
    step_accuracy: StepAccuracySummary,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettingsInput {
    polling_rate: u8,
    step_accuracy: StepAccuracyInput,
}

#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepAccuracyInput {
    mode: u8,
    value: u16,
    extension: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettingsWriteResult {
    device: DeviceSummary,
    settings: DeviceSettingsSummary,
    polling_command: String,
    step_accuracy_command: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroSlotSummary {
    slot: u8,
    crc: String,
    active_length: usize,
    step_count: usize,
    setting: u8,
    m_key: u8,
    run_key: u8,
    flags: u8,
    repeat: u16,
    raw_record: Vec<u8>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroSummary {
    device: DeviceSummary,
    list_response: String,
    slots: Vec<MacroSlotSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacroWriteResult {
    device: DeviceSummary,
    slot: MacroSlotSummary,
    ack: String,
    ack_value: u8,
}

pub fn scan_device() -> Result<Option<DeviceSession>, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let Some(info) = find_config_info(&api) else {
        return Ok(None);
    };
    let device_summary = summary(info);
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    let uuid = transact_short(&device, &protocol::get_device_uuid_report(), 0xef)
        .and_then(|response| protocol::decode_device_uuid(&response))
        .unwrap_or_default();
    let zkm_version = transact_short(&device, &protocol::get_zkm_version_report(), 0x0b)
        .and_then(|response| protocol::decode_zkm_version(&response))
        .unwrap_or_default();
    Ok(Some(DeviceSession {
        device: device_summary,
        uuid,
        zkm_version,
    }))
}

pub fn read_profile_summary(expected_device_path: &str) -> Result<ProfileSummary, String> {
    let (device, profile) = read_profile(expected_device_path)?;
    build_profile_summary(profile, Some(device))
}

pub fn load_profile_summary(input: Vec<u8>) -> Result<ProfileSummary, String> {
    let profile = protocol::normalize_v37_profile(&input)?;
    build_profile_summary(profile, None)
}

pub fn apply_profile(input: Vec<u8>, device_path: &str) -> Result<ApplyProfileResult, String> {
    let profile = protocol::normalize_v37_profile(&input)?;
    let (device, ack, ack_value) = write_profile(&profile, device_path)?;
    Ok(ApplyProfileResult {
        profile: build_profile_summary(profile, Some(device))?,
        ack: spaced_hex(&ack),
        ack_value,
    })
}

pub fn build_profile_summary(
    profile: Vec<u8>,
    device: Option<DeviceSummary>,
) -> Result<ProfileSummary, String> {
    let stored_crc = protocol::stored_profile_crc(&profile)?;
    let computed_crc = protocol::profile_crc(&profile)?;
    let vibration = protocol::vibration_settings(&profile)?;
    let settings = settings_summary(&profile)?;
    Ok(ProfileSummary {
        device,
        stored_crc: format!("{stored_crc:04X}"),
        computed_crc: format!("{computed_crc:04X}"),
        vibration: vibration_summary(vibration),
        settings,
        raw_profile: profile,
    })
}

pub fn update_vibration(
    profile: Vec<u8>,
    input: VibrationSettingsInput,
) -> Result<ProfileSummary, String> {
    let mut profile = protocol::normalize_v37_profile(&profile)?;
    let settings = input.into_settings()?;
    protocol::set_vibration_settings(&mut profile, settings)?;
    build_profile_summary(profile, None)
}

pub fn update_controller_settings(
    profile: Vec<u8>,
    input: ControllerSettingsInput,
) -> Result<ProfileSummary, String> {
    let mut profile = protocol::normalize_v37_profile(&profile)?;
    let ControllerSettingsInput {
        rectangle_algorithm,
        left_stick,
        right_stick,
        key_bindings,
        rapid_fire,
    } = input;
    let key_bindings = parse_key_bindings(key_bindings)?;
    if rapid_fire.keys.len() > protocol::V37_KEYMAP_ENTRY_COUNT {
        return Err(format!(
            "rapid-fire state must contain at most {} buttons",
            protocol::V37_KEYMAP_ENTRY_COUNT
        ));
    }
    let mut rapid_keys = [None; protocol::V37_KEYMAP_ENTRY_COUNT];
    for (slot, enabled) in rapid_fire.keys.into_iter().enumerate() {
        rapid_keys[slot] = enabled;
    }
    protocol::set_controller_settings(
        &mut profile,
        rectangle_algorithm.left_stick,
        rectangle_algorithm.right_stick,
        left_stick.into_curve("left stick")?,
        right_stick.into_curve("right stick")?,
        key_bindings,
        protocol::RapidFireSettings {
            keys: rapid_keys,
            speed_index: rapid_fire.speed_index,
        },
    )?;
    let crc = protocol::profile_crc(&profile)?;
    profile[..2].copy_from_slice(&crc.to_be_bytes());
    build_profile_summary(profile, None)
}

pub fn profile_changes(before: &[u8], after: &[u8]) -> Result<Vec<SettingChange>, String> {
    let before = protocol::normalize_v37_profile(before)?;
    let after = protocol::normalize_v37_profile(after)?;
    let before_settings = protocol::controller_settings(&before)?;
    let after_settings = protocol::controller_settings(&after)?;
    let before_vibration = protocol::vibration_settings(&before)?;
    let after_vibration = protocol::vibration_settings(&after)?;
    let mut changes = Vec::new();

    add_change(
        &mut changes,
        "左スティック / 矩形アルゴリズム",
        boolean_value(before_settings.left_rectangle_algorithm),
        boolean_value(after_settings.left_rectangle_algorithm),
    );
    add_change(
        &mut changes,
        "右スティック / 矩形アルゴリズム",
        boolean_value(before_settings.right_rectangle_algorithm),
        boolean_value(after_settings.right_rectangle_algorithm),
    );
    add_curve_changes(
        &mut changes,
        "左スティック",
        before_settings.left_curve,
        after_settings.left_curve,
    );
    add_curve_changes(
        &mut changes,
        "右スティック",
        before_settings.right_curve,
        after_settings.right_curve,
    );

    for (index, (before_entry, after_entry)) in before_settings
        .key_bindings
        .iter()
        .zip(after_settings.key_bindings.iter())
        .enumerate()
    {
        if before_entry != after_entry {
            let label = KEYMAP_SLOT_LABELS.get(index).copied().unwrap_or("スロット");
            add_change(
                &mut changes,
                &format!("キーバインド / {label}"),
                keymap_value(before_entry, index),
                keymap_value(after_entry, index),
            );
        }
    }

    add_change(
        &mut changes,
        "連射 / 速度",
        rapid_fire_speed_value(before_settings.rapid_fire.speed_index),
        rapid_fire_speed_value(after_settings.rapid_fire.speed_index),
    );
    for (index, (before_value, after_value)) in before_settings
        .rapid_fire
        .keys
        .iter()
        .zip(after_settings.rapid_fire.keys.iter())
        .enumerate()
    {
        if before_value != after_value {
            let label = KEYMAP_SLOT_LABELS.get(index).copied().unwrap_or("スロット");
            add_change(
                &mut changes,
                &format!("連射 / {label}"),
                optional_boolean_value(*before_value),
                optional_boolean_value(*after_value),
            );
        }
    }

    add_change(
        &mut changes,
        "振動 / 左グリップ / 最小",
        before_vibration.left.min,
        after_vibration.left.min,
    );
    add_change(
        &mut changes,
        "振動 / 左グリップ / 最大",
        before_vibration.left.max,
        after_vibration.left.max,
    );
    add_change(
        &mut changes,
        "振動 / 右グリップ / 最小",
        before_vibration.right.min,
        after_vibration.right.min,
    );
    add_change(
        &mut changes,
        "振動 / 右グリップ / 最大",
        before_vibration.right.max,
        after_vibration.right.max,
    );

    Ok(changes)
}

pub fn device_settings_changes(
    before: &DeviceSettingsInput,
    after: &DeviceSettingsInput,
) -> Vec<SettingChange> {
    let mut changes = Vec::new();
    add_change(
        &mut changes,
        "デバイス設定 / ポーリングレート",
        polling_rate_value(before.polling_rate),
        polling_rate_value(after.polling_rate),
    );
    if before.step_accuracy.mode != after.step_accuracy.mode
        || before.step_accuracy.value != after.step_accuracy.value
    {
        add_change(
            &mut changes,
            "デバイス設定 / ステップ精度",
            step_accuracy_value(&before.step_accuracy),
            step_accuracy_value(&after.step_accuracy),
        );
    }
    add_change(
        &mut changes,
        "デバイス設定 / ステップ精度拡張",
        before.step_accuracy.extension,
        after.step_accuracy.extension,
    );
    changes
}

pub fn validate_device_settings(input: &DeviceSettingsInput) -> Result<(), String> {
    if !matches!(input.polling_rate, 0..=3) {
        return Err(format!(
            "polling rate code {} is not supported",
            input.polling_rate
        ));
    }
    if input.step_accuracy.mode == 1 && !matches!(input.step_accuracy.value, 32 | 64 | 128 | 256) {
        return Err(format!(
            "step accuracy value {} is not supported",
            input.step_accuracy.value
        ));
    }
    if !matches!(input.step_accuracy.mode, 0 | 1) {
        return Err(format!(
            "step accuracy mode {} is not supported",
            input.step_accuracy.mode
        ));
    }
    Ok(())
}

const KEYMAP_SLOT_LABELS: &[&str] = &[
    "A",
    "B",
    "予約/未割当",
    "X",
    "Y",
    "予約/未割当",
    "LB",
    "RB",
    "LT",
    "RT",
    "View",
    "Menu",
    "予約/未割当",
    "L3",
    "R3",
    "Share",
    "Up",
    "Down",
    "Left",
    "Right",
    "動的/未割当",
    "動的/未割当",
    "動的/未割当",
    "M1",
    "M2",
    "M3",
    "M4",
    "動的/未割当",
    "動的/未割当",
    "動的/未割当",
    "動的/未割当",
    "動的/未割当",
];

const KEYMAP_TARGET_LABELS: &[&str] = &[
    "A",
    "B",
    "C",
    "X",
    "Y",
    "Z",
    "L1",
    "R1",
    "L2",
    "R2",
    "SELECT / View",
    "START / Menu",
    "HOME",
    "L3",
    "R3",
    "CAPTURE / Share",
    "Up",
    "Down",
    "Left",
    "Right",
    "Back",
    "Mode",
    "Menu",
    "M1",
    "M2",
    "M3",
    "M4",
    "M5",
    "M6",
    "M7",
    "M8",
    "POWER",
];

fn add_change<B: ToString, A: ToString>(
    changes: &mut Vec<SettingChange>,
    label: &str,
    before: B,
    after: A,
) {
    let before = before.to_string();
    let after = after.to_string();
    if before != after {
        changes.push(SettingChange {
            label: label.to_string(),
            before,
            after,
        });
    }
}

fn add_curve_changes(
    changes: &mut Vec<SettingChange>,
    stick_label: &str,
    before: protocol::CurveSettings,
    after: protocol::CurveSettings,
) {
    add_change(
        changes,
        &format!("{stick_label} / センター"),
        before.center,
        after.center,
    );
    add_change(
        changes,
        &format!("{stick_label} / ポイント1 X"),
        before.point1_x,
        after.point1_x,
    );
    add_change(
        changes,
        &format!("{stick_label} / ポイント1 Y"),
        before.point1_y,
        after.point1_y,
    );
    add_change(
        changes,
        &format!("{stick_label} / ポイント2 X"),
        before.point2_x,
        after.point2_x,
    );
    add_change(
        changes,
        &format!("{stick_label} / ポイント2 Y"),
        before.point2_y,
        after.point2_y,
    );
    add_change(
        changes,
        &format!("{stick_label} / エッジ"),
        before.edge,
        after.edge,
    );
    add_change(
        changes,
        &format!("{stick_label} / 安定化"),
        signed_stabilization(before.stabilization),
        signed_stabilization(after.stabilization),
    );
}

fn boolean_value(value: bool) -> &'static str {
    if value { "有効" } else { "無効" }
}

fn optional_boolean_value(value: Option<bool>) -> &'static str {
    match value {
        Some(true) => "有効",
        Some(false) => "無効",
        None => "不明",
    }
}

fn rapid_fire_speed_value(value: Option<u8>) -> &'static str {
    match value {
        Some(0) => "遅い（5回/秒）",
        Some(1) => "標準（10回/秒）",
        Some(2) => "速い（20回/秒）",
        Some(_) | None => "不明",
    }
}

fn polling_rate_value(value: u8) -> String {
    match value {
        2 => "250 Hz".to_string(),
        1 => "500 Hz".to_string(),
        0 => "1000 Hz".to_string(),
        3 => "2000 Hz".to_string(),
        _ => "不明".to_string(),
    }
}

fn step_accuracy_value(value: &StepAccuracyInput) -> String {
    match (value.mode, value.value) {
        (0, _) => "アダプティブ".to_string(),
        (1, 32 | 64 | 128 | 256) => value.value.to_string(),
        _ => "不明".to_string(),
    }
}

fn keymap_value(entry: &[u8; 4], source_slot: usize) -> String {
    if entry.iter().all(|value| *value == 0) {
        return format!(
            "{}（標準）",
            KEYMAP_SLOT_LABELS
                .get(source_slot)
                .copied()
                .unwrap_or("標準")
        );
    }
    if entry[0] == 0x01 {
        if entry[1] == 0xff {
            return "なし".to_string();
        }
        return KEYMAP_TARGET_LABELS
            .get(usize::from(entry[1]))
            .copied()
            .unwrap_or("未設定")
            .to_string();
    }
    if entry[0] == 0x02 {
        let Some(primary) = keyboard_key_label(entry[2]) else {
            return "キーボード設定".to_string();
        };
        let mut keys = vec![primary];
        if entry[3] != 0 {
            let Some(second) = keyboard_key_label(entry[3]) else {
                return "キーボード設定".to_string();
            };
            keys.push(second);
        }
        let Some(modifier) = keyboard_modifier_label(entry[1]) else {
            return "キーボード設定".to_string();
        };
        if modifier == "None" {
            return keys.join(" + ");
        }
        return format!("{modifier} + {}", keys.join(" + "));
    }
    "未設定".to_string()
}

fn keyboard_key_label(usage: u8) -> Option<String> {
    if (0x04..=0x1d).contains(&usage) {
        return Some(char::from(b'A' + usage - 0x04).to_string());
    }
    if (0x1e..=0x26).contains(&usage) {
        return Some(char::from(b'1' + usage - 0x1e).to_string());
    }
    if usage == 0x27 {
        return Some("0".into());
    }
    if (0x3a..=0x45).contains(&usage) {
        return Some(format!("F{}", usage - 0x3a + 1));
    }
    if (0x59..=0x61).contains(&usage) {
        return Some(format!("Num{}", usage - 0x59 + 1));
    }
    if usage == 0x62 {
        return Some("Num0".into());
    }
    let label = match usage {
        0x35 => "~",
        0x29 => "Esc",
        0x2b => "Tab",
        0x2c => "Space",
        0x39 => "Caps Lock",
        0x28 => "Enter",
        0x50 => "Left",
        0x4f => "Right",
        0x52 => "Up",
        0x51 => "Down",
        0x46 => "Print Screen",
        0xe0 => "L Ctrl",
        0xe1 => "L Shift",
        0xe2 => "L Alt",
        0xe3 => "L Win",
        0xe4 => "R Ctrl",
        0xe5 => "R Shift",
        0xe6 => "R Alt",
        0xe7 => "R Win",
        0x49 => "Insert",
        0x4c => "Delete",
        0x4a => "Home",
        0x4d => "End",
        0x4b => "Page Up",
        0x4e => "Page Down",
        0x2d => "-",
        0x2e => "+",
        0x2a => "Backspace",
        0x2f => "[",
        0x30 => "]",
        0x31 => "\\",
        0x33 => ";",
        0x34 => "'",
        0x36 => ",",
        0x37 => ".",
        0x38 => "/",
        _ => return None,
    };
    Some(label.to_string())
}

fn keyboard_modifier_label(value: u8) -> Option<&'static str> {
    match value {
        0x00 => Some("None"),
        0x01 => Some("L Ctrl"),
        0x02 => Some("L Shift"),
        0x04 => Some("L Alt"),
        0x10 => Some("R Ctrl"),
        0x20 => Some("R Shift"),
        0x40 => Some("R Alt"),
        _ => None,
    }
}

pub fn read_device_settings(expected_device_path: &str) -> Result<DeviceSettingsSummary, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    let polling_rate = protocol::decode_polling_rate(&transact_short(
        &device,
        &protocol::get_polling_rate_report(),
        0xf6,
    )?)?;
    let step_accuracy = protocol::decode_step_accuracy(&transact_short(
        &device,
        &protocol::get_step_accuracy_report(),
        0xf7,
    )?)?;
    Ok(DeviceSettingsSummary {
        polling_rate,
        step_accuracy: step_accuracy_summary(step_accuracy),
    })
}

pub fn set_device_settings(
    expected_device_path: &str,
    input: DeviceSettingsInput,
) -> Result<DeviceSettingsWriteResult, String> {
    validate_device_settings(&input)?;
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let device_summary = summary(info);
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    let step_accuracy = protocol::StepAccuracySettings {
        mode: input.step_accuracy.mode,
        value: input.step_accuracy.value,
        extension: input.step_accuracy.extension,
    };
    let polling_report = protocol::build_set_polling_rate_report(input.polling_rate);
    write_report(&device, &polling_report).map_err(|error| {
        format!("F6 polling-rate write failed; F7 step-accuracy was not attempted: {error}")
    })?;
    let polling_response = transact_short(
        &device,
        &protocol::get_polling_rate_report(),
        0xf6,
    )
    .map_err(|error| {
        format!(
            "F6 polling-rate write was sent but readback failed; F7 step-accuracy was not attempted: {error}"
        )
    })?;
    let polling_rate = protocol::decode_polling_rate(&polling_response)
    .map_err(|error| {
        format!(
            "F6 polling-rate write was sent but readback failed; F7 step-accuracy was not attempted: {error}"
        )
    })?;
    if polling_rate != input.polling_rate {
        return Err(format!(
            "F6 polling-rate readback mismatch: requested {}, received {}; F7 step-accuracy was not attempted",
            input.polling_rate, polling_rate
        ));
    }

    let step_accuracy_report = protocol::build_set_step_accuracy_report(step_accuracy);
    write_report(&device, &step_accuracy_report).map_err(|error| {
        format!(
            "F6 polling-rate was updated and read back as {polling_rate}, but F7 step-accuracy write failed: {error}"
        )
    })?;
    let step_accuracy_response = transact_short(
        &device,
        &protocol::get_step_accuracy_report(),
        0xf7,
    )
    .map_err(|error| {
        format!(
            "F6 polling-rate was updated and read back as {polling_rate}, but F7 step-accuracy readback failed: {error}"
        )
    })?;
    let readback_step_accuracy = protocol::decode_step_accuracy(&step_accuracy_response)
    .map_err(|error| {
        format!(
            "F6 polling-rate was updated and read back as {polling_rate}, but F7 step-accuracy readback failed: {error}"
        )
    })?;
    if readback_step_accuracy.mode != step_accuracy.mode
        || readback_step_accuracy.value != step_accuracy.value
        || readback_step_accuracy.extension != step_accuracy.extension
    {
        return Err(format!(
            "F6 polling-rate was updated and read back as {polling_rate}, but F7 step-accuracy readback mismatched the requested value"
        ));
    }

    Ok(DeviceSettingsWriteResult {
        device: device_summary,
        settings: DeviceSettingsSummary {
            polling_rate,
            step_accuracy: step_accuracy_summary(readback_step_accuracy),
        },
        polling_command: spaced_hex(protocol::wire_bytes(&polling_report)),
        step_accuracy_command: spaced_hex(protocol::wire_bytes(&step_accuracy_report)),
    })
}

pub fn read_macros(expected_device_path: &str) -> Result<MacroSummary, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let device_summary = summary(info);
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    let list = transact_short(&device, &protocol::get_macro_list_report(), 0xd5)?;
    let entries = protocol::decode_macro_list(&list)?;
    let mut slots = Vec::with_capacity(protocol::MACRO_SLOT_COUNT);
    for (slot, entry) in entries.into_iter().enumerate() {
        let slot_u8 = slot as u8;
        let base = macro_slot_summary(slot_u8, entry.crc, entry.active_length, Vec::new(), None);
        match protocol::get_macro_info_report(slot_u8)
            .and_then(|request| transact_macro_info(&device, &request))
        {
            Ok(record) => slots.push(macro_slot_summary(
                slot_u8,
                entry.crc,
                entry.active_length,
                record,
                None,
            )),
            Err(error) => slots.push(MacroSlotSummary {
                error: Some(error),
                ..base
            }),
        }
    }
    Ok(MacroSummary {
        device: device_summary,
        list_response: spaced_hex(&list),
        slots,
    })
}

pub fn write_macro(
    expected_device_path: &str,
    slot: u8,
    raw_record: Vec<u8>,
) -> Result<MacroWriteResult, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let device_summary = summary(info);
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    let normalized = protocol::normalize_macro_record(&raw_record)?;
    protocol::validate_macro_crc(&normalized)?;
    for report in protocol::build_macro_write_reports(slot, &normalized)? {
        write_report(&device, &report)?;
    }
    let mut ack = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = device
        .read_timeout(&mut ack, ACK_TIMEOUT_MS)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("timed out waiting for macro D8 ACK".into());
    }
    let ack_wire = protocol::wire_bytes(&ack[..read]);
    let ack_value = protocol::validate_macro_write_ack(ack_wire)?;
    if ack_value != 0 {
        return Err(format!("macro D8 returned status 0x{ack_value:02X}"));
    }
    let after_request = protocol::get_macro_info_report(slot)?;
    let after_record = transact_macro_info(&device, &after_request)?;
    if after_record != normalized {
        return Err("macro D9 readback does not match the normalized write data".into());
    }
    Ok(MacroWriteResult {
        device: device_summary,
        slot: macro_slot_summary(
            slot,
            u16::from_be_bytes([after_record[0], after_record[1]]),
            after_record.len(),
            after_record,
            None,
        ),
        ack: spaced_hex(&ack_wire[..usize::from(ack_wire[1])]),
        ack_value,
    })
}

fn read_profile(expected_device_path: &str) -> Result<(DeviceSummary, Vec<u8>), String> {
    read_profile_once(expected_device_path)
}

fn read_profile_once(expected_device_path: &str) -> Result<(DeviceSummary, Vec<u8>), String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let summary = summary(info);
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    write_report(&device, &protocol::get_base_profile_report())?;

    let mut profile = Vec::with_capacity(protocol::V37_PROFILE_LENGTH);
    for expected_sequence in 1..=16_u8 {
        let mut report = [0_u8; protocol::HID_REPORT_LENGTH];
        let read = device
            .read_timeout(&mut report, PROFILE_READ_TIMEOUT_MS)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            let received_fragments = expected_sequence - 1;
            let received_bytes = profile.len();
            drop(device);
            return Err(diagnose_profile_read_timeout(
                expected_device_path,
                received_fragments,
                received_bytes,
            ));
        }

        let fragment = protocol::decode_read_fragment(&report[..read])?;
        if fragment.sequence != expected_sequence {
            return Err(format!(
                "unexpected profile fragment sequence {}, expected {expected_sequence}",
                fragment.sequence
            ));
        }
        profile.extend_from_slice(&fragment.payload);

        if let Some(length) = protocol::declared_profile_length(&profile)
            && profile.len() >= length
        {
            profile.truncate(length);
            return Ok((summary, profile));
        }
    }
    Err("profile did not complete within 16 reports".into())
}

fn diagnose_profile_read_timeout(
    expected_device_path: &str,
    received_fragments: u8,
    received_bytes: usize,
) -> String {
    match read_profile_size(expected_device_path) {
        Ok(size) => format!(
            "GetBaseProfile (D6) did not complete after {received_fragments} fragments ({received_bytes} bytes), but GetProfileSize (D3) reports {size} bytes. The short command path is alive; D6 firmware state and host transfer/reassembly state are not yet distinguishable. Stop retrying D6. A HOME-button reset recovered this state in testing, but also restored the observed profile to defaults; use it only if losing current settings is acceptable."
        ),
        Err(error) => format!(
            "GetBaseProfile (D6) did not complete after {received_fragments} fragments ({received_bytes} bytes), and the D3 health probe also failed ({error}). The interface or host path may be unavailable; do not classify this as a firmware-only D6 failure. Stop retrying. A HOME-button reset recovered this state in testing, but also restored the observed profile to defaults; use it only if losing current settings is acceptable."
        ),
    }
}

fn read_profile_size(expected_device_path: &str) -> Result<usize, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    write_report(&device, &protocol::get_profile_size_report())?;

    let mut report = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = device
        .read_timeout(&mut report, PROFILE_SIZE_TIMEOUT_MS)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("GetProfileSize timed out".into());
    }
    protocol::decode_profile_size(&report[..read])
}

fn write_profile(
    profile: &[u8],
    expected_device_path: &str,
) -> Result<(DeviceSummary, Vec<u8>, u8), String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info_at_path(&api, expected_device_path)?;
    let device_summary = summary(info);
    let hid_device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    for report in protocol::build_v37_write_reports(profile)? {
        write_report(&hid_device, &report)?;
    }

    let mut ack = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = hid_device
        .read_timeout(&mut ack, ACK_TIMEOUT_MS)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("timed out waiting for SetBaseProfile ACK".into());
    }
    let wire = protocol::wire_bytes(&ack[..read]);
    let value = protocol::validate_set_profile_ack(wire)?;
    Ok((device_summary, wire[..usize::from(wire[1])].to_vec(), value))
}

fn write_report(device: &HidDevice, report: &[u8]) -> Result<(), String> {
    let written = device.write(report).map_err(|error| error.to_string())?;
    if written != report.len() {
        return Err(format!("short HID write: {written}/{}", report.len()));
    }
    Ok(())
}

fn transact_short(device: &HidDevice, request: &[u8], command: u8) -> Result<Vec<u8>, String> {
    write_report(device, request)?;
    let mut response = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = device
        .read_timeout(&mut response, SHORT_COMMAND_TIMEOUT_MS)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err(format!("command 0x{command:02X} timed out"));
    }
    let wire = protocol::wire_bytes(&response[..read]);
    if wire.len() < 2 {
        return Err(format!(
            "command 0x{command:02X} returned an empty response"
        ));
    }
    Ok(wire.to_vec())
}

fn transact_macro_info(device: &HidDevice, request: &[u8]) -> Result<Vec<u8>, String> {
    write_report(device, request)?;
    let first = read_macro_info_report(device)?;
    match first.first().copied() {
        Some(0xa5) => protocol::decode_macro_info(&first),
        Some(0xa4) => {
            let first_fragment = protocol::decode_macro_info_fragment(&first)?;
            if first_fragment.sequence != 1 {
                return Err(format!(
                    "unexpected D9 fragment sequence {}, expected 1",
                    first_fragment.sequence
                ));
            }
            let active_length = protocol::macro_record_length(&first_fragment.payload)?;
            let mut received_length = first_fragment.payload.len();
            let mut expected_sequence = 2_u8;
            let mut reports = vec![first];

            while received_length < active_length {
                let report = read_macro_info_report(device)?;
                let fragment = protocol::decode_macro_info_fragment(&report)?;
                if fragment.sequence != expected_sequence {
                    return Err(format!(
                        "unexpected D9 fragment sequence {}, expected {expected_sequence}",
                        fragment.sequence
                    ));
                }
                received_length += fragment.payload.len();
                if received_length > active_length {
                    return Err(format!(
                        "D9 response contains more than the declared {active_length} bytes"
                    ));
                }
                reports.push(report);
                expected_sequence = expected_sequence
                    .checked_add(1)
                    .ok_or_else(|| "D9 response contains too many fragments".to_string())?;
            }

            protocol::reassemble_macro_info_fragments(&reports)
        }
        Some(command) => Err(format!("unexpected D9 response header 0x{command:02X}")),
        None => Err("D9 response was empty".into()),
    }
}

fn read_macro_info_report(device: &HidDevice) -> Result<Vec<u8>, String> {
    let mut response = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = device
        .read_timeout(&mut response, SHORT_COMMAND_TIMEOUT_MS)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("command 0xD9 timed out".into());
    }
    Ok(protocol::wire_bytes(&response[..read]).to_vec())
}

fn settings_summary(profile: &[u8]) -> Result<ControllerSettingsSummary, String> {
    let settings = protocol::controller_settings(profile)?;
    Ok(ControllerSettingsSummary {
        rectangle_algorithm: RectangleAlgorithmSettings {
            left_stick: settings.left_rectangle_algorithm,
            right_stick: settings.right_rectangle_algorithm,
        },
        left_stick: CurveSettingsSummary {
            center: settings.left_curve.center,
            point1_x: settings.left_curve.point1_x,
            point1_y: settings.left_curve.point1_y,
            point2_x: settings.left_curve.point2_x,
            point2_y: settings.left_curve.point2_y,
            edge: settings.left_curve.edge,
            stabilization: signed_stabilization(settings.left_curve.stabilization),
        },
        right_stick: CurveSettingsSummary {
            center: settings.right_curve.center,
            point1_x: settings.right_curve.point1_x,
            point1_y: settings.right_curve.point1_y,
            point2_x: settings.right_curve.point2_x,
            point2_y: settings.right_curve.point2_y,
            edge: settings.right_curve.edge,
            stabilization: signed_stabilization(settings.right_curve.stabilization),
        },
        rapid_fire: RapidFireSummary {
            keys: settings.rapid_fire.keys.to_vec(),
        },
        rapid_fire_speed_index: settings.rapid_fire.speed_index,
        rapid_fire_timing: settings
            .rapid_fire
            .speed_index
            .and_then(protocol::rapid_fire_timing)
            .map(|timing| RapidFireTimingSummary {
                period_ms: timing.period_ms,
                half_period_ms: timing.half_period_ms,
                hz: timing.hz,
            }),
        key_bindings: settings
            .key_bindings
            .into_iter()
            .map(|entry| entry.iter().map(|byte| format!("{byte:02X}")).collect())
            .collect(),
    })
}

fn signed_stabilization(raw: u8) -> i16 {
    -i16::from(i8::from_ne_bytes([raw]))
}

fn macro_slot_summary(
    slot: u8,
    listed_crc: u16,
    listed_length: usize,
    record: Vec<u8>,
    error: Option<String>,
) -> MacroSlotSummary {
    let (crc, active_length, setting, m_key, run_key, flags, repeat) =
        if record.len() >= protocol::MACRO_HEADER_LENGTH {
            (
                u16::from_be_bytes([record[0], record[1]]),
                usize::from(u16::from_be_bytes([record[2], record[3]])),
                record[4],
                record[5],
                record[6],
                record[7],
                u16::from_be_bytes([record[8], record[9]]),
            )
        } else {
            (listed_crc, listed_length, 0, 0, 0, 0, 0)
        };
    MacroSlotSummary {
        slot,
        crc: format!("{crc:04X}"),
        active_length,
        step_count: active_length.saturating_sub(protocol::MACRO_HEADER_LENGTH)
            / protocol::MACRO_STEP_LENGTH,
        setting,
        m_key,
        run_key,
        flags,
        repeat,
        raw_record: record,
        error,
    }
}

fn vibration_summary(settings: protocol::VibrationSettings) -> VibrationSettingsSummary {
    VibrationSettingsSummary {
        left: VibrationGripSummary {
            min: settings.left.min,
            max: settings.left.max,
        },
        right: VibrationGripSummary {
            min: settings.right.min,
            max: settings.right.max,
        },
    }
}

fn step_accuracy_summary(settings: protocol::StepAccuracySettings) -> StepAccuracySummary {
    StepAccuracySummary {
        mode: settings.mode,
        value: settings.value,
        extension: settings.extension,
    }
}

fn parse_key_bindings(
    values: Vec<String>,
) -> Result<[[u8; 4]; protocol::V37_KEYMAP_ENTRY_COUNT], String> {
    if values.len() != protocol::V37_KEYMAP_ENTRY_COUNT {
        return Err(format!(
            "expected {} key bindings, received {}",
            protocol::V37_KEYMAP_ENTRY_COUNT,
            values.len()
        ));
    }

    let mut bindings = [[0_u8; 4]; protocol::V37_KEYMAP_ENTRY_COUNT];
    for (index, value) in values.into_iter().enumerate() {
        let compact = value.trim().replace([' ', ':', '-'], "");
        if compact.len() != 8 || !compact.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(format!(
                "key binding {} must contain exactly 8 hexadecimal digits",
                index + 1
            ));
        }
        for (byte_index, byte) in bindings[index].iter_mut().enumerate() {
            let start = byte_index * 2;
            *byte = u8::from_str_radix(&compact[start..start + 2], 16)
                .map_err(|_| format!("invalid key binding {}", index + 1))?;
        }
        validate_key_binding(&bindings[index], index)?;
    }
    Ok(bindings)
}

fn validate_key_binding(entry: &[u8; 4], index: usize) -> Result<(), String> {
    let valid = match entry[0] {
        0x00 => entry.iter().all(|value| *value == 0),
        0x01 => entry[1] == 0xff || entry[1] < protocol::V37_KEYMAP_ENTRY_COUNT as u8,
        0x02 => matches!(entry[1], 0x00 | 0x01 | 0x02 | 0x04 | 0x10 | 0x20 | 0x40) && entry[2] != 0,
        _ => false,
    };
    if valid {
        return Ok(());
    }
    Err(format!(
        "key binding {} contains an unsupported mapping",
        index + 1
    ))
}

#[cfg(test)]
mod live_tests {
    use super::*;

    #[test]
    #[ignore = "requires a connected BIGBIG WON controller"]
    fn live_macro_round_trip() {
        let device_path = scan_device()
            .expect("scan controller")
            .expect("connected controller")
            .device
            .path;
        let macros = read_macros(&device_path).expect("D5/D9 macro read");
        let slot0 = macros
            .slots
            .first()
            .expect("macro slot 0")
            .raw_record
            .clone();
        assert!(!slot0.is_empty(), "slot 0 D9 record must be present");
        let written = write_macro(&device_path, 0, slot0).expect("D8/D9 same-content round trip");
        assert_eq!(written.ack_value, 0);
    }

    #[test]
    #[ignore = "requires a connected BIGBIG WON controller"]
    fn live_probe_one_macro_step_and_restore_empty_slot() {
        let device_path = scan_device()
            .expect("scan controller")
            .expect("connected controller")
            .device
            .path;
        let macros = read_macros(&device_path).expect("initial D5/D9 macro read");
        let (slot, original) = macros
            .slots
            .iter()
            .find(|slot| {
                slot.step_count == 0 && slot.raw_record.len() == protocol::MACRO_HEADER_LENGTH
            })
            .map(|slot| (slot.slot, slot.raw_record.clone()))
            .expect("an empty macro slot is required for the reversible probe");

        let mut probe = original.clone();
        probe[4..10].copy_from_slice(&[0xA5, 0x5A, 0x1F, 0x03, 0x12, 0x34]);
        probe.extend_from_slice(&[0x50, 0x00, 0x12, 0x34, 0x56, 0x78, 0x11, 0x22, 0x33, 0x44]);
        let expected_probe =
            protocol::normalize_macro_record(&probe).expect("normalize one-step probe record");
        let written =
            write_macro(&device_path, slot, probe).expect("D8 one-step write and D9 readback");
        println!(
            "probe slot={} ack={} raw={}",
            slot,
            written.ack,
            spaced_hex(&written.slot.raw_record)
        );
        assert_eq!(written.ack, "A5 05 D8 00 82");
        assert_eq!(written.slot.raw_record, expected_probe);

        let restored =
            write_macro(&device_path, slot, original.clone()).expect("D8 restore and D9 readback");
        println!(
            "restored slot={} ack={} raw={}",
            slot,
            restored.ack,
            spaced_hex(&restored.slot.raw_record)
        );
        assert_eq!(restored.ack, "A5 05 D8 00 82");
        assert_eq!(
            restored.slot.raw_record.len(),
            protocol::MACRO_HEADER_LENGTH
        );
        assert_eq!(restored.slot.raw_record, original);
    }
}

impl CurveSettingsInput {
    fn into_curve(self, label: &str) -> Result<protocol::CurveSettings, String> {
        if !(-10..=10).contains(&self.stabilization) {
            return Err(format!("{label} stabilization must be between -10 and 10"));
        }
        // The official UI uses the opposite sign from the firmware filter byte:
        // UI +1 is serialized as signed -1 (0xFF).
        let stabilization = (-self.stabilization) as i8;
        Ok(protocol::CurveSettings {
            center: self.center,
            point1_x: self.point1_x,
            point1_y: self.point1_y,
            point2_x: self.point2_x,
            point2_y: self.point2_y,
            edge: self.edge,
            stabilization: stabilization.to_ne_bytes()[0],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn curve_input(stabilization: i16) -> CurveSettingsInput {
        CurveSettingsInput {
            center: 0,
            point1_x: 0,
            point1_y: 0,
            point2_x: 0,
            point2_y: 0,
            edge: 0,
            stabilization,
        }
    }

    #[test]
    fn accepts_official_stabilization_range_and_encodes_signed_byte() {
        assert_eq!(
            curve_input(-10).into_curve("left").unwrap().stabilization,
            0x0a
        );
        assert_eq!(
            curve_input(0).into_curve("left").unwrap().stabilization,
            0x00
        );
        assert_eq!(
            curve_input(10).into_curve("left").unwrap().stabilization,
            0xf6
        );
    }

    #[test]
    fn rejects_stabilization_outside_official_range() {
        assert!(curve_input(-11).into_curve("left").is_err());
        assert!(curve_input(11).into_curve("left").is_err());
    }

    #[test]
    fn validates_keymap_mapping_types() {
        let valid = vec![
            "00000000".to_string(),
            "0102FFFF".to_string(),
            "01FFFFFF".to_string(),
            "02000400".to_string(),
        ];
        assert!(
            parse_key_bindings(
                valid
                    .into_iter()
                    .chain(std::iter::repeat("00000000".to_string()))
                    .take(protocol::V37_KEYMAP_ENTRY_COUNT)
                    .collect(),
            )
            .is_ok()
        );

        let invalid = vec![
            "03000000".to_string(),
            "00000001".to_string(),
            "02030004".to_string(),
        ];
        for entry in invalid {
            let values = std::iter::once(entry)
                .chain(std::iter::repeat("00000000".to_string()))
                .take(protocol::V37_KEYMAP_ENTRY_COUNT)
                .collect();
            assert!(parse_key_bindings(values).is_err());
        }
    }

    #[test]
    fn validates_device_settings_values() {
        let mut settings = DeviceSettingsInput {
            polling_rate: 0,
            step_accuracy: StepAccuracyInput {
                mode: 1,
                value: 64,
                extension: 0,
            },
        };
        assert!(validate_device_settings(&settings).is_ok());
        settings.step_accuracy.value = 12;
        assert!(validate_device_settings(&settings).is_err());
        settings.step_accuracy.value = 64;
        settings.step_accuracy.mode = 2;
        assert!(validate_device_settings(&settings).is_err());
    }

    #[test]
    fn reports_semantic_profile_changes_without_wire_bytes() {
        let before = protocol::new_v37_profile();
        let mut after = before.clone();
        after[protocol::V37_KEYMAP_OFFSET..protocol::V37_KEYMAP_OFFSET + 4]
            .copy_from_slice(&[0x02, 0x00, 0x04, 0x00]);
        let crc = protocol::profile_crc(&after).unwrap();
        after[..2].copy_from_slice(&crc.to_be_bytes());

        let changes = profile_changes(&before, &after).unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].label, "キーバインド / A");
        assert_eq!(changes[0].before, "A（標準）");
        assert_eq!(changes[0].after, "A");
    }
}

impl VibrationSettingsInput {
    fn into_settings(self) -> Result<protocol::VibrationSettings, String> {
        let off =
            self.left.min == 0 && self.left.max == 1 && self.right.min == 0 && self.right.max == 1;
        let valid_width =
            |grip: &VibrationGripInput| grip.max >= grip.min && grip.max - grip.min >= 20;
        if !off && (!valid_width(&self.left) || !valid_width(&self.right)) {
            return Err("カスタム振動は最小と最大の差を20以上にしてください".into());
        }
        Ok(protocol::VibrationSettings {
            left: protocol::VibrationGrip {
                min: self.left.min,
                max: self.left.max,
            },
            right: protocol::VibrationGrip {
                min: self.right.min,
                max: self.right.max,
            },
        })
    }
}

fn find_config_info(api: &HidApi) -> Option<&hidapi::DeviceInfo> {
    api.device_list().find(|info| is_config_info(info))
}

fn find_config_info_at_path<'a>(
    api: &'a HidApi,
    expected_device_path: &str,
) -> Result<&'a hidapi::DeviceInfo, String> {
    api.device_list()
        .find(|info| is_config_info(info) && info.path().to_string_lossy() == expected_device_path)
        .ok_or_else(|| {
            "the connected controller changed; read its profile before continuing".into()
        })
}

fn is_config_info(info: &hidapi::DeviceInfo) -> bool {
    info.vendor_id() == protocol::VENDOR_ID
        && info.product_id() == protocol::PRODUCT_ID
        && info.usage_page() == protocol::CONFIG_USAGE_PAGE
        && info.usage() == protocol::CONFIG_USAGE
}

fn summary(info: &hidapi::DeviceInfo) -> DeviceSummary {
    DeviceSummary {
        vendor_product: format!("VID_{:04X} PID_{:04X}", info.vendor_id(), info.product_id()),
        usage: format!("0x{:04X}:0x{:04X}", info.usage_page(), info.usage()),
        product: info.product_string().unwrap_or("Controller").to_string(),
        path: info.path().to_string_lossy().into_owned(),
    }
}

fn spaced_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}
