mod device;
mod protocol;

use std::sync::Mutex;

use device::{DeviceSummary, ProfileSummary, VibrationWriteResult};

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
async fn set_vibration(
    state: tauri::State<'_, AppState>,
    left: u8,
    right: u8,
) -> Result<VibrationWriteResult, String> {
    let cached = state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())?
        .clone()
        .ok_or_else(|| "read the profile before saving".to_string())?;
    let device_path = cached.device_path.clone();
    let (result, profile) = tauri::async_runtime::spawn_blocking(move || {
        device::set_vibration(cached.profile, cached.device_path, left, right)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_device,
            read_profile,
            set_vibration
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
