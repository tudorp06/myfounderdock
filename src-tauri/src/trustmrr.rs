use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Mutex, OnceLock}, time::{Duration, Instant}};


#[derive(Clone, Deserialize, Serialize)]
pub struct Revenue {
    #[serde(rename="last30Days")] last_30_days: f64,
    mrr: f64,
    total: f64,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Startup {
    name: String, slug: String, revenue: Revenue,
    #[serde(default)] icon:Option<String>,
    #[serde(default)] website:Option<String>,
    #[serde(default)] customers: Option<u64>,
    #[serde(default, rename="activeSubscriptions")] active_subscriptions: Option<u64>,
    #[serde(default, rename="growth30d")] growth_30d: Option<f64>,
}
#[derive(Deserialize)]
struct ApiResponse { data: Startup }
type Cache = HashMap<String, (Instant, Startup)>;
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
fn normalize_slug(value: &str) -> Result<String, String> {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() || value.len() > 100 || !value.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Enter a valid TrustMRR startup slug.".into());
    }
    Ok(value)
}
fn parse_startup(value: serde_json::Value) -> Result<Startup,String> {
    let response: ApiResponse = serde_json::from_value(value).map_err(|_| "TrustMRR returned an unexpected startup response.")?;
    if response.data.name.trim().is_empty() || response.data.slug.trim().is_empty() {
        return Err("TrustMRR returned incomplete startup details.".into());
    }
    Ok(response.data)
}
async fn request_startup(slug: &str) -> Result<Startup,String> {
    let token=crate::connections::token("trustmrr")?;
    let client=reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "Could not start the TrustMRR connection.")?;
    let response=client.get(format!("https://trustmrr.com/api/v1/startups/{slug}")).bearer_auth(token).header("Accept","application/json").send().await.map_err(|_| "Could not reach TrustMRR. Check your connection and try again.")?;
    if !response.status().is_success() {return Err(match response.status().as_u16(){
        401=>"TrustMRR rejected the API key. Update it in Settings.",
        403=>"Your TrustMRR API key cannot access this startup.",
        404=>"This startup was not found on TrustMRR. Check its slug.",
        429=>"TrustMRR is rate limiting requests. Wait a minute before refreshing.",
        _=>"TrustMRR could not load startup data. Try again."
    }.into());}
    let value=response.json().await.map_err(|_| "TrustMRR returned an unreadable response.")?;
    parse_startup(value)
}
pub fn clear_cache(){if let Some(cache)=CACHE.get(){if let Ok(mut data)=cache.lock(){data.clear();}}}
#[tauri::command]
pub async fn load_trustmrr_startup(window:tauri::WebviewWindow,startup_slug:String,refresh:Option<bool>)->Result<Startup,String>{
    if !["main","settings"].contains(&window.label()) {return Err("Open TrustMRR from the dock.".into());}
    let _=crate::connections::token("trustmrr")?;
    let slug=normalize_slug(&startup_slug)?;
    let cache=CACHE.get_or_init(||Mutex::new(HashMap::new()));
    {
        let data=cache.lock().map_err(|_| "TrustMRR cache unavailable.")?;
        if let Some((time,startup))=data.get(&slug){if refresh!=Some(true)&&time.elapsed()<Duration::from_secs(60){return Ok(startup.clone());}}
    }
    let startup=request_startup(&slug).await?;
    let mut data=cache.lock().map_err(|_| "TrustMRR cache unavailable.")?;
    data.retain(|_,(time,_)|time.elapsed()<Duration::from_secs(60));
    data.insert(slug,(Instant::now(),startup.clone()));
    Ok(startup)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn validates_startup_slug(){assert_eq!(normalize_slug(" BuildNotch ").unwrap(),"buildnotch");assert!(normalize_slug("../other?key=x").is_err());assert!(normalize_slug("").is_err());}
    #[test] fn preserves_decimal_revenue_and_zero_mrr(){
        let value=serde_json::json!({"data":{"name":"Demo","slug":"demo","revenue":{"last30Days":78.67,"mrr":0,"total":94.09},"privateField":"ignored"}});
        let startup=parse_startup(value).unwrap();assert_eq!(startup.revenue.last_30_days,78.67);assert_eq!(startup.revenue.mrr,0.);
        assert!(!serde_json::to_string(&startup).unwrap().contains("privateField"));
    }
    #[test] fn startup_icon_is_a_nullable_url(){let s=parse_startup(serde_json::json!({"data":{"name":"Example","slug":"example","icon":"https://cdn.trustmrr.com/example.png","revenue":{"last30Days":1,"mrr":0,"total":1}}})).unwrap();assert_eq!(s.icon.as_deref(),Some("https://cdn.trustmrr.com/example.png"));}
    #[test] fn missing_revenue_is_an_error(){assert!(parse_startup(serde_json::json!({"data":{"name":"Demo","slug":"demo"}})).is_err());}
    #[test] #[ignore="Uses the locally configured TrustMRR API key without displaying it"]
    fn configured_token_fetches_buildnotch(){
        let startup=tauri::async_runtime::block_on(request_startup("buildnotch")).expect("TrustMRR request failed");
        assert_eq!(startup.slug,"buildnotch");assert!(startup.revenue.total.is_finite());
        println!("Verified live TrustMRR startup and revenue response.");
    }
}
