mod device;
mod profiles;
mod protocol;

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
    zkm_version: String,
) -> ProfileDocumentView {
    ProfileDocumentView {
        id: None,
        name: name.to_string(),
        device_uuid,
        device_name,
        firmware_version: String::new(),
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
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        device::scan_device()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn list_profiles(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<profiles::ProfileListEntry>, String> {
    let profile_store = state.profile_store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _store = profile_store
            .lock()
            .map_err(|_| "profile store lock was poisoned".to_string())?;
        profiles::list_profiles()
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn load_saved_profile(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<ProfileDocumentView, String> {
    let profile_store = state.profile_store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _store = profile_store
            .lock()
            .map_err(|_| "profile store lock was poisoned".to_string())?;
        saved_profile_view(profiles::load_saved_profile(id)?, None)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn save_profile(
    state: tauri::State<'_, AppState>,
    input: profiles::SaveProfileInput,
) -> Result<ProfileDocumentView, String> {
    let profile_store = state.profile_store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = profile_store
            .lock()
            .map_err(|_| "profile store lock was poisoned".to_string())?;
        saved_profile_view(profiles::save_profile(&mut store, input)?, None)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn delete_profile(
    state: tauri::State<'_, AppState>,
    input: profiles::DeleteProfileInput,
) -> Result<(), String> {
    let profile_store = state.profile_store.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = profile_store
            .lock()
            .map_err(|_| "profile store lock was poisoned".to_string())?;
        profiles::delete_profile(&mut store, input)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_profile(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<ProfileDocumentView, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let summary = device::read_profile_summary(&device_path)?;
        Ok(transient_profile_view(
            summary,
            "実機から読み込んだプロファイル",
            String::new(),
            String::new(),
            String::new(),
        ))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn load_profile(profile: Vec<u8>) -> Result<ProfileDocumentView, String> {
    let summary = device::load_profile_summary(profile)?;
    Ok(transient_profile_view(
        summary,
        "インポートしたプロファイル",
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
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        device::apply_profile(profile, &device_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_device_settings(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<DeviceSettingsSummary, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        device::read_device_settings(&device_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_device_settings(
    state: tauri::State<'_, AppState>,
    device_path: String,
    settings: DeviceSettingsInput,
) -> Result<device::DeviceSettingsWriteResult, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        device::set_device_settings(&device_path, settings)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_macros(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<MacroSummary, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        device::read_macros(&device_path)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn write_macro(
    state: tauri::State<'_, AppState>,
    device_path: String,
    slot: u8,
    raw_record: Vec<u8>,
) -> Result<MacroWriteResult, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        device::write_macro(&device_path, slot, raw_record)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn export_profile(path: String, data: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&path, &data)
            .map_err(|error| format!("ファイルを書き出せませんでした: {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_device,
            list_profiles,
            load_saved_profile,
            save_profile,
            delete_profile,
            read_profile,
            load_profile,
            update_vibration,
            update_controller_settings,
            apply_profile,
            read_device_settings,
            set_device_settings,
            read_macros,
            write_macro,
            export_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
