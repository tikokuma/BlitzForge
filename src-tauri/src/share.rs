use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

const SHARE_CONFIG_URL: &str = "http://m.bigbigwon.com:8080/dev/shareConfig";
const IMPORT_SHARE_CONFIG_URL: &str = "http://m.bigbigwon.com:8080/dev/importShareConfig";
const SHARE_CONFIG_TYPE: i64 = 3;

#[derive(Clone)]
pub struct ShareProfile {
    pub name: String,
    pub phone_uuid: String,
    pub device_uuid: String,
    pub device_name: String,
    pub firmware_version: String,
    pub zkm_version: String,
    pub config_json: String,
}

pub struct ImportedShareProfile {
    pub name: String,
    pub phone_uuid: String,
    pub device_uuid: String,
    pub device_name: String,
    pub firmware_version: String,
    pub zkm_version: String,
    pub config_json: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareConfigRequest {
    phone_uuid: String,
    dev_uuid: String,
    config_type: i64,
    config_name: String,
    config_json: String,
    firmware_version: String,
    device_model: String,
    zkm_version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportShareConfigRequest {
    phone_uuid: String,
    dev_uuid: String,
    share_code: String,
}

#[derive(Deserialize)]
struct ShareApiResponse {
    code: i64,
    #[serde(default)]
    msg: Option<String>,
    #[serde(default)]
    data: Option<ShareApiData>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ShareApiData {
    ShareCode(String),
    Config(ShareConfigData),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareConfigData {
    #[serde(default)]
    share_code: Option<String>,
    #[serde(default)]
    phone_uuid: Option<String>,
    #[serde(default)]
    config_name: Option<String>,
    #[serde(default)]
    dev_uuid: Option<String>,
    #[serde(default)]
    firmware_version: Option<String>,
    #[serde(default)]
    device_model: Option<String>,
    #[serde(default)]
    zkm_version: Option<String>,
    #[serde(default)]
    config_json: Option<String>,
}

fn post_json<T: Serialize, R: DeserializeOwned>(url: &str, payload: &T) -> Result<R, String> {
    let body = serde_json::to_string(payload)
        .map_err(|error| format!("公式Share APIのリクエストを作成できませんでした: {error}"))?;
    let response = minreq::post(url)
        .with_timeout(15)
        .with_header("Content-Type", "application/json")
        .with_body(body)
        .send()
        .map_err(|error| format!("公式Share APIへ接続できませんでした: {error}"))?;
    if !(200..300).contains(&response.status_code) {
        return Err(format!(
            "公式Share APIがHTTP {}を返しました",
            response.status_code
        ));
    }
    serde_json::from_slice(response.as_bytes())
        .map_err(|error| format!("公式Share APIの応答形式が不正です: {error}"))
}

fn check_response(response: &ShareApiResponse) -> Result<(), String> {
    if response.code == 0 {
        Ok(())
    } else {
        let message = response.msg.as_deref().unwrap_or("unknown error");
        Err(format!(
            "公式Share APIがエラーコード {} を返しました: {message}",
            response.code
        ))
    }
}

fn share_code_from_response(response: &ShareApiResponse) -> Result<String, String> {
    let code = match response.data.as_ref() {
        Some(ShareApiData::ShareCode(code)) => code.as_str(),
        Some(ShareApiData::Config(data)) => data.share_code.as_deref().unwrap_or_default(),
        None => return Err("公式Share APIの応答にShareコードがありません".to_string()),
    };

    if code.trim().is_empty() {
        return Err("公式Share APIの応答にShareコードがありません".to_string());
    }

    Ok(code.to_string())
}

pub fn create_share_code(profile: ShareProfile) -> Result<String, String> {
    let response: ShareApiResponse = post_json(
        SHARE_CONFIG_URL,
        &ShareConfigRequest {
            phone_uuid: profile.phone_uuid,
            dev_uuid: profile.device_uuid,
            config_type: SHARE_CONFIG_TYPE,
            config_name: profile.name,
            config_json: profile.config_json,
            firmware_version: profile.firmware_version,
            device_model: profile.device_name,
            zkm_version: profile.zkm_version,
        },
    )?;
    check_response(&response)?;
    share_code_from_response(&response)
}

pub fn import_share_code(
    share_code: String,
    device_uuid: String,
) -> Result<ImportedShareProfile, String> {
    let response: ShareApiResponse = post_json(
        IMPORT_SHARE_CONFIG_URL,
        &ImportShareConfigRequest {
            phone_uuid: String::new(),
            dev_uuid: device_uuid,
            share_code,
        },
    )?;
    check_response(&response)?;
    let data = match response.data {
        Some(ShareApiData::Config(data)) => data,
        Some(ShareApiData::ShareCode(_)) => {
            return Err("公式Share APIの応答にプロファイルデータがありません".to_string());
        }
        None => return Err("公式Share APIの応答にプロファイルデータがありません".to_string()),
    };
    Ok(ImportedShareProfile {
        name: data.config_name.unwrap_or_default(),
        phone_uuid: data.phone_uuid.unwrap_or_default(),
        device_uuid: data.dev_uuid.unwrap_or_default(),
        device_name: data.device_model.unwrap_or_default(),
        firmware_version: data.firmware_version.unwrap_or_default(),
        zkm_version: data.zkm_version.unwrap_or_default(),
        config_json: data
            .config_json
            .ok_or_else(|| "公式Share APIの応答にプロファイルデータがありません".to_string())?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_official_share_request_fields() {
        let value = serde_json::to_value(ShareConfigRequest {
            phone_uuid: "phone".into(),
            dev_uuid: "device".into(),
            config_type: SHARE_CONFIG_TYPE,
            config_name: "Preset".into(),
            config_json: "[1,2,3]".into(),
            firmware_version: "3308".into(),
            device_model: "Rainbow2 SE".into(),
            zkm_version: "54".into(),
        })
        .unwrap();

        assert_eq!(value["phoneUuid"], "phone");
        assert_eq!(value["configType"], 3);
        assert_eq!(value["configName"], "Preset");
        assert_eq!(value["configJson"], "[1,2,3]");
        assert_eq!(value["deviceModel"], "Rainbow2 SE");
    }

    #[test]
    fn parses_official_share_response_envelope() {
        let response: ShareApiResponse = serde_json::from_str(
            r#"{"code":0,"msg":"OK","data":{"shareCode":"H4pyvj86","configName":"Horizon","configJson":"[1,2,3]"}}"#,
        )
        .unwrap();

        assert_eq!(response.code, 0);
        match response.data.unwrap() {
            ShareApiData::Config(data) => {
                assert_eq!(data.share_code.as_deref(), Some("H4pyvj86"));
            }
            ShareApiData::ShareCode(_) => panic!("expected config object"),
        }
    }

    #[test]
    fn parses_share_code_string_response() {
        let response: ShareApiResponse =
            serde_json::from_str(r#"{"code":0,"msg":"OK","data":"ZWUDan3k"}"#).unwrap();

        assert_eq!(share_code_from_response(&response).unwrap(), "ZWUDan3k");
    }
}
