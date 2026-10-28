use serde::{Deserialize,Serialize};
use std::{collections::HashMap,fs,path::PathBuf,sync::{Mutex,OnceLock}};
use base64::{engine::general_purpose::STANDARD,Engine};
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",default)]
pub struct Config {
 pub revision:u64,pub enabled:bool,pub username:String,pub team_id:String,pub project_id:String,pub startup_slug:String,
 pub amount_unit:String,pub cli_path:String,pub config_dir:String,pub source:String,
 pub subscribed_at:String,pub last_charge_at:String,pub next_billing_at:String,
}
#[derive(Default,Serialize,Deserialize)]
#[serde(default)]
struct Store {configs:HashMap<String,Config>,secrets:HashMap<String,String>}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Connection {#[serde(flatten)]config:Config,has_token:bool,detected_cli_path:Option<String>,session_found:bool}
static LOCK:OnceLock<Mutex<()>>=OnceLock::new();
fn mutex()->&'static Mutex<()>{LOCK.get_or_init(||Mutex::new(()))}
fn path()->Result<PathBuf,String>{std::env::var_os("APPDATA").or_else(||std::env::var_os("XDG_CONFIG_HOME")).map(|p|PathBuf::from(p).join("myfounderdock/connections.json")).ok_or("Your application settings directory is unavailable.".into())}
fn read()->Result<Store,String>{let p=path()?;if !p.exists(){return Ok(Store::default())}if fs::metadata(&p).map_err(|_|"Could not read account settings.")?.len()>2*1024*1024{return Err("Account settings could not be read.".into())}serde_json::from_slice(&fs::read(p).map_err(|_|"Could not read account settings.")?).map_err(|_|"Your account settings file is invalid.".into())}
fn write(store:&Store)->Result<(),String>{let p=path()?;fs::create_dir_all(p.parent().unwrap()).map_err(|_|"Could not create the account settings directory.")?;let tmp=p.with_extension("tmp");fs::write(&tmp,serde_json::to_vec(store).map_err(|_|"Could not encode account settings.")?).map_err(|_|"Could not save account settings.")?;fs::rename(tmp,p).map_err(|_|"Could not finish saving account settings.".into())}
fn valid_provider(p:&str)->bool{["github","vercel","polar","trustmrr","stripe","codex","claude","cursor"].contains(&p)}
fn validate(p:&str,c:&Config)->Result<(),String>{
 if !valid_provider(p){return Err("Unknown provider.".into())}
 for v in [&c.username,&c.team_id,&c.project_id,&c.startup_slug,&c.amount_unit,&c.cli_path,&c.config_dir,&c.source,&c.subscribed_at,&c.last_charge_at,&c.next_billing_at]{if v.len()>2048||v.contains(['\0','\r','\n']){return Err("An account setting is invalid.".into())}}
 if !c.username.is_empty()&&(c.username.len()>39||!c.username.chars().all(|x|x.is_ascii_alphanumeric()||x=='-')){return Err("Enter a GitHub username, without its URL.".into())}
 if !c.startup_slug.is_empty()&&(c.startup_slug.len()>100||!c.startup_slug.chars().all(|x|x.is_ascii_alphanumeric()||x=='-')){return Err("Enter a valid startup slug.".into())}
 if !["","auto","editor","cli"].contains(&c.source.as_str()){return Err("Choose a valid account source.".into())}
 if !["","usd","cents"].contains(&c.amount_unit.as_str()){return Err("Choose dollars or cents.".into())}
 if !c.cli_path.is_empty()&&!PathBuf::from(&c.cli_path).is_file(){return Err("The CLI executable was not found at this path.".into())}Ok(())
}
#[cfg(windows)]
fn protect(value:&[u8],decrypt:bool)->Result<Vec<u8>,String>{
 use windows_sys::Win32::{Security::Cryptography::{CryptProtectData,CryptUnprotectData,CRYPT_INTEGER_BLOB,CRYPTPROTECT_UI_FORBIDDEN},Foundation::LocalFree};
 let input=CRYPT_INTEGER_BLOB{cbData:value.len().try_into().map_err(|_|"Secret is too large.")?,pbData:value.as_ptr()as*mut u8};let mut output=CRYPT_INTEGER_BLOB{cbData:0,pbData:std::ptr::null_mut()};
 let result=unsafe{if decrypt{CryptUnprotectData(&input,std::ptr::null_mut(),std::ptr::null(),std::ptr::null(),std::ptr::null(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}else{CryptProtectData(&input,std::ptr::null(),std::ptr::null(),std::ptr::null(),std::ptr::null(),CRYPTPROTECT_UI_FORBIDDEN,&mut output)}};
 if result==0{return Err("Windows could not unlock this token. Re-enter it in Settings on this computer.".into())}
 let bytes=unsafe{std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec()};unsafe{LocalFree(output.pbData as*mut _);}Ok(bytes)
}
#[cfg(not(windows))]
fn protect(_value:&[u8],_decrypt:bool)->Result<Vec<u8>,String>{Err("Secure token storage is currently available on Windows.".into())}
pub fn config(provider:&str)->Result<Config,String>{if !valid_provider(provider){return Err("Unknown provider.".into())}let _guard=mutex().lock().map_err(|_|"Account settings unavailable.")?;Ok(read()?.configs.remove(provider).unwrap_or_default())}
pub fn token(provider:&str)->Result<String,String>{
 let _guard=mutex().lock().map_err(|_|"Account settings unavailable.")?;let store=read()?;
 if !store.configs.get(provider).is_some_and(|c|c.enabled){return Err(format!("Configure your {} account in Settings.",provider))}
 let encrypted=store.secrets.get(provider).ok_or_else(||format!("Add your {} API token in Settings.",provider))?;
 let data=STANDARD.decode(encrypted).map_err(|_|"Your saved token could not be read. Re-enter it in Settings.")?;
 String::from_utf8(protect(&data,true)?).map_err(|_|"Your saved token could not be read. Re-enter it in Settings.".into())
}
pub fn set_cursor_source(source:&str)->Result<(),String>{let _guard=mutex().lock().map_err(|_|"Account settings unavailable.")?;let mut store=read()?;let config=store.configs.entry("cursor".into()).or_default();config.source=source.into();config.revision=config.revision.saturating_add(1);write(&store)}
#[tauri::command]
pub fn get_connection(provider:String)->Result<Connection,String>{
 if !valid_provider(&provider){return Err("Unknown provider.".into())}
 let(config,has_token)={let _guard=mutex().lock().map_err(|_|"Account settings unavailable.")?;let mut store=read()?;(store.configs.remove(&provider).unwrap_or_default(),store.secrets.contains_key(&provider))};
 let detected_cli_path=crate::agent_usage::detect_cli(&provider).map(|p|p.to_string_lossy().into_owned());
 let session_found=crate::agent_usage::session_found(&provider,&config);
 Ok(Connection{config,has_token,detected_cli_path,session_found})
}
#[tauri::command]
pub fn save_connection(provider:String,mut config:Config,token:Option<String>,clear_token:Option<bool>)->Result<(),String>{
 validate(&provider,&config)?;
 {let _guard=mutex().lock().map_err(|_|"Account settings unavailable.")?;let mut store=read()?;
 if clear_token==Some(true){store.secrets.remove(&provider);}
 if let Some(token)=token.filter(|s|!s.trim().is_empty()){
  let token=token.trim();if token.len()>16000||token.contains(['\0','\r','\n']){return Err("Enter a valid API token.".into())}
  store.secrets.insert(provider.clone(),STANDARD.encode(protect(token.as_bytes(),false)?));
 }
 config.revision=store.configs.get(&provider).map(|c|c.revision).unwrap_or(0).saturating_add(1);
 store.configs.insert(provider.clone(),config);write(&store)?;}
 crate::agent_usage::clear_cache(&provider);crate::trustmrr::clear_cache();Ok(())
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn new_users_have_no_account_or_username(){let c=Config::default();assert!(!c.enabled);assert!(c.username.is_empty());assert!(c.startup_slug.is_empty());}
 #[test]fn rejects_invalid_usernames_and_providers(){assert!(validate("github",&Config{username:"https://github.com/person".into(),..Config::default()}).is_err());assert!(validate("other",&Config::default()).is_err());}
 #[test]#[cfg(windows)]fn windows_encrypts_and_round_trips_tokens(){let token=b"unit-test-not-a-real-key";let encrypted=protect(token,false).unwrap();assert_ne!(encrypted,token);assert_eq!(protect(&encrypted,true).unwrap(),token);}
 #[test]fn connection_response_never_contains_secret(){let value=serde_json::to_string(&Connection{config:Config::default(),has_token:true,detected_cli_path:None,session_found:false}).unwrap();assert!(!value.contains("accessToken"));assert!(value.contains("hasToken"));}
}

#[tauri::command]
pub fn open_provider_help(app:tauri::AppHandle,provider:String)->Result<(),String>{
 use tauri_plugin_opener::OpenerExt;
 let url=match provider.as_str(){"vercel"=>"https://vercel.com/account/tokens","polar"=>"https://polar.sh/dashboard","trustmrr"=>"https://trustmrr.com/docs/api","stripe"=>"https://dashboard.stripe.com/apikeys",_=>return Err("No token help page is available for this provider.".into())};
 app.opener().open_url(url,None::<&str>).map_err(|_|"Could not open the token help page.".into())
}
