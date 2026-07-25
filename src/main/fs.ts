import { open } from '@tauri-apps/plugin-dialog';
import { readFile, readTextFile } from '@tauri-apps/plugin-fs';

// The only module allowed to reach the filesystem. Everything above it works
// with bytes and strings.

export interface PickedBook {
  path: string;
  fileName: string;
  format: 'epub' | 'txt';
}

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export async function pickBookFile(): Promise<PickedBook | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Books', extensions: ['epub', 'txt'] }],
  });
  if (typeof selected !== 'string') return null;

  const fileName = fileNameOf(selected);
  return {
    path: selected,
    fileName,
    format: fileName.toLowerCase().endsWith('.txt') ? 'txt' : 'epub',
  };
}

export function readBookBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}

export function readBookText(path: string): Promise<string> {
  return readTextFile(path);
}

/** Strips the extension so an imported file has a usable fallback title. */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.(epub|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
}
