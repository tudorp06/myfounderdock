use serde::{Deserialize, Serialize};
use std::{time::Duration};

#[derive(Deserialize)]
struct ApiPage { items: Vec<ApiOrder> }
#[derive(Deserialize)]
struct ApiOrder {
    id: String, created_at: String, total_amount: i64, currency: String, paid: bool,
    #[serde(default)] product_id: Option<String>,
    #[serde(default)] product: Option<ApiProduct>,
    #[serde(default)] customer: Option<ApiCustomer>,
    #[serde(default)] refunded_amount: i64,
}
#[derive(Deserialize)]
struct ApiProduct { id: String, name: String }
#[derive(Deserialize)]
struct ApiCustomer { name: Option<String> }
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct Purchase {
    id: String, created_at: String, total_amount: i64, currency: String,
    product_id: String, product_name: String, customer_name: String, refunded_amount: i64,
}
fn access_token()->Result<String,String>{crate::connections::token("polar")}
fn purchases(page:ApiPage)->Vec<Purchase>{
    page.items.into_iter().filter(|order|order.paid).map(|order|{
        let (product_id,product_name)=order.product.map(|p|(p.id,p.name)).unwrap_or((order.product_id.unwrap_or_default(),"Product".into()));
        let customer_name=order.customer.and_then(|c|c.name).filter(|name|!name.trim().is_empty()).unwrap_or("Customer".into());
        Purchase{id:order.id,created_at:order.created_at,total_amount:order.total_amount,currency:order.currency,product_id,product_name,customer_name,refunded_amount:order.refunded_amount}
    }).collect()
}
async fn request_orders(product_id:Option<String>)->Result<Vec<Purchase>,String>{
    let token=access_token()?;
    let client=reqwest::Client::builder().timeout(Duration::from_secs(20)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Could not start the Polar connection.")?;
    let mut request=client.get("https://api.polar.sh/v1/orders/").bearer_auth(token).header("Accept","application/json").query(&[("limit","100"),("sorting","-created_at")]);
    if let Some(id)=product_id.filter(|id|!id.is_empty()){
        if id.len()>100||!id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_'){return Err("Invalid product selection.".into())}
        request=request.query(&[("product_id",id)]);
    }
    let response=request.send().await.map_err(|error|if error.is_timeout(){"Polar took too long to respond. Try again.".to_owned()}else{"Could not reach Polar. Check your connection and try again.".to_owned()})?;
    let status=response.status();
    if !status.is_success(){return Err(match status.as_u16(){401=>"Polar rejected the token. Update it in Settings.",403=>"Your Polar token needs the orders:read scope.",429=>"Polar is rate limiting requests. Please try again shortly.",_=>"Polar could not load purchases. Please try again."}.into())}
    let page=response.json::<ApiPage>().await.map_err(|_|"Polar returned an unexpected response. Please try again.")?;
    Ok(purchases(page))
}
#[tauri::command]
pub async fn load_polar_orders(window:tauri::WebviewWindow,product_id:Option<String>)->Result<Vec<Purchase>,String>{
    if !["main","settings"].contains(&window.label()){return Err("Open purchases from the dock.".into())}
    request_orders(product_id).await
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn returns_only_paid_orders_and_only_display_fields(){
        let page:ApiPage=serde_json::from_str(r#"{"items":[{"id":"a","created_at":"2026-10-27T12:00:00Z","total_amount":300,"currency":"usd","paid":true,"product":{"id":"p","name":"Product"},"customer":{"name":"Test Buyer","email":"private@example.test"}},{"id":"b","created_at":"2026-10-26T12:00:00Z","total_amount":300,"currency":"usd","paid":false}]}"#).unwrap();
        let orders=purchases(page);assert_eq!(orders.len(),1);assert_eq!(orders[0].customer_name,"Test Buyer");
        let output=serde_json::to_string(&orders).unwrap();assert!(!output.contains("email"));assert!(!output.contains("private@example.test"));assert!(!output.contains("token"));
    }
    #[test] fn handles_deleted_customer_and_product(){
        let page:ApiPage=serde_json::from_str(r#"{"items":[{"id":"a","created_at":"2026-10-27T12:00:00Z","total_amount":300,"currency":"usd","paid":true,"product":null,"customer":null}]}"#).unwrap();
        let orders=purchases(page);assert_eq!(orders[0].customer_name,"Customer");assert_eq!(orders[0].product_name,"Product");
    }
    #[test] #[ignore="Uses the configured local Polar token; returns only aggregate counts"]
    fn configured_token_lists_existing_purchases(){
        let orders=tauri::async_runtime::block_on(request_orders(None)).expect("Polar request failed");
        println!("Loaded {} paid purchases.",orders.len());
        assert!(orders.windows(2).all(|pair|pair[0].created_at>=pair[1].created_at));
    }
}
