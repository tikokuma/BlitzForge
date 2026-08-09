mod device;
mod profiles;
mod protocol;
mod share;

use std::sync::{Arc, Mutex};

use device::{
    ControllerSettingsInput, DeviceSession, DeviceSettingsInput, DeviceSettingsSummary,
    MacroSummary, MacroWriteResult, ProfileSummary, VibrationSettingsInput,
};

#[derive(Default)]
struct AppState {
    hid_transaction: Arc<Mutex<()>>,
    profile_store: Arc<Mutex<profiles::ProfileStoreState>>,
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
    device_uuid: String,
    device_name: String,
    firmware_version: String,
    zkm_version: String,
) -> ProfileDocumentView {
    ProfileDocumentView {
        id: None,
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
) -> Result<Vec<profiles::ProfileListEntry>, String> {
    run_locked(state.profile_store.clone(), "profile store", |_| {
        profiles::list_profiles()
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
    ))
}

#[tauri::command]
async fn update_vibration(
    profile: Vec<u8>,
    settings: VibrationSettingsInput,
) -> Result<ProfileSummary, String> {
    device::update_vibration(profile, settings)
}

#[tauri::command]
async fn update_controller_settings(
    profile: Vec<u8>,
    settings: ControllerSettingsInput,
) -> Result<ProfileSummary, String> {
    device::update_controller_settings(profile, settings)
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
async fn set_device_settings(
    state: tauri::State<'_, AppState>,
    device_path: String,
    settings: DeviceSettingsInput,
) -> Result<device::DeviceSettingsWriteResult, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| device::set_device_settings(&device_path, settings),
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

#[tauri::command]
async fn write_macro(
    state: tauri::State<'_, AppState>,
    device_path: String,
    slot: u8,
    raw_record: Vec<u8>,
) -> Result<MacroWriteResult, String> {
    run_locked(
        state.hid_transaction.clone(),
        "HID transaction",
        move |_| device::write_macro(&device_path, slot, raw_record),
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
            delete_profile,
            read_profile,
            import_share_profile,
            create_share_code,
            new_profile,
            update_vibration,
            update_controller_settings,
            apply_profile,
            read_device_settings,
            set_device_settings,
            read_macros,
            write_macro
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
