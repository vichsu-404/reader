import { invoke } from '@tauri-apps/api/core';

// Thin wrapper over the hand-rolled Rust keyring command. The API key lives in
// the OS keyring and nowhere else — never the database, a config file, or a log.

export function loadApiKey(): Promise<string | null> {
  return invoke<string | null>('get_api_key');
}

export function saveApiKey(apiKey: string): Promise<void> {
  return invoke<void>('set_api_key', { apiKey });
}

export function deleteApiKey(): Promise<void> {
  return invoke<void>('delete_api_key');
}
