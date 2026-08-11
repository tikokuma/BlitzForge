#![allow(linker_messages)]

mod device;
mod profiles;
mod protocol;
mod share;

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use device::{
    ControllerSettingsInput, DeviceSession, DeviceSettingsInput, DeviceSettingsSummary,
    DeviceSettingsWriteResult, MacroSummary, MacroWriteResult, ProfileSummary,
    VibrationSettingsInput,
};

#[derive(Default)]
struct AppState {
    hid_transaction: Arc<Mutex<()>>,
    profile_store: Arc<Mutex<profiles::ProfileStoreState>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileListQuery {
    device_uuid: Option<String>,
    active_profile: Option<Vec<u8>>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CommitMode {
    Save,
    SaveAndApply,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MacroCommitInput {
    slot: u8,
    raw_record: Vec<u8>,
    original_record: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitProfileInput {
    profile: profiles::SaveProfileInput,
    #[serde(default)]
    controller_settings: Option<ControllerSettingsInput>,
    #[serde(default)]
    vibration: Option<VibrationSettingsInput>,
    #[serde(rename = "macro", default)]
    macro_write: Option<MacroCommitInput>,
    device_path: Option<String>,
    device_uuid: Option<String>,
    #[serde(default)]
    device_settings: Option<DeviceSettingsInput>,
    #[serde(default)]
    device_settings_baseline: Option<DeviceSettingsInput>,
    mode: CommitMode,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommitResult {
    profile_requested: bool,
    profile_saved: bool,
    macro_requested: bool,
    macro_saved: bool,
    apply_requested: bool,
    profile_applied: bool,
    device_settings_requested: bool,
    device_settings_saved: bool,
    warnings: Vec<String>,
    profile: Option<ProfileDocumentView>,
    #[serde(rename = "macro")]
    macro_result: Option<MacroWriteResult>,
    applied_profile: Option<ProfileSummary>,
    device_settings: Option<DeviceSettingsWriteResult>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommitPreview {
    profile_requested: bool,
    macro_requested: bool,
    apply_eligible: bool,
    device_settings_requested: bool,
    changes: Vec<device::SettingChange>,
    warnings: Vec<String>,
    apply_unavailable_reason: Option<String>,
}

struct PreparedCommit {
    candidate: Vec<u8>,
    profile_requested: bool,
    macro_requested: bool,
    macro_write: Option<MacroCommitInput>,
    apply_eligible: bool,
    apply_requested: bool,
    device_settings_requested: bool,
    device_settings: Option<DeviceSettingsInput>,
    device_path: Option<String>,
    changes: Vec<device::SettingChange>,
    warnings: Vec<String>,
    apply_unavailable_reason: Option<String>,
}

async fn run_locked<State, Output, Operation>(
    state: Arc<Mutex<State>>,
    lock_name: &'static str,
    operation: Operation,
) -> Result<Output, String>
where
    State: Send + 'static,
    Output: Send + 'static,
    Operation: FnOnce(&mut State) -> Result<Output, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = state
            .lock()
            .map_err(|_| format!("{lock_name} lock was poisoned"))?;
        operation(&mut state)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileDocumentView {
    id: Option<i64>,
    phone_uuid: String,
    name: String,
    device_uuid: String,
    device_name: String,
    firmware_version: String,
    zkm_version: String,
    created_at: String,
    saved: bool,
    supported: bool,
    incompatibility_reason: Option<String>,
    snapshot: Option<profiles::ProfileSnapshot>,
    #[serde(flatten)]
    summary: ProfileSummary,
}

fn saved_profile_view(
    document: profiles::ProfileDocument,
    device: Option<device::DeviceSummary>,
) -> Result<ProfileDocumentView, String> {
    let summary = device::build_profile_summary(document.raw_profile, device)?;
    Ok(ProfileDocumentView {
        id: Some(document.id),
        phone_uuid: document.phone_uuid,
        name: document.name,
        device_uuid: document.device_uuid,
        device_name: document.device_name,
        firmware_version: document.firmware_version,
        zkm_version: document.zkm_version,
        created_at: document.created_at,
        saved: true,
        supported: true,
        incompatibility_reason: None,
        snapshot: Some(document.snapshot),
        summary,
    })
}

fn transient_profile_view(
    summary: ProfileSummary,
    name: &str,
    phone_uuid: String,
    device_uuid: String,
    device_name: String,
    firmware_version: String,
    zkm_version: String,
) -> ProfileDocumentView {
    ProfileDocumentView {
        id: None,
        phone_uuid,
        name: name.to_string(),
        device_uuid,
        device_name,
        firmware_version,
        zkm_version,
        created_at: String::new(),
        saved: false,
        supported: true,
        incompatibility_reason: None,
        snapshot: None,
        summary,
    }
}

#[tauri::command]
async fn scan_device(state: tauri::State<'_, AppState>) -> Result<Option<DeviceSession>, String> {
    run_locked(state.hid_transaction.clone(), "HID transaction", |_| {
        device::scan_device()
    })
    .await
}

#[tauri::command]
async fn list_profiles(
    state: tauri::State<'_, AppState>,
    query: ProfileListQuery,
) -> Result<Vec<profiles::ProfileListEntry>, String> {
    run_locked(state.profile_store.clone(), "profile store", move |_| {
        let mut entries = profiles::list_profiles()?;
        let Some(active_profile) = query.active_profile else {
            return Ok(entries);
        };
        let Some(active_profile) = protocol::normalize_v37_profile(&active_profile).ok() else {
            return Ok(entries);
        };
        for entry in &mut entries {
            entry.active = same_device_uuid(
                &entry.device_uuid,
                query.device_uuid.as_deref().unwrap_or_default(),
            ) && entry.normalized_profile.as_deref()
                == Some(active_profile.as_slice());
        }
        Ok(entries)
    })
    .await
}

#[tauri::command]
async fn load_saved_profile(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<ProfileDocumentView, String> {
    run_locked(state.profile_store.clone(), "profile store", move |_| {
        saved_profile_view(profiles::load_saved_profile(id)?, None)
    })
    .await
}

#[tauri::command]
async fn save_profile(
    state: tauri::State<'_, AppState>,
    input: profiles::SaveProfileInput,
) -> Result<ProfileDocumentView, String> {
    run_locked(state.profile_store.clone(), "profile store", move |store| {
        saved_profile_view(profiles::save_profile(store, input)?, None)
    })
    .await
}

#[tauri::command]
async fn commit_profile(
    state: tauri::State<'_, AppState>,
    input: CommitProfileInput,
) -> Result<CommitResult, String> {
    let profile_store = state.profile_store.clone();
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        commit_profile_blocking(profile_store, hid_transaction, input)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn preview_profile_commit(input: CommitProfileInput) -> Result<CommitPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut input = input;
        let prepared = prepare_commit(&mut input)?;
        Ok(CommitPreview {
            profile_requested: prepared.profile_requested,
            macro_requested: prepared.macro_requested,
            apply_eligible: prepared.apply_eligible,
            device_settings_requested: prepared.device_settings_requested,
            changes: prepared.changes,
            warnings: prepared.warnings,
            apply_unavailable_reason: prepared.apply_unavailable_reason,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn commit_profile_blocking(
    profile_store: Arc<Mutex<profiles::ProfileStoreState>>,
    hid_transaction: Arc<Mutex<()>>,
    mut input: CommitProfileInput,
) -> Result<CommitResult, String> {
    let PreparedCommit {
        candidate,
        profile_requested,
        macro_requested,
        macro_write,
        apply_requested,
        device_settings_requested,
        device_settings,
        device_path,
        mut warnings,
        ..
    } = prepare_commit(&mut input)?;
    let saved_document = if profile_requested {
        let mut store = profile_store
            .lock()
            .map_err(|_| "profile store lock was poisoned".to_string())?;
        Some(profiles::save_profile(&mut store, input.profile)?)
    } else {
        None
    };
    let profile_saved = saved_document.is_some();
    let profile = match saved_document {
        Some(document) => match saved_profile_view(document, None) {
            Ok(view) => Some(view),
            Err(error) => {
                warnings.push(format!(
                    "保存済みプロフィールの再構築に失敗しました: {error}"
                ));
                None
            }
        },
        None => None,
    };

    let needs_hid = macro_requested || apply_requested || device_settings_requested;
    let _hid_guard = if needs_hid {
        Some(
            hid_transaction
                .lock()
                .map_err(|_| "HID transaction lock was poisoned".to_string())?,
        )
    } else {
        None
    };

    let mut macro_saved = false;
    let mut macro_result = None;
    if macro_requested && let Some(macro_input) = macro_write {
        if let Some(path) = device_path.as_deref() {
            match device::write_macro(path, macro_input.slot, macro_input.raw_record) {
                Ok(result) => {
                    macro_saved = true;
                    macro_result = Some(result);
                }
                Err(error) => warnings.push(format!("マクロ保存に失敗しました: {error}")),
            }
        } else {
            warnings
                .push("コントローラーが接続されていないため、マクロを保存できませんでした".into());
        }
    }

    let mut profile_applied = false;
    let mut applied_profile = None;
    if apply_requested && let Some(path) = device_path.as_deref() {
        match device::apply_profile(candidate, path) {
            Ok(result) => {
                profile_applied = true;
                applied_profile = Some(result.profile);
            }
            Err(error) => warnings.push(format!("コントローラーへの適用に失敗しました: {error}")),
        }
    }

    let mut device_settings_saved = false;
    let mut device_settings_result = None;
    if device_settings_requested && let Some(settings) = device_settings {
        if let Some(path) = device_path.as_deref() {
            match device::set_device_settings(path, settings) {
                Ok(result) => {
                    device_settings_saved = true;
                    device_settings_result = Some(result);
                }
                Err(error) => warnings.push(format!("デバイス設定保存に失敗しました: {error}")),
            }
        } else {
            warnings.push(
                "コントローラーが接続されていないため、デバイス設定を保存できませんでした".into(),
            );
        }
    }

    Ok(CommitResult {
        profile_requested,
        profile_saved,
        macro_requested,
        macro_saved,
        apply_requested,
        profile_applied,
        device_settings_requested,
        device_settings_saved,
        warnings,
        profile,
        macro_result,
        applied_profile,
        device_settings: device_settings_result,
    })
}

fn prepare_commit(input: &mut CommitProfileInput) -> Result<PreparedCommit, String> {
    let baseline = protocol::normalize_v37_profile(&input.profile.raw_profile)?;
    let mut candidate = baseline.clone();
    if let Some(settings) = input.controller_settings.take() {
        candidate = device::update_controller_settings(candidate, settings)?.raw_profile;
    }
    if let Some(settings) = input.vibration.take() {
        candidate = device::update_vibration(candidate, settings)?.raw_profile;
    }

    let profile_name_changed = input
        .profile
        .snapshot
        .as_ref()
        .map(|snapshot| snapshot.name != input.profile.name)
        .unwrap_or(true);
    let profile_requested =
        input.profile.id.is_none() || profile_name_changed || candidate != baseline;

    let macro_write = input.macro_write.take();
    let macro_requested = match macro_write.as_ref() {
        Some(macro_input) => {
            let original = protocol::normalize_macro_record(&macro_input.original_record)?;
            let draft = protocol::normalize_macro_record(&macro_input.raw_record)?;
            original != draft
        }
        None => false,
    };

    let device_settings = input.device_settings.take();
    let device_settings_requested = match (
        input.device_settings_baseline.as_ref(),
        device_settings.as_ref(),
    ) {
        (Some(baseline), Some(candidate)) => baseline != candidate,
        (None, Some(_)) => true,
        _ => false,
    };
    if device_settings_requested && let Some(candidate) = device_settings.as_ref() {
        device::validate_device_settings(candidate)?;
    }

    let has_changes = profile_requested || macro_requested || device_settings_requested;
    let device_path = input
        .device_path
        .clone()
        .filter(|path| !path.trim().is_empty());
    let profile_uuid = input.profile.device_uuid.clone();
    let device_uuid = input.device_uuid.as_deref().unwrap_or_default();
    let apply_eligible =
        has_changes && device_path.is_some() && device_uuid_matches(&profile_uuid, device_uuid);
    let apply_requested = matches!(input.mode, CommitMode::SaveAndApply) && apply_eligible;
    let apply_unavailable_reason = if apply_eligible {
        None
    } else {
        apply_unavailable_reason(
            has_changes,
            device_path.as_deref(),
            &profile_uuid,
            device_uuid,
        )
    };
    let mut warnings = Vec::new();
    if matches!(input.mode, CommitMode::SaveAndApply) && !apply_requested {
        warnings.push(
            apply_unavailable_reason
                .clone()
                .unwrap_or_else(|| "適用できる変更がありません".to_string()),
        );
    }

    let mut changes = if candidate == baseline {
        Vec::new()
    } else {
        device::profile_changes(&baseline, &candidate)?
    };
    if input.profile.id.is_none() {
        changes.insert(
            0,
            device::SettingChange {
                label: "プロフィール".into(),
                before: "未保存".into(),
                after: "保存".into(),
            },
        );
    } else if profile_name_changed {
        changes.insert(
            0,
            device::SettingChange {
                label: "プロフィール名".into(),
                before: input
                    .profile
                    .snapshot
                    .as_ref()
                    .map(|snapshot| snapshot.name.clone())
                    .unwrap_or_else(|| "不明".into()),
                after: input.profile.name.clone(),
            },
        );
    }
    if macro_requested {
        changes.push(device::SettingChange {
            label: "マクロ / 編集内容".into(),
            before: "保存済み".into(),
            after: "変更あり".into(),
        });
    }
    if device_settings_requested {
        if let (Some(baseline), Some(candidate)) = (
            input.device_settings_baseline.as_ref(),
            device_settings.as_ref(),
        ) {
            changes.extend(device::device_settings_changes(baseline, candidate));
        } else {
            changes.push(device::SettingChange {
                label: "デバイス設定".into(),
                before: "不明".into(),
                after: "変更あり".into(),
            });
        }
    }

    input.profile.raw_profile = candidate.clone();
    Ok(PreparedCommit {
        candidate,
        profile_requested,
        macro_requested,
        macro_write,
        apply_eligible,
        apply_requested,
        device_settings_requested,
        device_settings,
        device_path,
        changes,
        warnings,
        apply_unavailable_reason,
    })
}

fn apply_unavailable_reason(
    has_changes: bool,
    device_path: Option<&str>,
    profile_uuid: &str,
    device_uuid: &str,
) -> Option<String> {
    if !has_changes {
        return Some("変更がないため、適用できる内容がありません。".into());
    }
    if device_path.is_none() {
        return Some("コントローラーが接続されていないため、保存のみを利用できます。".into());
    }
    if !device_uuid_matches(profile_uuid, device_uuid) {
        return Some(
            "接続中のコントローラーとプロファイルの対象が異なるため、保存のみを利用できます。"
                .into(),
        );
    }
    None
}

fn device_uuid_matches(profile_uuid: &str, device_uuid: &str) -> bool {
    if profile_uuid.trim().is_empty() {
        return true;
    }
    normalize_device_uuid(profile_uuid)
        .zip(normalize_device_uuid(device_uuid))
        .is_some_and(|(left, right)| left == right)
}

fn same_device_uuid(left: &str, right: &str) -> bool {
    normalize_device_uuid(left)
        .zip(normalize_device_uuid(right))
        .is_some_and(|(left, right)| left == right)
}

fn normalize_device_uuid(value: &str) -> Option<String> {
    let compact: String = value
        .chars()
        .filter(|character| !character.is_whitespace() && !matches!(character, ':' | '_' | '-'))
        .collect();
    (compact.len() == 16
        && compact
            .chars()
            .all(|character| character.is_ascii_hexdigit()))
    .then(|| compact.to_ascii_uppercase())
}

#[tauri::command]
async fn delete_profile(
    state: tauri::State<'_, AppState>,
    input: profiles::DeleteProfileInput,
) -> Result<(), String> {
    run_locked(state.profile_store.clone(), "profile store", move |store| {
        profiles::delete_profile(store, input)
    })
    .await
}

#[tauri::command]
async fn read_profile(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<ProfileDocumentView, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| {
            let summary = device::read_profile_summary(&device_path)?;
            Ok(transient_profile_view(
                summary,
                "実機から読み込んだプロファイル",
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
            ))
        },
    )
    .await
}

#[tauri::command]
async fn import_share_profile(
    share_code: String,
    device_uuid: String,
) -> Result<ProfileDocumentView, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let imported = share::import_share_code(share_code, device_uuid)?;
        let raw_profile: Vec<u8> = serde_json::from_str(&imported.config_json)
            .map_err(|error| format!("Shareコードのプロファイルデータが不正です: {error}"))?;
        let summary = device::load_profile_summary(raw_profile)?;
        let name = if imported.name.trim().is_empty() {
            "Shareから読み込んだプロファイル"
        } else {
            &imported.name
        };
        Ok(transient_profile_view(
            summary,
            name,
            imported.phone_uuid,
            imported.device_uuid,
            imported.device_name,
            imported.firmware_version,
            imported.zkm_version,
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn create_share_code(
    name: String,
    profile: Vec<u8>,
    phone_uuid: String,
    device_uuid: String,
    device_name: String,
    firmware_version: String,
    zkm_version: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let raw_profile = protocol::normalize_v37_profile(&profile)?;
        let config_json = serde_json::to_string(&raw_profile)
            .map_err(|error| format!("プロファイルをShare形式へ変換できませんでした: {error}"))?;
        share::create_share_code(share::ShareProfile {
            name,
            phone_uuid,
            device_uuid,
            device_name,
            firmware_version,
            zkm_version,
            config_json,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn new_profile() -> Result<ProfileDocumentView, String> {
    let summary = device::load_profile_summary(protocol::new_v37_profile())?;
    Ok(transient_profile_view(
        summary,
        "新しいプロファイル",
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
    ))
}

#[tauri::command]
async fn apply_profile(
    state: tauri::State<'_, AppState>,
    profile: Vec<u8>,
    device_path: String,
) -> Result<device::ApplyProfileResult, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| device::apply_profile(profile, &device_path),
    )
    .await
}

#[tauri::command]
async fn read_device_settings(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<DeviceSettingsSummary, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| device::read_device_settings(&device_path),
    )
    .await
}

#[tauri::command]
async fn measure_polling_rate(
    state: tauri::State<'_, AppState>,
    device_path: String,
    duration_ms: u64,
) -> Result<device::PollingMeasurement, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| device::measure_polling_rate(&device_path, duration_ms),
    )
    .await
}

#[tauri::command]
async fn read_macros(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<MacroSummary, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| device::read_macros(&device_path),
    )
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_device,
            list_profiles,
            load_saved_profile,
            save_profile,
            commit_profile,
            preview_profile_commit,
            delete_profile,
            read_profile,
            import_share_profile,
            create_share_code,
            new_profile,
            apply_profile,
            read_device_settings,
            measure_polling_rate,
            read_macros
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
