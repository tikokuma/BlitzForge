use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};

use crate::protocol;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSummary {
    vendor_product: String,
    usage: String,
    product: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    device: DeviceSummary,
    length: usize,
    stored_crc: String,
    computed_crc: String,
    protocol_version: String,
    head: String,
    vibration: VibrationSettingsSummary,
    settings: ControllerSettingsSummary,
}

pub struct ProfileRead {
    pub summary: ProfileSummary,
    pub device_path: String,
    pub profile: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VibrationWriteResult {
    device: DeviceSummary,
    vibration: VibrationSettingsSummary,
    crc: String,
    ack: String,
    ack_value: u8,
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
    stabilization: u8,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSettingsSummary {
    rectangle_algorithm: bool,
    left_stick: CurveSettingsSummary,
    right_stick: CurveSettingsSummary,
    key_bindings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSettingsInput {
    rectangle_algorithm: bool,
    left_stick: CurveSettingsInput,
    right_stick: CurveSettingsInput,
    key_bindings: Vec<String>,
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerSettingsWriteResult {
    device: DeviceSummary,
    settings: ControllerSettingsSummary,
    head: String,
    crc: String,
    ack: String,
    ack_value: u8,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSettingsInput {
    polling_rate: u8,
    step_accuracy: StepAccuracyInput,
}

#[derive(Deserialize)]
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

pub fn scan_device() -> Result<Option<DeviceSummary>, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    Ok(find_config_info(&api).map(summary))
}

pub fn read_profile_summary() -> Result<ProfileRead, String> {
    let (device, profile) = read_profile()?;
    let stored_crc = protocol::stored_profile_crc(&profile)?;
    let computed_crc = protocol::profile_crc(&profile)?;
    let vibration = protocol::vibration_settings(&profile)?;
    let settings = settings_summary(&profile)?;
    let device_path = device.path.clone();
    Ok(ProfileRead {
        summary: ProfileSummary {
            device,
            length: profile.len(),
            stored_crc: format!("{stored_crc:04X}"),
            computed_crc: format!("{computed_crc:04X}"),
            protocol_version: if profile.len() == protocol::V37_PROFILE_LENGTH {
                "37".into()
            } else {
                "unknown".into()
            },
            head: spaced_hex(&profile[..profile.len().min(32)]),
            vibration: vibration_summary(vibration),
            settings,
        },
        device_path,
        profile,
    })
}

pub fn set_vibration(
    mut profile: Vec<u8>,
    device_path: String,
    input: VibrationSettingsInput,
) -> Result<(VibrationWriteResult, Vec<u8>), String> {
    let stored_crc = protocol::stored_profile_crc(&profile)?;
    let computed_crc = protocol::profile_crc(&profile)?;
    if stored_crc != computed_crc {
        return Err(format!(
            "refusing write: stored CRC {stored_crc:04X}, computed {computed_crc:04X}"
        ));
    }

    let settings = input.into_settings();
    let crc = protocol::set_vibration_settings(&mut profile, settings)?;
    let (device, ack, ack_value) = write_profile(&profile, &device_path)?;
    let vibration = vibration_summary(protocol::vibration_settings(&profile)?);

    Ok((
        VibrationWriteResult {
            device,
            vibration,
            crc: format!("{crc:04X}"),
            ack: spaced_hex(&ack),
            ack_value,
        },
        profile,
    ))
}

pub fn set_controller_settings(
    mut profile: Vec<u8>,
    device_path: String,
    input: ControllerSettingsInput,
) -> Result<(ControllerSettingsWriteResult, Vec<u8>), String> {
    let stored_crc = protocol::stored_profile_crc(&profile)?;
    let computed_crc = protocol::profile_crc(&profile)?;
    if stored_crc != computed_crc {
        return Err(format!(
            "refusing write: stored CRC {stored_crc:04X}, computed {computed_crc:04X}"
        ));
    }

    let key_bindings = parse_key_bindings(input.key_bindings)?;
    protocol::set_controller_settings(
        &mut profile,
        input.rectangle_algorithm,
        input.left_stick.into_curve(),
        input.right_stick.into_curve(),
        key_bindings,
    )?;
    let crc = protocol::profile_crc(&profile)?;
    profile[..2].copy_from_slice(&crc.to_be_bytes());
    let (device, ack, ack_value) = write_profile(&profile, &device_path)?;
    let settings = settings_summary(&profile)?;

    Ok((
        ControllerSettingsWriteResult {
            device,
            settings,
            head: spaced_hex(&profile[..profile.len().min(32)]),
            crc: format!("{crc:04X}"),
            ack: spaced_hex(&ack),
            ack_value,
        },
        profile,
    ))
}

pub fn read_device_settings() -> Result<DeviceSettingsSummary, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info(&api)
        .ok_or_else(|| "BIGBIG WON config interface not found".to_string())?;
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
    input: DeviceSettingsInput,
) -> Result<DeviceSettingsWriteResult, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info(&api)
        .ok_or_else(|| "BIGBIG WON config interface not found".to_string())?;
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
    write_report(&device, &polling_report)?;
    let step_accuracy_report = protocol::build_set_step_accuracy_report(step_accuracy);
    write_report(&device, &step_accuracy_report)?;
    Ok(DeviceSettingsWriteResult {
        device: device_summary,
        settings: DeviceSettingsSummary {
            polling_rate: input.polling_rate,
            step_accuracy: step_accuracy_summary(step_accuracy),
        },
        polling_command: spaced_hex(&protocol::wire_bytes(&polling_report)),
        step_accuracy_command: spaced_hex(&protocol::wire_bytes(&step_accuracy_report)),
    })
}

fn read_profile() -> Result<(DeviceSummary, Vec<u8>), String> {
    read_profile_once()
}

fn read_profile_once() -> Result<(DeviceSummary, Vec<u8>), String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info(&api)
        .ok_or_else(|| "BIGBIG WON config interface not found".to_string())?;
    let summary = summary(info);
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    write_report(&device, &protocol::get_base_profile_report())?;

    let mut profile = Vec::with_capacity(protocol::V37_PROFILE_LENGTH);
    for expected_sequence in 1..=16_u8 {
        let mut report = [0_u8; protocol::HID_REPORT_LENGTH];
        let read = device
            .read_timeout(&mut report, 2_000)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            let received_fragments = expected_sequence - 1;
            let received_bytes = profile.len();
            drop(device);
            return Err(diagnose_profile_read_timeout(
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

        if let Some(length) = protocol::declared_profile_length(&profile) {
            if profile.len() >= length {
                profile.truncate(length);
                return Ok((summary, profile));
            }
        }
    }
    Err("profile did not complete within 16 reports".into())
}

fn diagnose_profile_read_timeout(received_fragments: u8, received_bytes: usize) -> String {
    match read_profile_size() {
        Ok(size) => format!(
            "GetBaseProfile (D6) did not complete after {received_fragments} fragments ({received_bytes} bytes), but GetProfileSize (D3) reports {size} bytes. The short command path is alive; D6 firmware state and host transfer/reassembly state are not yet distinguishable. Stop retrying D6. A HOME-button reset recovered this state in testing, but also restored the observed profile to defaults; use it only if losing current settings is acceptable."
        ),
        Err(error) => format!(
            "GetBaseProfile (D6) did not complete after {received_fragments} fragments ({received_bytes} bytes), and the D3 health probe also failed ({error}). The interface or host path may be unavailable; do not classify this as a firmware-only D6 failure. Stop retrying. A HOME-button reset recovered this state in testing, but also restored the observed profile to defaults; use it only if losing current settings is acceptable."
        ),
    }
}

fn read_profile_size() -> Result<usize, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    let info = find_config_info(&api)
        .ok_or_else(|| "BIGBIG WON config interface not found".to_string())?;
    let device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    write_report(&device, &protocol::get_profile_size_report())?;

    let mut report = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = device
        .read_timeout(&mut report, 500)
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
    let info = find_config_info(&api)
        .ok_or_else(|| "BIGBIG WON config interface not found".to_string())?;
    let device_summary = summary(info);
    if device_summary.path != expected_device_path {
        return Err("the connected controller changed; read its profile before saving".into());
    }
    let hid_device = api
        .open_path(info.path())
        .map_err(|error| error.to_string())?;
    for report in protocol::build_v37_write_reports(profile)? {
        write_report(&hid_device, &report)?;
    }

    let mut ack = [0_u8; protocol::HID_REPORT_LENGTH];
    let read = hid_device
        .read_timeout(&mut ack, 2_000)
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
        .read_timeout(&mut response, 1_000)
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

fn settings_summary(profile: &[u8]) -> Result<ControllerSettingsSummary, String> {
    let settings = protocol::controller_settings(profile)?;
    Ok(ControllerSettingsSummary {
        rectangle_algorithm: settings.rectangle_algorithm,
        left_stick: CurveSettingsSummary {
            center: settings.left_curve.center,
            point1_x: settings.left_curve.point1_x,
            point1_y: settings.left_curve.point1_y,
            point2_x: settings.left_curve.point2_x,
            point2_y: settings.left_curve.point2_y,
            edge: settings.left_curve.edge,
            stabilization: settings.left_curve.stabilization,
        },
        right_stick: CurveSettingsSummary {
            center: settings.right_curve.center,
            point1_x: settings.right_curve.point1_x,
            point1_y: settings.right_curve.point1_y,
            point2_x: settings.right_curve.point2_x,
            point2_y: settings.right_curve.point2_y,
            edge: settings.right_curve.edge,
            stabilization: settings.right_curve.stabilization,
        },
        key_bindings: settings
            .key_bindings
            .into_iter()
            .map(|entry| entry.iter().map(|byte| format!("{byte:02X}")).collect())
            .collect(),
    })
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
        let compact = value
            .trim()
            .replace(' ', "")
            .replace(':', "")
            .replace('-', "");
        if compact.len() != 8 || !compact.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(format!(
                "key binding {} must contain exactly 8 hexadecimal digits",
                index + 1
            ));
        }
        for byte_index in 0..4 {
            let start = byte_index * 2;
            bindings[index][byte_index] = u8::from_str_radix(&compact[start..start + 2], 16)
                .map_err(|_| format!("invalid key binding {}", index + 1))?;
        }
    }
    Ok(bindings)
}

impl CurveSettingsInput {
    fn into_curve(self) -> protocol::CurveSettings {
        protocol::CurveSettings {
            center: self.center,
            point1_x: self.point1_x,
            point1_y: self.point1_y,
            point2_x: self.point2_x,
            point2_y: self.point2_y,
            edge: self.edge,
            stabilization: 0,
        }
    }
}

impl VibrationSettingsInput {
    fn into_settings(self) -> protocol::VibrationSettings {
        protocol::VibrationSettings {
            left: protocol::VibrationGrip {
                min: self.left.min,
                max: self.left.max,
            },
            right: protocol::VibrationGrip {
                min: self.right.min,
                max: self.right.max,
            },
        }
    }
}

fn find_config_info(api: &HidApi) -> Option<&hidapi::DeviceInfo> {
    api.device_list().find(|info| {
        info.vendor_id() == protocol::VENDOR_ID
            && info.product_id() == protocol::PRODUCT_ID
            && info.usage_page() == protocol::CONFIG_USAGE_PAGE
            && info.usage() == protocol::CONFIG_USAGE
    })
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
