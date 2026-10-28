#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
use tauri::Manager;
use std::sync::Mutex;
mod docking;
mod polar;
mod vercel;
mod trustmrr;
mod agent_usage;
mod connections;
use connections::{get_connection,save_connection,open_provider_help};
use agent_usage::{load_agent_usage,login_agent};
use trustmrr::load_trustmrr_startup;
use vercel::{load_vercel_projects, load_vercel_analytics};
use polar::{load_polar_orders};
use docking::{DockState,set_expanded,drag_dock,move_dock};

#[tauri::command]
fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("settings").ok_or("Settings window is missing")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
fn hide_settings(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("settings").ok_or("Settings window is missing")?.hide().map_err(|e| e.to_string())
}
#[tauri::command]
fn quit_dock(app: tauri::AppHandle) { app.exit(0); }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(DockState::default()))
        .invoke_handler(tauri::generate_handler![set_expanded, drag_dock, move_dock, load_polar_orders, load_vercel_projects, load_vercel_analytics, load_trustmrr_startup, load_agent_usage, login_agent, get_connection, save_connection, open_provider_help, open_settings, hide_settings, quit_dock])
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Unable to start myfounderdock");
}
