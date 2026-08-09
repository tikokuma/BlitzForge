mod device;
mod protocol;

use std::sync::Mutex;

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
struct AppState {
    cached_profile: Mutex<Option<CachedProfile>>,
}

fn cached_device_path(state: &AppState) -> Result<String, String> {
    state
        .cached_profile
        .lock()
        .map_err(|_| "profile cache lock was poisoned".to_string())?
        .as_ref()
        .map(|cached| cached.device_path.clone())
        .ok_or_else(|| "read the profile before accessing the controller".to_string())
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
async fn read_device_settings(
    state: tauri::State<'_, AppState>,
    device_path: String,
) -> Result<DeviceSettingsSummary, String> {
    if cached_device_path(state.inner())? != device_path {
        return Err("the displayed controller changed; reload its profile before continuing".into());
    }
    tauri::async_runtime::spawn_blocking(move || device::read_device_settings(&device_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn set_device_settings(
    state: tauri::State<'_, AppState>,
    device_path: String,
    settings: DeviceSettingsInput,
) -> Result<DeviceSettingsWriteResult, String> {
    if cached_device_path(state.inner())? != device_path {
        return Err("the displayed controller changed; reload its profile before saving".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
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
    if cached_device_path(state.inner())? != device_path {
        return Err("the displayed controller changed; reload its profile before reading macros".into());
    }
    tauri::async_runtime::spawn_blocking(move || device::read_macros(&device_path))
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
    let cached_path = cached_device_path(state.inner())?;
    if cached_path != device_path {
        return Err("the displayed controller changed; reload its profile before writing".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        device::write_macro(&device_path, slot, raw_record)
    })
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn export_profile(path: String, data: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&path, &data).map_err(|error| format!("ファイルを書き出せませんでした: {error}"))
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
