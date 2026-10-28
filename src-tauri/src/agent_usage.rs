use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, fs, io::{BufRead, BufReader, Write}, path::PathBuf, process::{Child, Command, Stdio}, sync::{mpsc, Mutex, OnceLock}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct UsageWindow { id:String, label:String, used_percent:f64, resets_at:Option<String>, window_duration_mins:Option<u64> }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct TokenSummary { lifetime_tokens:Option<u64>, peak_daily_tokens:Option<u64>, current_streak_days:Option<u64> }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AgentUsage {
    provider:String, plan:Option<String>, account:Option<String>, source:String, billing_source:String, windows:Vec<UsageWindow>,
    tokens:Option<TokenSummary>, period_start:Option<String>, period_end:Option<String>,
    subscribed_at:Option<String>, last_charge_at:Option<String>, renews_at:Option<String>, updated_at:u64,
}
fn now()->u64 {SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
fn home()->Result<PathBuf,String>{std::env::var_os("USERPROFILE").or_else(||std::env::var_os("HOME")).map(PathBuf::from).ok_or("Your user profile directory is unavailable.".into())}
fn appdata()->Result<PathBuf,String>{std::env::var_os("APPDATA").map(PathBuf::from).ok_or("Your application data directory is unavailable.".into())}
fn read_json(path:&PathBuf)->Result<Value,String>{
    let meta=fs::metadata(path).map_err(|_|"No saved account was found. Sign in to connect.")?;
    if meta.len()>4*1024*1024{return Err("The saved account file could not be read.".into())}
    serde_json::from_str(&fs::read_to_string(path).map_err(|_|"Could not read the saved account.")?).map_err(|_|"The saved account file is invalid. Sign in again.".into())
}
fn string(value:&Value,key:&str)->Option<String>{value.get(key).and_then(Value::as_str).filter(|s|!s.trim().is_empty()).map(str::to_owned)}
fn number(value:&Value,key:&str)->Option<f64>{value.get(key).and_then(Value::as_f64).filter(|n|n.is_finite()&&*n>=0.)}
fn date(value:&Value,key:&str)->Option<String>{value.get(key).and_then(|v|v.as_str().map(str::to_owned).or_else(||v.as_i64().map(|n|n.to_string())))}
fn empty(provider:&str,source:&str)->AgentUsage {AgentUsage{provider:provider.into(),plan:None,account:None,source:source.into(),billing_source:"provider".into(),windows:vec![],tokens:None,period_start:None,period_end:None,subscribed_at:None,last_charge_at:None,renews_at:None,updated_at:now()}}
fn validate_provider(provider:&str)->Result<(),String>{if ["codex","claude","cursor"].contains(&provider){Ok(())}else{Err("Unknown AI provider.".into())}}
fn hide(command:&mut Command){#[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);} }
// Resolve known installation layouts directly; never execute shell shims to discover a CLI.
fn npm_roots()->Vec<PathBuf>{
 let mut roots=Vec::new();
 if let Some(prefix)=std::env::var_os("NPM_CONFIG_PREFIX"){roots.push(PathBuf::from(prefix).join("node_modules"));}
 if let Ok(root)=appdata(){roots.push(root.join("npm/node_modules"));}
 if let Some(paths)=std::env::var_os("PATH"){for dir in std::env::split_paths(&paths){roots.push(dir.join("node_modules"));}}
 if let Some(root)=std::env::var_os("ProgramFiles"){roots.push(PathBuf::from(root).join("nodejs/node_modules"));}
 roots
}
fn codex_in_npm(root:&std::path::Path)->Option<PathBuf>{
 for target in ["x86_64-pc-windows-msvc","aarch64-pc-windows-msvc"]{
  let package=if target.starts_with("x86_64"){"codex-win32-x64"}else{"codex-win32-arm64"};
  for base in [root.join(format!("@openai/codex/node_modules/@openai/{package}")),root.join(format!("@openai/{package}")),root.join("@openai/codex")]{
   for path in [base.join(format!("vendor/{target}/bin/codex.exe")),base.join(format!("vendor/{target}/codex/codex.exe"))]{if path.is_file(){return Some(path)}}
  }
 }
 None
}
fn local_bin(name:&str)->Option<PathBuf>{home().ok().and_then(|root|[root.join(".local/bin").join(name),root.join("scoop/shims").join(name),root.join("bin").join(name)].into_iter().find(|p|p.is_file()))}
fn installed_codex()->Result<PathBuf,String>{
 find_on_path("codex.exe").or_else(||local_bin("codex.exe")).or_else(||npm_roots().iter().find_map(|p|codex_in_npm(p))).ok_or("Install the Codex CLI, then choose Detect CLI.".into())
}
fn codex_exe()->Result<PathBuf,String>{let c=crate::connections::config("codex")?;if !c.cli_path.is_empty(){return Ok(PathBuf::from(c.cli_path))}installed_codex()}
fn installed_claude()->Option<PathBuf>{
 find_on_path("claude.exe").or_else(||local_bin("claude.exe")).or_else(||npm_roots().iter().map(|root|root.join("@anthropic-ai/claude-code/cli.js")).find(|p|p.is_file()&&node_exe().is_some()))
}
fn installed_cursor()->Option<PathBuf>{
 if let Some(path)=find_on_path("cursor-agent.exe").or_else(||local_bin("cursor-agent.exe")){return Some(path)}
 let root=std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?.join("cursor-agent/versions");
 let mut dirs:Vec<_>=fs::read_dir(root).ok()?.filter_map(Result::ok).map(|e|e.path()).filter(|p|p.join("node.exe").is_file()&&p.join("index.js").is_file()).collect();dirs.sort();dirs.pop().map(|p|p.join("node.exe"))
}
fn node_exe()->Option<PathBuf>{
 find_on_path("node.exe").or_else(||std::env::var_os("ProgramFiles").map(PathBuf::from).map(|p|p.join("nodejs/node.exe")).filter(|p|p.is_file()))
}
pub fn detect_cli(provider:&str)->Option<PathBuf>{match provider{"codex"=>installed_codex().ok(),"claude"=>installed_claude(),"cursor"=>installed_cursor(),_=>None}}
pub fn session_found(provider:&str,c:&crate::connections::Config)->bool{
 let home=match home(){Ok(p)=>p,Err(_)=>return false};
 let dir=if c.config_dir.is_empty(){None}else{Some(PathBuf::from(&c.config_dir))};
 match provider{
  "codex"=>dir.or_else(||std::env::var_os("CODEX_HOME").map(PathBuf::from)).unwrap_or(home.join(".codex")).join("auth.json").is_file(),
  "claude"=>dir.or_else(||std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from)).unwrap_or(home.join(".claude")).join(".credentials.json").is_file(),
  "cursor"=>appdata().ok().is_some_and(|p|if c.source=="cli"{p.join("cursor/auth.json").is_file()}else{p.join("Cursor/User/globalStorage/state.vscdb").is_file()||p.join("cursor/auth.json").is_file()}),
  _=>false
 }
}
fn find_on_path(name:&str)->Option<PathBuf>{std::env::var_os("PATH").and_then(|paths|std::env::split_paths(&paths).map(|dir|dir.join(name)).find(|p|p.is_file()))}
struct CodexRpc { child:Child, incoming:mpsc::Receiver<Value>, next:u64 }
impl CodexRpc {
    fn start()->Result<Self,String>{
        let mut command=Command::new(codex_exe()?);let config=crate::connections::config("codex")?;if !config.config_dir.is_empty(){command.env("CODEX_HOME",config.config_dir);}command.arg("app-server").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());hide(&mut command);
        let mut child=command.spawn().map_err(|_|"Could not start the Codex account connection.")?;
        let stdout=child.stdout.take().ok_or("Codex account output is unavailable.")?;
        let (tx,rx)=mpsc::channel();
        std::thread::spawn(move||{for line in BufReader::new(stdout).lines().map_while(Result::ok){if line.len()>4*1024*1024{break}if let Ok(value)=serde_json::from_str::<Value>(&line){if tx.send(value).is_err(){break}}}});
        let mut rpc=Self{child,incoming:rx,next:1};
        rpc.call("initialize",json!({"clientInfo":{"name":"myfounderdock","version":"0.1.0"},"capabilities":{"experimentalApi":true}}))?;
        rpc.send(json!({"method":"initialized"}))?;Ok(rpc)
    }
    fn send(&mut self,value:Value)->Result<(),String>{let input=self.child.stdin.as_mut().ok_or("Codex connection closed.")?;writeln!(input,"{value}").and_then(|_|input.flush()).map_err(|_|"Could not contact the Codex account service.".into())}
    fn call(&mut self,method:&str,params:Value)->Result<Value,String>{
        let id=self.next;self.next+=1;self.send(json!({"id":id,"method":method,"params":params}))?;
        let deadline=Instant::now()+Duration::from_secs(25);
        loop{
            let left=deadline.saturating_duration_since(Instant::now());
            let value=self.incoming.recv_timeout(left).map_err(|_|"Codex did not respond. Check your sign-in and try again.")?;
            if value.get("id").and_then(Value::as_u64)==Some(id){
                if value.get("error").is_some(){return Err("Codex could not return this account data. Reconnect your ChatGPT account.".into())}
                return value.get("result").cloned().ok_or("Codex returned an unexpected response.".into());
            }
        }
    }
}
impl Drop for CodexRpc {fn drop(&mut self){let _=self.child.kill();let _=self.child.wait();}}
fn codex_window(id:&str,value:&Value)->Option<UsageWindow>{
    let used=number(value,"usedPercent")?;let mins=value.get("windowDurationMins").and_then(Value::as_u64);
    let label=match mins{Some(300)=>"5-hour limit".into(),Some(10080)=>"Weekly".into(),Some(m) if m>=40320=>"Monthly".into(),Some(m) if m%60==0=>format!("{}-hour limit",m/60),Some(m)=>format!("{m}-minute limit"),None=>"Usage limit".into()};
    Some(UsageWindow{id:id.into(),label,used_percent:used,resets_at:date(value,"resetsAt"),window_duration_mins:mins})
}
fn parse_codex(account:&Value,limits:&Value,tokens:Option<&Value>)->Result<AgentUsage,String>{
    let a=account.get("account").filter(|v|!v.is_null()).ok_or("Sign in to Codex with your ChatGPT account.")?;
    if a.get("type").and_then(Value::as_str)!=Some("chatgpt"){return Err("Connect a ChatGPT account to see Codex subscription limits. API-key usage is separate.".into())}
    let mut data=empty("codex","Codex account service");data.plan=string(a,"planType");
    let bucket=limits.pointer("/rateLimitsByLimitId/codex").or_else(||limits.get("rateLimits")).ok_or("Codex did not return usage limits.")?;
    for id in ["primary","secondary"]{if let Some(window)=bucket.get(id).and_then(|v|codex_window(id,v)){data.windows.push(window);}}
    if data.windows.is_empty(){return Err("Codex did not provide a current usage window.".into())}
    data.tokens=tokens.and_then(|v|v.get("summary")).map(|s|TokenSummary{lifetime_tokens:s.get("lifetimeTokens").and_then(Value::as_u64),peak_daily_tokens:s.get("peakDailyTokens").and_then(Value::as_u64),current_streak_days:s.get("currentStreakDays").and_then(Value::as_u64)});
    Ok(data)
}
fn read_codex()->Result<AgentUsage,String>{let mut rpc=CodexRpc::start()?;let account=rpc.call("account/read",json!({"refreshToken":false}))?;let limits=rpc.call("account/rateLimits/read",Value::Null)?;let tokens=rpc.call("account/usage/read",Value::Null).ok();parse_codex(&account,&limits,tokens.as_ref())}
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Could not start the account connection.".into())}
async fn response(response:reqwest::Response,provider:&str)->Result<Value,String>{
    if !response.status().is_success(){return Err(match response.status().as_u16(){401=>format!("{provider} rejected this sign-in. Reconnect your account."),403=>format!("This {provider} account does not allow access to usage data."),429=>format!("{provider} is rate limiting requests. Wait a minute before refreshing."),_=>format!("{provider} could not load usage. Try again shortly.")})}
    response.json().await.map_err(|_|format!("{provider} returned an unexpected usage response."))
}
fn parse_claude(value:&Value,oauth:&Value)->Result<AgentUsage,String>{
    let mut data=empty("claude","Claude Code account");data.plan=string(oauth,"subscriptionType").or_else(||string(value,"subscription_type"));
    for (id,label,mins) in [("five_hour","Session",300),("seven_day","Weekly",10080),("seven_day_opus","Opus",10080),("seven_day_sonnet","Sonnet",10080)]{
        if let Some(window)=value.get(id){if let Some(used)=number(window,"utilization"){data.windows.push(UsageWindow{id:id.into(),label:label.into(),used_percent:used,resets_at:date(window,"resets_at"),window_duration_mins:Some(mins)});}}
    }
    if let Some(limits)=value.get("limits").and_then(Value::as_array){for limit in limits{
        let kind=limit.get("kind").and_then(Value::as_str).unwrap_or("");
        let (id,label,mins)=match kind{"session"|"five_hour"=>("five_hour","Session",300),"weekly"|"weekly_all"|"seven_day"=>("seven_day","Weekly",10080),_=>("","",0)};
        if !id.is_empty()&&!data.windows.iter().any(|w|w.id==id){if let Some(used)=number(limit,"utilization").or_else(||number(limit,"used_percent")){data.windows.push(UsageWindow{id:id.into(),label:label.into(),used_percent:used,resets_at:date(limit,"resets_at"),window_duration_mins:Some(mins)});}}
    }}
    if data.windows.is_empty(){return Err("Claude did not provide current usage limits for this account.".into())}
    data.subscribed_at=date(value,"subscribed_at");data.last_charge_at=date(value,"last_charge_at");data.renews_at=date(value,"renews_at");Ok(data)
}
async fn read_claude()->Result<AgentUsage,String>{
    let config=crate::connections::config("claude")?;
    let dir=if config.config_dir.is_empty(){std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or(home()?.join(".claude"))}else{PathBuf::from(config.config_dir)};
    let credentials=read_json(&dir.join(".credentials.json"))?;let oauth=credentials.get("claudeAiOauth").ok_or("Sign in to Claude Code with your Claude subscription.")?;
    let token=oauth.get("accessToken").and_then(Value::as_str).filter(|s|!s.is_empty()).ok_or("No Claude subscription sign-in was found. Connect Claude.")?;
    let res=client()?.get("https://api.anthropic.com/api/oauth/usage").bearer_auth(token).header("anthropic-beta","oauth-2025-04-20").send().await.map_err(|_|"Could not reach Claude. Check your connection.")?;
    parse_claude(&response(res,"Claude").await?,oauth)
}
fn cursor_cli_token()->Result<String,String>{let value=read_json(&appdata()?.join("cursor/auth.json"))?;string(&value,"accessToken").ok_or("Sign in to Cursor to connect your account.".into())}
fn cursor_editor()->Result<(String,Option<String>,Option<String>),String>{
    let path=appdata()?.join("Cursor/User/globalStorage/state.vscdb");
    let db=rusqlite::Connection::open_with_flags(path,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY|rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|_|"Open Cursor and sign in, then connect your account.")?;
    db.busy_timeout(Duration::from_secs(2)).map_err(|_|"Cursor's sign-in store is busy.")?;
    let item=|key:&str|->Option<String>{db.query_row("SELECT value FROM ItemTable WHERE key=?1",[key],|r|r.get(0)).ok()};
    let token=item("cursorAuth/accessToken").filter(|s|!s.is_empty()).ok_or("No signed-in Cursor account was found.")?;
    Ok((token,None,item("cursorAuth/stripeMembershipType")))
}
fn cursor_subject(token:&str)->Result<String,String>{
    let payload=token.split('.').nth(1).ok_or("Cursor's saved account is invalid. Reconnect Cursor.")?;
    let bytes=URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).map_err(|_|"Cursor's saved account is invalid. Reconnect Cursor.")?;
    let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Cursor's saved account is invalid. Reconnect Cursor.")?;
    string(&value,"sub").filter(|s|s.len()<300&&!s.contains(['\r','\n',';'])).ok_or("Cursor's account identifier is missing. Reconnect Cursor.".into())
}
fn parse_cursor(value:&Value,account:Option<String>,saved_plan:Option<String>,source:&str)->Result<AgentUsage,String>{
    let mut data=empty("cursor",source);data.plan=string(value,"membershipType").or(saved_plan);let _=account;
    data.period_start=date(value,"billingCycleStart");data.period_end=date(value,"billingCycleEnd");
    let plan=value.pointer("/individualUsage/plan").ok_or("Cursor did not return individual usage for this account.")?;
    if let Some(used)=number(plan,"totalPercentUsed") {data.windows.push(UsageWindow{id:"cycle".into(),label:"Current cycle".into(),used_percent:used,resets_at:data.period_end.clone(),window_duration_mins:None});}
    if let Some(used)=number(plan,"apiPercentUsed").filter(|n|*n>0.){data.windows.push(UsageWindow{id:"api".into(),label:"API usage".into(),used_percent:used,resets_at:data.period_end.clone(),window_duration_mins:None});}
    data.last_charge_at=date(value,"lastPaymentDate");data.subscribed_at=date(value,"subscriptionStartDate");
    data.renews_at=date(value,"nextPaymentDate");
    Ok(data)
}
async fn read_cursor()->Result<AgentUsage,String>{
    let choice=crate::connections::config("cursor")?.source;
    let (token,account,plan,source)=match choice.as_str(){
      "cli"=>(cursor_cli_token()?,None,None,"Cursor Agent account"),
      "editor"=>{let(t,a,p)=cursor_editor()?;(t,a,p,"Cursor editor account")},
      _=>match cursor_editor(){Ok((t,a,p))=>(t,a,p,"Cursor editor account"),Err(_)=>(cursor_cli_token()?,None,None,"Cursor Agent account")}
    };
    let subject=cursor_subject(&token)?;
    let res=client()?.get("https://cursor.com/api/usage-summary").header("Cookie",format!("WorkosCursorSessionToken={subject}::{token}")).header("Accept","application/json").send().await.map_err(|_|"Could not reach Cursor. Check your connection.")?;
    parse_cursor(&response(res,"Cursor").await?,account,plan,source)
}
fn apply_billing_config(data:&mut AgentUsage,config:&crate::connections::Config){
 let mut manual=false;
 for (target,configured) in [(&mut data.subscribed_at,&config.subscribed_at),(&mut data.last_charge_at,&config.last_charge_at),(&mut data.renews_at,&config.next_billing_at)] {
  if target.is_none()&&!configured.is_empty(){*target=Some(configured.clone());manual=true;}
 }
 if manual{data.billing_source="settings".into();}
}
type UsageCache=HashMap<String,(Instant,AgentUsage)>;
static CACHE:OnceLock<Mutex<UsageCache>>=OnceLock::new();
pub fn clear_cache(provider:&str){if let Some(cache)=CACHE.get(){if let Ok(mut data)=cache.lock(){data.retain(|key,_|!key.starts_with(&format!("{provider}:")));}}}
#[tauri::command]
pub async fn load_agent_usage(window:tauri::WebviewWindow,provider:String,refresh:Option<bool>)->Result<AgentUsage,String>{
    if !["main","settings"].contains(&window.label()){return Err("Open account usage from the dock.".into())}validate_provider(&provider)?;
    let account_config=crate::connections::config(&provider)?;
    if !account_config.enabled{return Err("Choose your account source in Settings to connect this provider.".into())}
    let cache_key=format!("{}:{}",provider,account_config.revision);
    let cache=CACHE.get_or_init(||Mutex::new(HashMap::new()));
    if refresh!=Some(true){if let Some((at,data))=cache.lock().map_err(|_|"Account cache unavailable.")?.get(&cache_key){if at.elapsed()<Duration::from_secs(60){return Ok(data.clone())}}}
    let mut result=match provider.as_str(){"codex"=>tauri::async_runtime::spawn_blocking(read_codex).await.map_err(|_|"Could not read the Codex account.")?,"claude"=>read_claude().await,"cursor"=>read_cursor().await,_=>unreachable!()}?;
    apply_billing_config(&mut result,&account_config);
    cache.lock().map_err(|_|"Account cache unavailable.")?.insert(cache_key,(Instant::now(),result.clone()));Ok(result)
}
fn login_command(provider:&str)->Result<Command,String>{
 let config=crate::connections::config(provider)?;
 let cli=if config.cli_path.is_empty(){detect_cli(provider).ok_or("No CLI was detected. Install it, then choose Detect CLI in Settings.")?}else{PathBuf::from(&config.cli_path)};
 let mut command=if cli.extension().is_some_and(|ext|ext=="js"){
  let mut command=Command::new(node_exe().ok_or("Install Node.js to use this CLI installation.")?);command.arg(&cli);command
 }else{Command::new(&cli)};
 match provider{
  "codex"=>{command.arg("login");if !config.config_dir.is_empty(){command.env("CODEX_HOME",&config.config_dir);}},
  "claude"=>{command.args(["auth","login","--claudeai"]);if !config.config_dir.is_empty(){command.env("CLAUDE_CONFIG_DIR",&config.config_dir);}},
  "cursor"=>{if cli.file_name().is_some_and(|n|n=="node.exe"){let script=cli.parent().ok_or("Cursor Agent path is invalid.")?.join("index.js");if !script.is_file(){return Err("The Cursor Agent script was not found beside node.exe.".into())}command.arg(script);}command.arg("login");},
  _=>return Err("Unknown AI provider.".into())
 }
 hide(&mut command);command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());Ok(command)
}
static LOGINS:OnceLock<Mutex<HashSet<String>>>=OnceLock::new();
#[tauri::command]
pub async fn login_agent(window:tauri::WebviewWindow,provider:String)->Result<(),String>{
    if !["main","settings"].contains(&window.label()){return Err("Connect your account from the app.".into())}validate_provider(&provider)?;
    if !crate::connections::config(&provider)?.enabled{return Err("Save this account configuration in Settings before signing in.".into())}
    let logins=LOGINS.get_or_init(||Mutex::new(HashSet::new()));
    if !logins.lock().map_err(|_|"Account connection unavailable.")?.insert(provider.clone()){return Err("A sign-in is already open for this provider.".into())}
    let target=provider.clone();
    let result=tauri::async_runtime::spawn_blocking(move||{
        let mut child=login_command(&target)?.spawn().map_err(|_|"Could not open the provider's sign-in flow.")?;
        let start=Instant::now();
        loop{
            match child.try_wait(){Ok(Some(status))=>{if !status.success(){return Err("Sign-in was not completed. Try connecting again.".into())}break},Ok(None)=>{},Err(_)=>{let _=child.kill();let _=child.wait();return Err("Could not finish provider sign-in.".into())}}
            if start.elapsed()>Duration::from_secs(300){let _=child.kill();let _=child.wait();return Err("Sign-in timed out. Connect again to retry.".into())}
            std::thread::sleep(Duration::from_millis(250));
        }
        if target=="cursor"{crate::connections::set_cursor_source("cli")?;}
        Ok(())
    }).await.map_err(|_|"The provider sign-in flow stopped unexpectedly.".to_owned()).and_then(|r|r);
    if let Ok(mut data)=logins.lock(){data.remove(&provider);}
    if result.is_ok(){clear_cache(&provider);}result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn detects_codex_in_hoisted_and_nested_npm_installs(){
        let root=std::env::temp_dir().join(format!("myfounderdock-detection-{}-{}",std::process::id(),now()));
        let nested=root.join("@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe");
        fs::create_dir_all(nested.parent().unwrap()).unwrap();fs::write(&nested,b"test fixture, never executed").unwrap();assert_eq!(codex_in_npm(&root),Some(nested.clone()));
        fs::remove_file(&nested).unwrap();
        let hoisted=root.join("@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe");
        fs::create_dir_all(hoisted.parent().unwrap()).unwrap();fs::write(&hoisted,b"test fixture, never executed").unwrap();assert_eq!(codex_in_npm(&root),Some(hoisted.clone()));
        fs::remove_file(&hoisted).unwrap();assert!(codex_in_npm(&root).is_none());
    }
    #[test]fn codex_windows_use_reported_durations(){let a=json!({"account":{"type":"chatgpt","planType":"plus","email":"private@example.test"}});let l=json!({"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":0,"windowDurationMins":300,"resetsAt":1800000000},"secondary":{"usedPercent":45,"windowDurationMins":10080}}}});let d=parse_codex(&a,&l,None).unwrap();assert_eq!(d.windows[0].label,"5-hour limit");assert_eq!(d.windows[0].used_percent,0.);assert!(d.account.is_none());assert!(d.last_charge_at.is_none());}
    #[test]fn claude_null_windows_are_not_zero(){let d=parse_claude(&json!({"five_hour":{"utilization":12.5,"resets_at":"2026-10-28T12:00:00Z"},"seven_day_opus":null}),&json!({"subscriptionType":"max"})).unwrap();assert_eq!(d.windows.len(),1);assert_eq!(d.windows[0].used_percent,12.5);assert!(d.renews_at.is_none());}
    #[test]fn cursor_free_cycle_is_not_a_paid_renewal(){let d=parse_cursor(&json!({"membershipType":"free","billingCycleEnd":"2026-11-19T21:00:00Z","individualUsage":{"plan":{"totalPercentUsed":0}}}),None,None,"Cursor").unwrap();assert_eq!(d.windows[0].used_percent,0.);assert!(d.renews_at.is_none());assert!(d.period_end.is_some());}
    #[test]fn cursor_cycle_end_does_not_invent_a_payment_date(){let d=parse_cursor(&json!({"membershipType":"pro","billingCycleEnd":"2026-11-19T21:00:00Z","individualUsage":{"plan":{"totalPercentUsed":24}}}),None,None,"Cursor").unwrap();assert!(d.renews_at.is_none());assert!(d.last_charge_at.is_none());assert!(d.period_end.is_some());}
    #[test]fn cursor_account_id_is_decoded_locally(){let payload=URL_SAFE_NO_PAD.encode(br#"{"sub":"test-user"}"#);assert_eq!(cursor_subject(&format!("head.{payload}.signature")).unwrap(),"test-user");}
    #[test]fn manual_billing_dates_fill_only_missing_provider_fields(){let mut d=empty("codex","test");d.last_charge_at=Some("provider-value".into());let config=crate::connections::Config{subscribed_at:"2026-01-01T00:00:00Z".into(),last_charge_at:"manual-value".into(),next_billing_at:"2026-12-01T00:00:00Z".into(),..Default::default()};apply_billing_config(&mut d,&config);assert_eq!(d.last_charge_at.as_deref(),Some("provider-value"));assert_eq!(d.renews_at.as_deref(),Some("2026-12-01T00:00:00Z"));assert_eq!(d.billing_source,"settings");}
    #[test]fn rejects_unrecognized_provider(){assert!(validate_provider("codex").is_ok());assert!(validate_provider("../x").is_err());}
    #[test]#[ignore="Reads existing local Codex sign-in; never prints credentials"]fn live_codex(){let d=read_codex().expect("Codex account read failed");assert!(!d.windows.is_empty());println!("Verified Codex plan and live quota windows.");}
    #[test]#[ignore="Reads existing local Cursor sign-in; never prints credentials"]fn live_cursor(){let d=tauri::async_runtime::block_on(read_cursor()).expect("Cursor account read failed");assert!(d.plan.is_some());println!("Verified Cursor account and billing cycle.");}
    #[test]#[ignore="Requires a current Claude Code sign-in"]fn live_claude(){let d=tauri::async_runtime::block_on(read_claude()).expect("Claude account read failed");assert!(!d.windows.is_empty());println!("Verified Claude subscription usage.");}
}
