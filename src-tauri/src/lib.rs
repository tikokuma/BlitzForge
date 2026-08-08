mod device;
mod protocol;

use std::sync::Mutex;

use device::{
    ControllerSettingsInput, ControllerSettingsWriteResult, DeviceSettingsInput,
    DeviceSettingsSummary, DeviceSettingsWriteResult, DeviceSummary, ProfileSummary,
    VibrationSettingsInput, VibrationWriteResult,
};

#[derive(Clone)]
struct CachedProfile {
    device_path: String,
    profile: Vec<u8>,
}

#[derive(Default)]
struct AppState {
    cached_profile: Mutex<Option<CachedProfile>>,
}

#[tauri::command]
async fn scan_device() -> Result<Option<DeviceSummary>, String> {
    tauri::async_runtime::spawn_blocking(device::scan_device)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn read_profile(state: tauri::State<'_, AppState>) -> Result<ProfileSummary, String> {
    let read = tauri::async_runtime::spawn_blocking(device::read_profile_summary)
        .await
        .map_err(|error| error.to_string())??;
    let device::ProfileRead {
        summary,
        device_path,
        profile,
    } = read;
    *state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())? = Some(CachedProfile {
        device_path,
        profile,
    });
    Ok(summary)
}

#[tauri::command]
async fn load_profile(
    state: tauri::State<'_, AppState>,
    profile: Vec<u8>,
) -> Result<ProfileSummary, String> {
    let read = tauri::async_runtime::spawn_blocking(move || device::load_profile_summary(profile))
        .await
        .map_err(|error| error.to_string())??;
    let device::ProfileRead {
        summary,
        device_path,
        profile,
    } = read;
    *state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())? = Some(CachedProfile {
        device_path,
        profile,
    });
    Ok(summary)
}

#[tauri::command]
async fn apply_profile(
    state: tauri::State<'_, AppState>,
    profile: Vec<u8>,
) -> Result<ProfileSummary, String> {
    let cached = state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())?
        .clone()
        .ok_or_else(|| "load or read a profile before applying it".to_string())?;
    let device_path = cached.device_path.clone();
    let read =
        tauri::async_runtime::spawn_blocking(move || device::apply_profile(profile, device_path))
            .await
            .map_err(|error| error.to_string())??;
    let device::ProfileRead {
        summary,
        device_path,
        profile,
    } = read;
    *state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())? = Some(CachedProfile {
        device_path,
        profile,
    });
    Ok(summary)
}

#[tauri::command]
async fn set_vibration(
    state: tauri::State<'_, AppState>,
    settings: VibrationSettingsInput,
) -> Result<VibrationWriteResult, String> {
    let cached = state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())?
        .clone()
        .ok_or_else(|| "read the profile before saving".to_string())?;
    let device_path = cached.device_path.clone();
    let (result, profile) = tauri::async_runtime::spawn_blocking(move || {
        device::set_vibration(cached.profile, cached.device_path, settings)
    })
    .await
    .map_err(|error| error.to_string())??;
    *state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())? = Some(CachedProfile {
        device_path,
        profile,
    });
    Ok(result)
}

#[tauri::command]
async fn set_controller_settings(
    state: tauri::State<'_, AppState>,
    settings: ControllerSettingsInput,
) -> Result<ControllerSettingsWriteResult, String> {
    let cached = state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())?
        .clone()
        .ok_or_else(|| "read the profile before saving".to_string())?;
    let device_path = cached.device_path.clone();
    let (result, profile) = tauri::async_runtime::spawn_blocking(move || {
        device::set_controller_settings(cached.profile, cached.device_path, settings)
    })
    .await
    .map_err(|error| error.to_string())??;
    *state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())? = Some(CachedProfile {
        device_path,
        profile,
    });
    Ok(result)
}

#[tauri::command]
async fn read_device_settings() -> Result<DeviceSettingsSummary, String> {
    tauri::async_runtime::spawn_blocking(device::read_device_settings)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_device_settings(
    settings: DeviceSettingsInput,
) -> Result<DeviceSettingsWriteResult, String> {
    tauri::async_runtime::spawn_blocking(move || device::set_device_settings(settings))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_device,
            read_profile,
            load_profile,
            apply_profile,
            set_vibration,
            set_controller_settings,
            read_device_settings,
            set_device_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
