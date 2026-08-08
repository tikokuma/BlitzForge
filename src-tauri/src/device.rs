use hidapi::{HidApi, HidDevice};
use serde::Serialize;

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
    left_vibration: u8,
    right_vibration: u8,
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
    left: u8,
    right: u8,
    crc: String,
    ack: String,
    ack_value: u8,
}

pub fn scan_device() -> Result<Option<DeviceSummary>, String> {
    let api = HidApi::new().map_err(|error| error.to_string())?;
    Ok(find_config_info(&api).map(summary))
}

pub fn read_profile_summary() -> Result<ProfileRead, String> {
    let (device, profile) = read_profile()?;
    let stored_crc = protocol::stored_profile_crc(&profile)?;
    let computed_crc = protocol::profile_crc(&profile)?;
    let (left_vibration, right_vibration) = protocol::vibration_levels(&profile)?;
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
            left_vibration,
            right_vibration,
        },
        device_path,
        profile,
    })
}

pub fn set_vibration(
    mut profile: Vec<u8>,
    device_path: String,
    left: u8,
    right: u8,
) -> Result<(VibrationWriteResult, Vec<u8>), String> {
    let stored_crc = protocol::stored_profile_crc(&profile)?;
    let computed_crc = protocol::profile_crc(&profile)?;
    if stored_crc != computed_crc {
        return Err(format!(
            "refusing write: stored CRC {stored_crc:04X}, computed {computed_crc:04X}"
        ));
    }

    let crc = protocol::set_vibration_levels(&mut profile, left, right)?;
    let (device, ack, ack_value) = write_profile(&profile, &device_path)?;

    Ok((
        VibrationWriteResult {
            device,
            left,
            right,
            crc: format!("{crc:04X}"),
            ack: spaced_hex(&ack),
            ack_value,
        },
        profile,
    ))
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
            return Err(diagnose_profile_read_timeout());
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

fn diagnose_profile_read_timeout() -> String {
    match read_profile_size() {
        Ok(size) => format!(
            "GetBaseProfile (D6) did not respond, but GetProfileSize (D3) reports {size} bytes. The config interface is alive and the controller's large-transfer path is unavailable. Stop retrying D6. A HOME-button reset recovered this state in testing, but also restored the observed profile to defaults; use it only if losing current settings is acceptable."
        ),
        Err(error) => format!(
            "GetBaseProfile (D6) did not respond, and the D3 health probe also failed ({error}). Stop retrying. A HOME-button reset recovered this state in testing, but also restored the observed profile to defaults; use it only if losing current settings is acceptable."
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
