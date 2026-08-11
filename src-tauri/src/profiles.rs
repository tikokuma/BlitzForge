use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, Row, backup::Backup, params};
use serde::{Deserialize, Serialize};

use crate::protocol;

const DATABASE_DIRECTORY: &str = "GamepadAssistant";
const DATABASE_FILE: &str = "Config.db";
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
"#;

const SELECT_COLUMNS: &str = "FID, FID_WebService, FPhoneUUID_WebService, FDevUUID, FDevName, FUserID_WebService, FConfigName, FConfigJson, FFirmwareVersion, FZKMVersion, FDateTimeCreate, FDeleted";

#[derive(Default)]
pub struct ProfileStoreState {
    backup_created: bool,
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
    pub name: String,
    pub device_uuid: String,
    pub device_name: String,
    pub firmware_version: String,
    pub zkm_version: String,
    pub created_at: String,
    pub profile_length: usize,
    pub profile_version: Option<String>,
    pub supported: bool,
    pub incompatibility_reason: Option<String>,
    pub active: bool,
    pub snapshot: ProfileSnapshot,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDocument {
    pub id: i64,
    pub phone_uuid: String,
    pub name: String,
    pub device_uuid: String,
    pub device_name: String,
    pub firmware_version: String,
    pub zkm_version: String,
    pub created_at: String,
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
    pub snapshot: ProfileSnapshot,
}

struct OpenDatabase {
    connection: Connection,
    writable: bool,
}

pub fn database_path() -> Result<PathBuf, String> {
    let program_data = env::var_os("PROGRAMDATA")
        .ok_or_else(|| "Windows PROGRAMDATA is not available".to_string())?;
    Ok(PathBuf::from(program_data)
        .join(DATABASE_DIRECTORY)
        .join(DATABASE_FILE))
}

pub fn list_profiles() -> Result<Vec<ProfileListEntry>, String> {
    list_profiles_at_path(&database_path()?)
}

pub fn load_saved_profile(id: i64) -> Result<ProfileDocument, String> {
    load_saved_profile_at_path(&database_path()?, id)
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
    delete_profile_at_path(state, &database_path()?, input)
}

pub fn list_profiles_at_path(path: &Path) -> Result<Vec<ProfileListEntry>, String> {
    let database = open_database(path)?;
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

pub fn load_saved_profile_at_path(path: &Path, id: i64) -> Result<ProfileDocument, String> {
    let database = open_database(path)?;
    let snapshot = snapshot_by_id(&database.connection, id)?
        .ok_or_else(|| format!("profile {id} was not found"))?;
    if snapshot.deleted != 0 {
        return Err(format!("profile {id} is deleted"));
    }
    document_from_snapshot(snapshot)
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
            .ok_or_else(|| "an existing profile save requires its original snapshot".to_string())?;
        let current = snapshot_by_id(&transaction, id)?
            .ok_or_else(|| format!("profile {id} was not found"))?;
        if current != expected {
            return Err(profile_conflict(id));
        }
        let changed = transaction
            .execute(
                "UPDATE t_Config SET FConfigName = ?1, FConfigJson = ?2 WHERE FID = ?3 AND FDeleted = 0",
                params![name, config_json, id],
            )
            .map_err(sql_error)?;
        if changed != 1 {
            return Err(format!("profile {id} was not found"));
        }
        id
    } else {
        let phone_uuid = if input.phone_uuid.trim().is_empty() {
            transaction
                .query_row(
                    "SELECT FPhoneUUID_WebService FROM t_Config WHERE FDeleted = 0 AND TRIM(COALESCE(FPhoneUUID_WebService, '')) <> '' ORDER BY FID DESC LIMIT 1",
                    [],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(sql_error)?
                .flatten()
                .unwrap_or_default()
        } else {
            input.phone_uuid.clone()
        };
        transaction
            .execute(
                "INSERT INTO t_Config (FID_WebService, FPhoneUUID_WebService, FDevUUID, FDevName, FUserID_WebService, FConfigName, FConfigJson, FFirmwareVersion, FZKMVersion, FDeleted) VALUES (-1, ?1, ?2, ?3, -1, ?4, ?5, ?6, ?7, 0)",
                params![
                    phone_uuid,
                    input.device_uuid,
                    input.device_name,
                    name,
                    config_json,
                    input.firmware_version,
                    input.zkm_version,
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

pub fn delete_profile_at_path(
    state: &mut ProfileStoreState,
    path: &Path,
    input: DeleteProfileInput,
) -> Result<(), String> {
    let mut database = open_database(path)?;
    ensure_writable(&database)?;
    ensure_backup(state, path)?;
    let transaction = database.connection.transaction().map_err(sql_error)?;
    let current = snapshot_by_id(&transaction, input.id)?
        .ok_or_else(|| format!("profile {} was not found", input.id))?;
    if current != input.snapshot {
        return Err(profile_conflict(input.id));
    }
    let changed = transaction
        .execute(
            "UPDATE t_Config SET FDeleted = 1 WHERE FID = ?1 AND FDeleted = 0",
            params![input.id],
        )
        .map_err(sql_error)?;
    if changed != 1 {
        return Err(format!("profile {} was not found", input.id));
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
    let (profile_length, profile_version, supported, incompatibility_reason) =
        match parse_profile_json(&snapshot.config_json) {
            Ok(bytes) => match protocol::normalize_v37_profile(&bytes) {
                Ok(_) => (bytes.len(), Some("v37".to_string()), true, None),
                Err(error) => (bytes.len(), None, false, Some(error)),
            },
            Err(error) => (0, None, false, Some(error)),
        };
    ProfileListEntry {
        id: snapshot.id,
        name: snapshot.name.clone(),
        device_uuid: snapshot.device_uuid.clone(),
        device_name: snapshot.device_name.clone(),
        firmware_version: snapshot.firmware_version.clone(),
        zkm_version: snapshot.zkm_version.clone(),
        created_at: snapshot.created_at.clone(),
        profile_length,
        profile_version,
        supported,
        incompatibility_reason,
        active: false,
        snapshot,
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
        created_at: snapshot.created_at.clone(),
        raw_profile,
        snapshot,
    })
}

fn parse_profile_json(json: &str) -> Result<Vec<u8>, String> {
    let value: serde_json::Value = serde_json::from_str(json)
        .map_err(|error| format!("FConfigJson is not valid JSON: {error}"))?;
    let array = value
        .as_array()
        .ok_or_else(|| "FConfigJson must be a JSON array".to_string())?;
    let mut bytes = Vec::with_capacity(array.len());
    for (index, value) in array.iter().enumerate() {
        let number = value.as_u64().ok_or_else(|| {
            format!("FConfigJson value at index {index} is not an unsigned integer")
        })?;
        let byte = u8::try_from(number)
            .map_err(|_| format!("FConfigJson value at index {index} is outside 0..255"))?;
        bytes.push(byte);
    }
    Ok(bytes)
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
        .join("com.bigbigwon.lite")
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn profile() -> Vec<u8> {
        let mut profile = vec![0_u8; protocol::V37_PROFILE_LENGTH];
        profile[2..4].copy_from_slice(&(protocol::V37_PROFILE_LENGTH as u16).to_be_bytes());
        let crc = protocol::profile_crc(&profile).expect("profile crc");
        profile[..2].copy_from_slice(&crc.to_be_bytes());
        profile
    }

    fn save_input(
        id: Option<i64>,
        snapshot: Option<ProfileSnapshot>,
        name: &str,
    ) -> SaveProfileInput {
        SaveProfileInput {
            id,
            phone_uuid: "A0AD9F12E604".into(),
            name: name.into(),
            raw_profile: profile(),
            device_uuid: "55E8224A7A680000".into(),
            device_name: "BLITZ2".into(),
            firmware_version: "313333".into(),
            zkm_version: "55".into(),
            snapshot,
        }
    }

    #[test]
    fn creates_reads_updates_and_logically_deletes_profiles() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("Config.db");
        let mut state = ProfileStoreState::default();

        let saved = save_profile_at_path(&mut state, &path, save_input(None, None, "First"))
            .expect("save profile");
        assert_eq!(saved.raw_profile.len(), protocol::V37_PROFILE_LENGTH);
        assert_eq!(list_profiles_at_path(&path).expect("list").len(), 1);

        let loaded = load_saved_profile_at_path(&path, saved.id).expect("load profile");
        assert_eq!(loaded.snapshot, saved.snapshot);
        let renamed = save_profile_at_path(
            &mut state,
            &path,
            save_input(Some(saved.id), Some(loaded.snapshot.clone()), "Renamed"),
        )
        .expect("rename profile");
        assert_eq!(renamed.id, saved.id);
        assert_eq!(renamed.name, "Renamed");

        delete_profile_at_path(
            &mut state,
            &path,
            DeleteProfileInput {
                id: renamed.id,
                snapshot: renamed.snapshot,
            },
        )
        .expect("delete profile");
        assert!(list_profiles_at_path(&path).expect("list").is_empty());
    }

    #[test]
    fn preserves_unknown_metadata_when_updating() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("Config.db");
        let connection = Connection::open(&path).expect("open database");
        connection.execute_batch(CREATE_SCHEMA).expect("schema");
        connection
            .execute(
                "INSERT INTO t_Config (FID_WebService, FPhoneUUID_WebService, FDevUUID, FDevName, FUserID_WebService, FConfigName, FConfigJson, FFirmwareVersion, FZKMVersion, FDeleted) VALUES (42, 'phone', 'uuid', 'device', 99, 'Old', ?1, 'fw', 'zkm', 0)",
                params![serde_json::to_string(&profile()).expect("json")],
            )
            .expect("insert");
        drop(connection);
        let mut state = ProfileStoreState::default();
        let loaded = load_saved_profile_at_path(&path, 1).expect("load");
        let updated = save_profile_at_path(
            &mut state,
            &path,
            save_input(Some(1), Some(loaded.snapshot.clone()), "New"),
        )
        .expect("update");
        let connection = Connection::open(&path).expect("reopen");
        let metadata: (i64, String, i64, String, String) = connection
            .query_row(
                "SELECT FID_WebService, FPhoneUUID_WebService, FUserID_WebService, FFirmwareVersion, FZKMVersion FROM t_Config WHERE FID = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .expect("metadata");
        assert_eq!(
            metadata,
            (42, "phone".into(), 99, "fw".into(), "zkm".into())
        );
        assert_eq!(updated.name, "New");
    }

    #[test]
    fn rejects_unknown_schema_for_writes() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("Config.db");
        let connection = Connection::open(&path).expect("open database");
        connection
            .execute_batch("CREATE TABLE t_Config (FID INTEGER PRIMARY KEY, FConfigName TEXT)")
            .expect("schema");
        drop(connection);
        let mut state = ProfileStoreState::default();
        let error = save_profile_at_path(&mut state, &path, save_input(None, None, "New"))
            .expect_err("unknown schema must be read-only");
        assert!(error.contains("read-only"));
    }

    #[test]
    fn reports_invalid_json_profiles_as_unsupported() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("Config.db");
        let connection = Connection::open(&path).expect("open database");
        connection.execute_batch(CREATE_SCHEMA).expect("schema");
        connection
            .execute(
                "INSERT INTO t_Config (FConfigName, FConfigJson) VALUES ('Broken', '[1, 2, 999]')",
                [],
            )
            .expect("insert");
        drop(connection);
        let entries = list_profiles_at_path(&path).expect("list");
        assert_eq!(entries.len(), 1);
        assert!(!entries[0].supported);
        assert!(entries[0].incompatibility_reason.is_some());
    }

    #[test]
    fn observes_wal_updates_and_rejects_a_stale_snapshot() {
        let directory = tempdir().expect("temp directory");
        let path = directory.path().join("Config.db");
        let mut state = ProfileStoreState::default();
        let saved = save_profile_at_path(&mut state, &path, save_input(None, None, "Original"))
            .expect("save profile");
        let loaded = load_saved_profile_at_path(&path, saved.id).expect("load profile");

        let external = Connection::open(&path).expect("external connection");
        external
            .busy_timeout(Duration::from_secs(3))
            .expect("busy timeout");
        external
            .execute(
                "UPDATE t_Config SET FConfigName = ?1 WHERE FID = ?2",
                params!["Official change", saved.id],
            )
            .expect("external update");
        assert_eq!(
            list_profiles_at_path(&path).expect("list")[0].name,
            "Official change"
        );

        let error = save_profile_at_path(
            &mut state,
            &path,
            save_input(Some(saved.id), Some(loaded.snapshot), "BlitzForge change"),
        )
        .expect_err("stale save must be rejected");
        assert!(error.starts_with("PROFILE_CONFLICT:"));
    }
}
