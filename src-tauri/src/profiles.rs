use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, Row, backup::Backup, params};
use serde::{Deserialize, Serialize};

use crate::{device, protocol};

const DATABASE_DIRECTORY: &str = "GamepadAssistant";
const DATABASE_FILE: &str = "Config.db";
const BACKUP_DIRECTORY: &str = "io.blitzforge.desktop";
const TABLE_NAME: &str = "t_Config";
const REQUIRED_COLUMNS: [&str; 12] = [
    "FID",
    "FID_WebService",
    "FPhoneUUID_WebService",
    "FDevUUID",
    "FDevName",
    "FUserID_WebService",
    "FConfigName",
    "FConfigJson",
    "FFirmwareVersion",
    "FZKMVersion",
    "FDateTimeCreate",
    "FDeleted",
];

const CREATE_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS t_Config(
    FID INTEGER PRIMARY KEY ASC AUTOINCREMENT,
    FID_WebService INTEGER DEFAULT -1,
    FPhoneUUID_WebService TEXT COLLATE NOCASE DEFAULT '',
    FDevUUID TEXT COLLATE NOCASE DEFAULT '',
    FDevName TEXT COLLATE NOCASE DEFAULT '',
    FUserID_WebService INTEGER DEFAULT -1,
    FConfigName TEXT COLLATE NOCASE DEFAULT '',
    FConfigJson TEXT COLLATE NOCASE DEFAULT '',
    FFirmwareVersion TEXT COLLATE NOCASE DEFAULT '',
    FZKMVersion TEXT COLLATE NOCASE DEFAULT '',
    FDateTimeCreate TEXT COLLATE NOCASE DEFAULT(datetime('now', 'localtime')),
    FDeleted INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS Index_Unique_t_Config_FID_WebService
    ON t_Config(FID_WebService) WHERE FID_WebService != -1;
"#;

const SELECT_COLUMNS: &str = "FID, FID_WebService, FPhoneUUID_WebService, FDevUUID, FDevName, FUserID_WebService, FConfigName, FConfigJson, FFirmwareVersion, FZKMVersion, FDateTimeCreate, FDeleted";

#[derive(Default)]
pub struct ProfileStoreState {
    backup_created: bool,
    legacy_device_names_migrated: bool,
    database: Option<OpenDatabase>,
    cached_data_version: Option<i64>,
    cached_profiles: Vec<ProfileListEntry>,
    listed_snapshots: HashMap<u64, Arc<ProfileSnapshot>>,
    next_revision: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSnapshot {
    pub id: i64,
    pub phone_uuid: String,
    pub name: String,
    pub device_uuid: String,
    pub device_name: String,
    pub firmware_version: String,
    pub zkm_version: String,
    pub config_json: String,
    pub created_at: String,
    pub deleted: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileListEntry {
    pub id: i64,
    pub revision: u64,
    pub name: String,
    pub device_uuid: String,
    pub created_at: String,
    pub profile_version: Option<String>,
    pub active: bool,
    #[serde(skip)]
    snapshot: Arc<ProfileSnapshot>,
    #[serde(skip)]
    pub(crate) normalized_profile: Option<Arc<[u8]>>,
}

pub struct ProfileDocument {
    pub id: i64,
    pub phone_uuid: String,
    pub name: String,
    pub device_uuid: String,
    pub device_name: String,
    pub firmware_version: String,
    pub zkm_version: String,
    pub raw_profile: Vec<u8>,
    pub snapshot: ProfileSnapshot,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProfileInput {
    pub id: Option<i64>,
    #[serde(default)]
    pub phone_uuid: String,
    pub name: String,
    pub raw_profile: Vec<u8>,
    #[serde(default)]
    pub device_uuid: String,
    #[serde(default)]
    pub device_name: String,
    #[serde(default)]
    pub firmware_version: String,
    #[serde(default)]
    pub zkm_version: String,
    pub snapshot: Option<ProfileSnapshot>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteProfileInput {
    pub id: i64,
    pub revision: u64,
}

struct OpenDatabase {
    connection: Connection,
    writable: bool,
}

#[derive(Default)]
struct ProfileMetadata {
    phone_uuid: String,
    device_uuid: String,
    device_name: String,
    firmware_version: String,
    zkm_version: String,
}

impl ProfileMetadata {
    fn fill_empty(
        &mut self,
        phone_uuid: &str,
        device_uuid: &str,
        device_name: &str,
        firmware_version: &str,
        zkm_version: &str,
    ) {
        if self.phone_uuid.trim().is_empty() && !phone_uuid.trim().is_empty() {
            self.phone_uuid = phone_uuid.to_string();
        }
        if self.device_uuid.trim().is_empty() && !device_uuid.trim().is_empty() {
            self.device_uuid = device_uuid.to_string();
        }
        if self.device_name.trim().is_empty() && !device_name.trim().is_empty() {
            self.device_name = device_name.to_string();
        }
        if self.firmware_version.trim().is_empty() && !firmware_version.trim().is_empty() {
            self.firmware_version = firmware_version.to_string();
        }
        if self.zkm_version.trim().is_empty() && !zkm_version.trim().is_empty() {
            self.zkm_version = zkm_version.to_string();
        }
    }

    fn is_complete(&self) -> bool {
        !self.phone_uuid.trim().is_empty()
            && !self.device_uuid.trim().is_empty()
            && !self.device_name.trim().is_empty()
            && !self.firmware_version.trim().is_empty()
            && !self.zkm_version.trim().is_empty()
    }
}

pub fn database_path() -> Result<PathBuf, String> {
    let program_data = env::var_os("PROGRAMDATA")
        .ok_or_else(|| "Windows PROGRAMDATA is not available".to_string())?;
    Ok(PathBuf::from(program_data)
        .join(DATABASE_DIRECTORY)
        .join(DATABASE_FILE))
}

pub fn list_profiles(
    state: &mut ProfileStoreState,
    known_data_version: Option<i64>,
    force: bool,
) -> Result<(i64, Option<Vec<ProfileListEntry>>), String> {
    migrate_legacy_device_names(state, &database_path()?)?;
    let data_version = profile_data_version(profile_database(state)?)?;
    if !force && known_data_version == Some(data_version) {
        return Ok((data_version, None));
    }
    let mut entries = if state.cached_data_version == Some(data_version) {
        state.cached_profiles.clone()
    } else {
        let entries = list_profiles_from_database(profile_database(state)?)?;
        state.cached_data_version = Some(data_version);
        state.cached_profiles = entries.clone();
        entries
    };
    cache_listed_snapshots(state, &mut entries);
    Ok((data_version, Some(entries)))
}

pub fn load_saved_profile(
    state: &mut ProfileStoreState,
    id: i64,
) -> Result<ProfileDocument, String> {
    load_saved_profile_from_database(profile_database(state)?, id)
}

pub fn save_profile(
    state: &mut ProfileStoreState,
    input: SaveProfileInput,
) -> Result<ProfileDocument, String> {
    save_profile_at_path(state, &database_path()?, input)
}

pub fn delete_profile(
    state: &mut ProfileStoreState,
    input: DeleteProfileInput,
) -> Result<(), String> {
    delete_listed_profile_at_path(state, &database_path()?, input)
}

fn cache_listed_snapshots(state: &mut ProfileStoreState, entries: &mut [ProfileListEntry]) {
    state.listed_snapshots.clear();
    for entry in entries {
        state.next_revision = state.next_revision.wrapping_add(1).max(1);
        entry.revision = state.next_revision;
        state
            .listed_snapshots
            .insert(entry.revision, entry.snapshot.clone());
    }
}

fn list_profiles_from_database(database: &OpenDatabase) -> Result<Vec<ProfileListEntry>, String> {
    let mut statement = database
        .connection
        .prepare(&format!(
            "SELECT {SELECT_COLUMNS} FROM {TABLE_NAME} WHERE FDeleted = 0 ORDER BY FDateTimeCreate DESC, FID DESC"
        ))
        .map_err(sql_error)?;
    let rows = statement
        .query_map([], snapshot_from_row)
        .map_err(sql_error)?;
    rows.map(|row| {
        let snapshot = row.map_err(sql_error)?;
        Ok(list_entry(snapshot))
    })
    .collect()
}

fn profile_data_version(database: &OpenDatabase) -> Result<i64, String> {
    database
        .connection
        .query_row("PRAGMA data_version", [], |row| row.get(0))
        .map_err(sql_error)
}

fn load_saved_profile_from_database(
    database: &OpenDatabase,
    id: i64,
) -> Result<ProfileDocument, String> {
    let snapshot = snapshot_by_id(&database.connection, id)?
        .ok_or_else(|| format!("profile {id} was not found"))?;
    if snapshot.deleted != 0 {
        return Err(format!("profile {id} is deleted"));
    }
    document_from_snapshot(snapshot)
}

fn profile_database(state: &mut ProfileStoreState) -> Result<&OpenDatabase, String> {
    if state.database.is_none() {
        state.database = Some(open_database(&database_path()?)?);
    }
    state
        .database
        .as_ref()
        .ok_or_else(|| "profile database could not be opened".to_string())
}

pub fn save_profile_at_path(
    state: &mut ProfileStoreState,
    path: &Path,
    input: SaveProfileInput,
) -> Result<ProfileDocument, String> {
    let name = validate_name(&input.name)?;
    let raw_profile = protocol::normalize_v37_profile(&input.raw_profile)?;
    let config_json = serde_json::to_string(&raw_profile).map_err(|error| error.to_string())?;
    let mut database = open_database(path)?;
    ensure_writable(&database)?;
    ensure_backup(state, path)?;

    let transaction = database.connection.transaction().map_err(sql_error)?;
    let id = if let Some(id) = input.id {
        let expected = input
            .snapshot
            .as_ref()
            .ok_or_else(|| "an existing profile save requires its original snapshot".to_string())?;
        let current = snapshot_by_id(&transaction, id)?
            .ok_or_else(|| format!("profile {id} was not found"))?;
        if current != *expected {
            return Err(profile_conflict(id));
        }
        let metadata = profile_metadata_for_save(&transaction, &input, Some(&current))?;
        let changed = transaction
            .execute(
                "UPDATE t_Config SET
                    FConfigName = ?1,
                    FConfigJson = ?2,
                    FPhoneUUID_WebService = CASE WHEN TRIM(COALESCE(FPhoneUUID_WebService, '')) = '' THEN ?3 ELSE FPhoneUUID_WebService END,
                    FDevUUID = CASE WHEN TRIM(COALESCE(FDevUUID, '')) = '' THEN ?4 ELSE FDevUUID END,
                    FDevName = CASE WHEN TRIM(COALESCE(FDevName, '')) = '' OR TRIM(FDevName) COLLATE NOCASE = ?5 THEN ?6 ELSE FDevName END,
                    FFirmwareVersion = CASE WHEN TRIM(COALESCE(FFirmwareVersion, '')) = '' THEN ?7 ELSE FFirmwareVersion END,
                    FZKMVersion = CASE WHEN TRIM(COALESCE(FZKMVersion, '')) = '' THEN ?8 ELSE FZKMVersion END
                 WHERE FID = ?9 AND FDeleted = 0",
                params![
                    name,
                    config_json,
                    metadata.phone_uuid,
                    metadata.device_uuid,
                    device::HID_DEVICE_PRODUCT_NAME,
                    metadata.device_name,
                    metadata.firmware_version,
                    metadata.zkm_version,
                    id,
                ],
            )
            .map_err(sql_error)?;
        if changed != 1 {
            return Err(format!("profile {id} was not found"));
        }
        id
    } else {
        let metadata = profile_metadata_for_save(&transaction, &input, None)?;
        transaction
            .execute(
                "INSERT INTO t_Config (FID_WebService, FPhoneUUID_WebService, FDevUUID, FDevName, FUserID_WebService, FConfigName, FConfigJson, FFirmwareVersion, FZKMVersion, FDeleted) VALUES (-1, ?1, ?2, ?3, -1, ?4, ?5, ?6, ?7, 0)",
                params![
                    metadata.phone_uuid,
                    metadata.device_uuid,
                    metadata.device_name,
                    name,
                    config_json,
                    metadata.firmware_version,
                    metadata.zkm_version,
                ],
            )
            .map_err(sql_error)?;
        transaction.last_insert_rowid()
    };
    transaction.commit().map_err(sql_error)?;

    let snapshot = snapshot_by_id(&database.connection, id)?
        .ok_or_else(|| format!("saved profile {id} could not be reloaded"))?;
    document_from_snapshot(snapshot)
}

fn profile_metadata_for_save(
    connection: &Connection,
    input: &SaveProfileInput,
    existing: Option<&ProfileSnapshot>,
) -> Result<ProfileMetadata, String> {
    let mut metadata = ProfileMetadata {
        phone_uuid: input.phone_uuid.clone(),
        device_uuid: input.device_uuid.clone(),
        device_name: device::canonical_profile_device_name(&input.device_name),
        firmware_version: input.firmware_version.clone(),
        zkm_version: input.zkm_version.clone(),
    };
    if let Some(existing) = existing {
        metadata.fill_empty(
            &existing.phone_uuid,
            &existing.device_uuid,
            &device::canonical_profile_device_name(&existing.device_name),
            &existing.firmware_version,
            &existing.zkm_version,
        );
    }

    let phone_uuid = metadata.phone_uuid.trim().to_string();
    let device_uuid = metadata.device_uuid.trim().to_string();
    let mut statement = connection
        .prepare(
            "SELECT FPhoneUUID_WebService, FDevUUID, FDevName, FFirmwareVersion, FZKMVersion
             FROM t_Config
             WHERE (?1 = '' OR TRIM(COALESCE(FPhoneUUID_WebService, '')) = ?1)
               AND (?2 = '' OR TRIM(COALESCE(FDevUUID, '')) = ?2)
             ORDER BY FID DESC",
        )
        .map_err(sql_error)?;
    let rows = statement
        .query_map(params![phone_uuid, device_uuid], |row| {
            Ok((
                optional_text(row, 0)?,
                optional_text(row, 1)?,
                optional_text(row, 2)?,
                optional_text(row, 3)?,
                optional_text(row, 4)?,
            ))
        })
        .map_err(sql_error)?;
    for row in rows {
        let (phone_uuid, device_uuid, device_name, firmware_version, zkm_version) =
            row.map_err(sql_error)?;
        metadata.fill_empty(
            &phone_uuid,
            &device_uuid,
            &device_name,
            &firmware_version,
            &zkm_version,
        );
        if metadata.is_complete() {
            break;
        }
    }
    Ok(metadata)
}

fn migrate_legacy_device_names(state: &mut ProfileStoreState, path: &Path) -> Result<(), String> {
    if state.legacy_device_names_migrated {
        return Ok(());
    }

    let database = open_database(path)?;
    if !database.writable {
        state.legacy_device_names_migrated = true;
        return Ok(());
    }

    let has_legacy_name = database
        .connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM t_Config WHERE TRIM(FDevName) COLLATE NOCASE = ?1)",
            params![device::HID_DEVICE_PRODUCT_NAME],
            |row| row.get::<_, i64>(0),
        )
        .map_err(sql_error)?
        != 0;
    if has_legacy_name {
        ensure_backup(state, path)?;
        database
            .connection
            .execute(
                "UPDATE t_Config SET FDevName = ?1 WHERE TRIM(FDevName) COLLATE NOCASE = ?2",
                params![
                    device::OFFICIAL_PROFILE_DEVICE_NAME,
                    device::HID_DEVICE_PRODUCT_NAME
                ],
            )
            .map_err(sql_error)?;
        state.cached_data_version = None;
        state.cached_profiles.clear();
    }
    state.legacy_device_names_migrated = true;
    Ok(())
}

fn delete_listed_profile_at_path(
    state: &mut ProfileStoreState,
    path: &Path,
    input: DeleteProfileInput,
) -> Result<(), String> {
    let expected = state
        .listed_snapshots
        .get(&input.revision)
        .filter(|snapshot| snapshot.id == input.id)
        .cloned()
        .ok_or_else(|| profile_conflict(input.id))?;
    delete_profile_at_path(state, path, input.id, expected.as_ref())?;
    state.listed_snapshots.remove(&input.revision);
    Ok(())
}

fn delete_profile_at_path(
    state: &mut ProfileStoreState,
    path: &Path,
    id: i64,
    expected: &ProfileSnapshot,
) -> Result<(), String> {
    let mut database = open_database(path)?;
    ensure_writable(&database)?;
    ensure_backup(state, path)?;
    let transaction = database.connection.transaction().map_err(sql_error)?;
    let current =
        snapshot_by_id(&transaction, id)?.ok_or_else(|| format!("profile {id} was not found"))?;
    if current != *expected {
        return Err(profile_conflict(id));
    }
    let changed = transaction
        .execute(
            "UPDATE t_Config SET FDeleted = 1 WHERE FID = ?1 AND FDeleted = 0",
            params![id],
        )
        .map_err(sql_error)?;
    if changed != 1 {
        return Err(format!("profile {id} was not found"));
    }
    transaction.commit().map_err(sql_error)
}

fn open_database(path: &Path) -> Result<OpenDatabase, String> {
    if let Some(parent) = path.parent()
        && !parent.exists()
    {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let is_new = !path.exists();
    let connection = Connection::open(path).map_err(sql_error)?;
    connection
        .busy_timeout(Duration::from_secs(3))
        .map_err(sql_error)?;
    if is_new {
        connection
            .execute_batch("PRAGMA journal_mode = WAL;\n")
            .map_err(sql_error)?;
        connection.execute_batch(CREATE_SCHEMA).map_err(sql_error)?;
    }
    let columns = table_columns(&connection)?;
    if columns.is_empty() {
        return Err("Config.db has no supported t_Config table; it is read-only".into());
    }
    let writable = columns.len() == REQUIRED_COLUMNS.len()
        && REQUIRED_COLUMNS
            .iter()
            .all(|column| columns.iter().any(|name| name == column));
    Ok(OpenDatabase {
        connection,
        writable,
    })
}

fn table_columns(connection: &Connection) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(t_Config)")
        .map_err(sql_error)?;
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)
}

fn ensure_writable(database: &OpenDatabase) -> Result<(), String> {
    if database.writable {
        Ok(())
    } else {
        Err("Config.db uses an unknown schema and is read-only".into())
    }
}

fn snapshot_by_id(connection: &Connection, id: i64) -> Result<Option<ProfileSnapshot>, String> {
    connection
        .query_row(
            &format!("SELECT {SELECT_COLUMNS} FROM {TABLE_NAME} WHERE FID = ?1"),
            params![id],
            snapshot_from_row,
        )
        .optional()
        .map_err(sql_error)
}

fn snapshot_from_row(row: &Row<'_>) -> rusqlite::Result<ProfileSnapshot> {
    Ok(ProfileSnapshot {
        id: row.get(0)?,
        phone_uuid: optional_text(row, 2)?,
        name: optional_text(row, 6)?,
        device_uuid: optional_text(row, 3)?,
        device_name: optional_text(row, 4)?,
        firmware_version: optional_text(row, 8)?,
        zkm_version: optional_text(row, 9)?,
        config_json: optional_text(row, 7)?,
        created_at: optional_text(row, 10)?,
        deleted: row.get::<_, Option<i64>>(11)?.unwrap_or_default(),
    })
}

fn optional_text(row: &Row<'_>, index: usize) -> rusqlite::Result<String> {
    Ok(row.get::<_, Option<String>>(index)?.unwrap_or_default())
}

fn list_entry(snapshot: ProfileSnapshot) -> ProfileListEntry {
    let (profile_version, normalized_profile) = match parse_profile_json(&snapshot.config_json) {
        Ok(bytes) => match protocol::normalize_v37_profile(&bytes) {
            Ok(normalized) => (Some("v37".to_string()), Some(Arc::from(normalized))),
            Err(_) => (None, None),
        },
        Err(_) => (None, None),
    };
    let snapshot = Arc::new(snapshot);
    ProfileListEntry {
        id: snapshot.id,
        revision: 0,
        name: snapshot.name.clone(),
        device_uuid: snapshot.device_uuid.clone(),
        created_at: snapshot.created_at.clone(),
        profile_version,
        active: false,
        snapshot,
        normalized_profile,
    }
}

fn document_from_snapshot(snapshot: ProfileSnapshot) -> Result<ProfileDocument, String> {
    let raw_profile = parse_profile_json(&snapshot.config_json)?;
    protocol::normalize_v37_profile(&raw_profile)?;
    Ok(ProfileDocument {
        id: snapshot.id,
        phone_uuid: snapshot.phone_uuid.clone(),
        name: snapshot.name.clone(),
        device_uuid: snapshot.device_uuid.clone(),
        device_name: snapshot.device_name.clone(),
        firmware_version: snapshot.firmware_version.clone(),
        zkm_version: snapshot.zkm_version.clone(),
        raw_profile,
        snapshot,
    })
}

fn parse_profile_json(json: &str) -> Result<Vec<u8>, String> {
    serde_json::from_str(json)
        .map_err(|error| format!("FConfigJson is not a valid byte array: {error}"))
}

fn validate_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("profile name cannot be empty".into());
    }
    if name.chars().count() > 128 {
        return Err("profile name must be at most 128 characters".into());
    }
    Ok(name.to_string())
}

fn profile_conflict(id: i64) -> String {
    format!("PROFILE_CONFLICT: profile {id} changed outside BlitzForge")
}

fn ensure_backup(state: &mut ProfileStoreState, database_path: &Path) -> Result<(), String> {
    if state.backup_created {
        return Ok(());
    }
    backup_database(database_path)?;
    state.backup_created = true;
    Ok(())
}

fn backup_database(database_path: &Path) -> Result<(), String> {
    let backup_root = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join(BACKUP_DIRECTORY)
        .join("backups");
    fs::create_dir_all(&backup_root).map_err(|error| error.to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let backup_path = backup_root.join(format!("Config-{stamp}.db"));
    let source = Connection::open(database_path).map_err(sql_error)?;
    source
        .busy_timeout(Duration::from_secs(3))
        .map_err(sql_error)?;
    let mut destination = Connection::open(&backup_path).map_err(sql_error)?;
    destination
        .busy_timeout(Duration::from_secs(3))
        .map_err(sql_error)?;
    let backup = Backup::new(&source, &mut destination).map_err(sql_error)?;
    if let Err(error) = backup.run_to_completion(100, Duration::from_millis(10), None) {
        let _ = fs::remove_file(&backup_path);
        return Err(sql_error(error));
    }
    Ok(())
}

fn sql_error(error: rusqlite::Error) -> String {
    error.to_string()
}