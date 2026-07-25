//! Minimal wrapper over the `keyring` crate.
//!
//! This is the only place the Anthropic API key is handled on the Rust side.
//! It is hand-rolled rather than delegated to a plugin: Tauri has no official
//! keyring plugin, community ones are single-maintainer, and Stronghold is
//! being deprecated. Keeping it to three commands keeps the
//! security-sensitive surface small enough to read in one sitting.
//!
//! The key is never logged, never returned in an error message, and never
//! written anywhere but the OS keyring.

use keyring::Entry;

const SERVICE: &str = "app.readingcoach.desktop";
const USERNAME: &str = "anthropic-api-key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, USERNAME).map_err(|e| format!("keyring unavailable: {e}"))
}

#[tauri::command]
pub fn get_api_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read key: {e}")),
    }
}

#[tauri::command]
pub fn set_api_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("api key is empty".into());
    }
    entry()?
        .set_password(&api_key)
        .map_err(|e| format!("could not store key: {e}"))
}

#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not delete key: {e}")),
    }
}
