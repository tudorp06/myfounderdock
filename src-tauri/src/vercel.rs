use serde::{Deserialize, Serialize};
use std::{time::Duration};

fn scope(team_id: Option<String>) -> Result<Option<String>, String> {
    let id = team_id.filter(|s| !s.trim().is_empty()).or_else(|| crate::connections::config("vercel").ok().map(|c|c.team_id).filter(|s|!s.is_empty()));
    if let Some(ref value) = id { validate_id(value)?; }
    Ok(id)
}
fn validate_id(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 120 || !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Invalid Vercel project or team ID.".into());
    }
    Ok(())
}
async fn request(path: &str, query: Vec<(&str, String)>) -> Result<serde_json::Value, String> {
    let token = crate::connections::token("vercel")?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "Could not start the Vercel connection.")?;
    let response = client.get(format!("https://api.vercel.com{path}")).bearer_auth(token).query(&query).send().await.map_err(|_| "Could not reach Vercel. Check your connection and try again.")?;
    if !response.status().is_success() { return Err(match response.status().as_u16() {
        401 => "Vercel rejected the token. Check VERCEL_ACCESS_TOKEN.",
        402 => "Your Vercel plan does not allow this analytics request.",
        403 => "The token cannot access this project or team. Check its scope and your Team ID.",
        404 => "Vercel could not find this project or its analytics. Check the selection and enable Web Analytics.",
        429 => "Vercel is rate limiting requests. Try again shortly.",
        _ => "Vercel could not load this data. Please try again."
    }.into()); }
    response.json().await.map_err(|_| "Vercel returned an unexpected response.".into())
}
#[derive(Deserialize, Serialize)]
pub struct Project { id: String, name: String }
#[derive(Deserialize)]
struct ProjectPage { projects: Vec<Project>, pagination: Option<Pagination> }
#[derive(Deserialize)]
struct Pagination { next: Option<u64> }
#[derive(Deserialize, Serialize)]
pub struct Traffic { visitors: u64, pageviews: u64 }
fn parse_traffic(value: serde_json::Value) -> Result<Traffic, String> {
    serde_json::from_value(value.get("data").cloned().unwrap_or_default()).map_err(|_| "Vercel did not return visitor and page-view totals.".into())
}
#[tauri::command]
pub async fn load_vercel_projects(team_id: Option<String>) -> Result<Vec<Project>, String> {
    let team = scope(team_id)?;
    let mut projects = Vec::new();
    let mut cursor = None;
    for _ in 0..20 {
        let mut query = vec![("limit", "100".to_owned())];
        if let Some(ref id) = team { query.push(("teamId", id.clone())); }
        if let Some(value) = cursor { query.push(("until", format!("{value}"))); }
        let page: ProjectPage = serde_json::from_value(request("/v10/projects", query).await?).map_err(|_| "Vercel returned an unexpected project list.")?;
        projects.extend(page.projects);
        let next = page.pagination.and_then(|p| p.next);
        if next.is_none() || next == cursor { break; }
        cursor = next;
    }
    projects.sort_by(|a,b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    projects.dedup_by(|a,b| a.id == b.id);
    Ok(projects)
}
#[tauri::command]
pub async fn load_vercel_analytics(project_id: String, team_id: Option<String>) -> Result<Traffic, String> {
    validate_id(&project_id)?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "Check your computer clock.")?.as_millis();
    let mut query = vec![("projectId", project_id), ("since", now.saturating_sub(30*24*60*60*1000).to_string()), ("until", now.to_string())];
    if let Some(team) = scope(team_id)? { query.push(("teamId", team)); }
    parse_traffic(request("/v1/query/web-analytics/visits/count", query).await?)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn reads_real_totals_including_zero() {
        let data = parse_traffic(serde_json::json!({"data":{"visitors":0,"pageviews":12},"query":{}})).unwrap();
        assert_eq!(data.visitors,0); assert_eq!(data.pageviews,12);
    }
    #[test] fn missing_totals_are_an_error() { assert!(parse_traffic(serde_json::json!({"data":{}})).is_err()); }
    #[test] fn rejects_invalid_identifiers() { assert!(validate_id("prj_valid123").is_ok()); assert!(validate_id("../other?token=x").is_err()); }
}
