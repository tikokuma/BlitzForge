mod device;
mod protocol;

use std::sync::{Arc, Mutex};

use device::{
    ControllerSettingsInput, ControllerSettingsWriteResult, DeviceSettingsInput,
    DeviceSettingsSummary, DeviceSettingsWriteResult, DeviceSummary, MacroSummary,
    MacroWriteResult, ProfileSummary, VibrationSettingsInput, VibrationWriteResult,
};

#[derive(Clone)]
struct CachedProfile {
    device_path: String,
    profile: Vec<u8>,
}

#[derive(Default)]
struct TransactionState {
    cached_profile: Option<CachedProfile>,
}

#[derive(Default)]
struct AppState {
    hid_transaction: Arc<Mutex<TransactionState>>,
}

fn cache_profile(state: &mut TransactionState, read: device::ProfileRead) -> ProfileSummary {
    let device::ProfileRead {
        summary,
        device_path,
        profile,
    } = read;
    state.cached_profile = Some(CachedProfile {
        device_path,
        profile,
    });
    summary
}

fn require_cached_profile(
    state: &TransactionState,
    message: &str,
) -> Result<CachedProfile, String> {
    state
        .cached_profile
        .clone()
        .ok_or_else(|| message.to_string())
}

#[tauri::command]
async fn scan_device(state: tauri::State<'_, AppState>) -> Result<Option<DeviceSummary>, String> {
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
async fn read_profile(state: tauri::State<'_, AppState>) -> Result<ProfileSummary, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let read = device::read_profile_summary()?;
        Ok(cache_profile(&mut transaction, read))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn load_profile(
    state: tauri::State<'_, AppState>,
    profile: Vec<u8>,
) -> Result<ProfileSummary, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let read = device::load_profile_summary(profile)?;
        Ok(cache_profile(&mut transaction, read))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn apply_profile(
    state: tauri::State<'_, AppState>,
    profile: Vec<u8>,
) -> Result<ProfileSummary, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached =
            require_cached_profile(&transaction, "load or read a profile before applying it")?;
        let read = device::apply_profile(profile, cached.device_path)?;
        Ok(cache_profile(&mut transaction, read))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_vibration(
    state: tauri::State<'_, AppState>,
    settings: VibrationSettingsInput,
) -> Result<VibrationWriteResult, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached = require_cached_profile(&transaction, "read the profile before saving")?;
        let device_path = cached.device_path.clone();
        let (result, profile) =
            device::set_vibration(cached.profile, cached.device_path, settings)?;
        transaction.cached_profile = Some(CachedProfile {
            device_path,
            profile,
        });
        Ok(result)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_controller_settings(
    state: tauri::State<'_, AppState>,
    settings: ControllerSettingsInput,
) -> Result<ControllerSettingsWriteResult, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached = require_cached_profile(&transaction, "read the profile before saving")?;
        let device_path = cached.device_path.clone();
        let (result, profile) =
            device::set_controller_settings(cached.profile, cached.device_path, settings)?;
        transaction.cached_profile = Some(CachedProfile {
            device_path,
            profile,
        });
        Ok(result)
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
        let transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached = require_cached_profile(
            &transaction,
            "read the profile before accessing the controller",
        )?;
        if cached.device_path != device_path {
            return Err(
                "the displayed controller changed; reload its profile before continuing".into(),
            );
        }
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
) -> Result<DeviceSettingsWriteResult, String> {
    let hid_transaction = state.hid_transaction.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached = require_cached_profile(
            &transaction,
            "read the profile before accessing the controller",
        )?;
        if cached.device_path != device_path {
            return Err(
                "the displayed controller changed; reload its profile before saving".into(),
            );
        }
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
        let transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached = require_cached_profile(
            &transaction,
            "read the profile before accessing the controller",
        )?;
        if cached.device_path != device_path {
            return Err(
                "the displayed controller changed; reload its profile before reading macros".into(),
            );
        }
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
        let transaction = hid_transaction
            .lock()
            .map_err(|_| "HID transaction lock was poisoned".to_string())?;
        let cached = require_cached_profile(
            &transaction,
            "read the profile before accessing the controller",
        )?;
        if cached.device_path != device_path {
            return Err(
                "the displayed controller changed; reload its profile before writing".into(),
            );
        }
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
            read_profile,
            load_profile,
            apply_profile,
            set_vibration,
            set_controller_settings,
            read_device_settings,
            set_device_settings,
            read_macros,
            write_macro,
            export_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
