pub const VENDOR_ID: u16 = 0x413d;
pub const PRODUCT_ID: u16 = 0x2104;
pub const CONFIG_USAGE_PAGE: u16 = 0xff7a;
pub const CONFIG_USAGE: u16 = 0x0001;
pub const HID_REPORT_LENGTH: usize = 65;
pub const V37_PROFILE_LENGTH: usize = 484;
pub const V37_LEFT_VIBRATION_OFFSET: usize = 0x14c;
pub const V37_RIGHT_VIBRATION_OFFSET: usize = 0x14d;

const GET_BASE_PROFILE: [u8; 4] = [0xa5, 0x04, 0xd6, 0x7f];
const GET_PROFILE_SIZE: [u8; 4] = [0xa5, 0x04, 0xd3, 0x7c];

pub struct ReadFragment {
    pub sequence: u8,
    pub payload: Vec<u8>,
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

pub fn vibration_levels(profile: &[u8]) -> Result<(u8, u8), String> {
    if profile.len() != V37_PROFILE_LENGTH {
        return Err("expected a 484-byte v37 profile".into());
    }
    Ok((
        profile[V37_LEFT_VIBRATION_OFFSET],
        profile[V37_RIGHT_VIBRATION_OFFSET],
    ))
}

pub fn set_vibration_levels(profile: &mut [u8], left: u8, right: u8) -> Result<u16, String> {
    if profile.len() != V37_PROFILE_LENGTH
        || declared_profile_length(profile) != Some(V37_PROFILE_LENGTH)
    {
        return Err("expected a 484-byte v37 profile".into());
    }
    profile[V37_LEFT_VIBRATION_OFFSET] = left;
    profile[V37_RIGHT_VIBRATION_OFFSET] = right;
    let crc = profile_crc(profile)?;
    profile[..2].copy_from_slice(&crc.to_be_bytes());
    Ok(crc)
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

pub fn wire_bytes(report: &[u8]) -> &[u8] {
    if report.first() == Some(&0) {
        &report[1..]
    } else {
        report
    }
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
    fn updates_vibration_levels_and_crc() {
        let mut profile = profile();
        let original_crc = stored_profile_crc(&profile).unwrap();
        let crc = set_vibration_levels(&mut profile, 123, 45).unwrap();

        assert_eq!(vibration_levels(&profile), Ok((123, 45)));
        assert_eq!(stored_profile_crc(&profile), Ok(crc));
        assert_eq!(profile_crc(&profile), Ok(crc));
        assert_ne!(crc, original_crc);
    }
}
