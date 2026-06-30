use keyring::Entry;
use serde_json::{json, Value};
use std::{
    env, fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::{path::BaseDirectory, Manager};

#[tauri::command]
fn analyze_codebase(app: tauri::AppHandle, root: String) -> Result<Value, String> {
    analyze_root(app, root)
}

#[tauri::command]
fn analyze_sample_codebase(app: tauri::AppHandle) -> Result<Value, String> {
    let root = sample_root(&app)?.to_string_lossy().to_string();
    analyze_root(app, root)
}

fn analyze_root(app: tauri::AppHandle, root: String) -> Result<Value, String> {
    let out = env::temp_dir().join("cobolens-graph.json");
    let analyzer = analyzer_binary_path(&app)?;
    let mut child = Command::new(analyzer)
        .args([
            "--root",
            &root,
            "--out",
            out.to_string_lossy().as_ref(),
            "--format",
            "auto",
            "--ext",
            ".cbl,.cob,.cpy,.jcl",
            "--encoding",
            "utf8",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("failed to spawn analyzer sidecar: {err}"))?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = line.map_err(|err| err.to_string())?;
            println!("cobolens-analyze: {line}");
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|err| format!("failed to wait for analyzer sidecar: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("analyzer sidecar failed: {stderr}"));
    }

    let json = fs::read_to_string(&out).map_err(|err| err.to_string())?;
    serde_json::from_str(&json).map_err(|err| err.to_string())
}

fn sample_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = app
        .path()
        .resolve("samples/mini-bank", BaseDirectory::Resource)
    {
        if path.exists() {
            return Ok(path);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_sample = manifest_dir
        .parent()
        .unwrap_or(&manifest_dir)
        .join("samples")
        .join("mini-bank");
    if dev_sample.exists() {
        return Ok(dev_sample);
    }

    Err("bundled sample codebase was not found".to_string())
}

#[tauri::command]
fn read_source_snippet(root: String, file: String, line: usize) -> Result<Value, String> {
    let path = safe_source_path(&root, &file)?;
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let target = line.max(1);
    let start = target.saturating_sub(8).max(1);
    let end = (target + 8).min(lines.len().max(1));
    let snippet_lines: Vec<Value> = (start..=end)
        .map(|number| {
            json!({
                "number": number,
                "text": lines.get(number - 1).copied().unwrap_or_default(),
            })
        })
        .collect();

    Ok(json!({
        "file": file,
        "startLine": start,
        "highlightLine": target,
        "lines": snippet_lines,
    }))
}

#[tauri::command]
fn read_source_excerpt(
    root: String,
    file: String,
    start_line: usize,
    end_line: usize,
    max_lines: usize,
) -> Result<Value, String> {
    let path = safe_source_path(&root, &file)?;
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let start = start_line.max(1);
    let requested_end = end_line.max(start);
    let max_end = lines.len().max(1);
    let end = requested_end.min(max_end);
    let capped_end = (start + max_lines.saturating_sub(1)).min(end);
    let excerpt = (start..=capped_end)
        .map(|number| {
            format!(
                "{}: {}",
                number,
                lines.get(number - 1).copied().unwrap_or_default()
            )
        })
        .collect::<Vec<String>>()
        .join("\n");

    Ok(json!({
        "file": file,
        "startLine": start,
        "endLine": capped_end,
        "truncated": capped_end < end,
        "text": excerpt,
    }))
}

#[tauri::command]
fn write_export_files(
    output_dir: String,
    prefix: String,
    markdown: String,
    mermaid: String,
    png: Vec<u8>,
) -> Result<String, String> {
    let output_dir = PathBuf::from(output_dir)
        .canonicalize()
        .map_err(|err| format!("export folder is unavailable: {err}"))?;
    if !output_dir.is_dir() {
        return Err("export destination must be a folder".to_string());
    }

    if png.len() < 8 || &png[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("export PNG payload was invalid".to_string());
    }

    let prefix = safe_export_prefix(&prefix)?;
    let markdown_path = output_dir.join(format!("{prefix}.md"));
    let mermaid_path = output_dir.join(format!("{prefix}.mmd"));
    let png_path = output_dir.join(format!("{prefix}.png"));

    fs::write(&markdown_path, markdown).map_err(|err| err.to_string())?;
    fs::write(&mermaid_path, mermaid).map_err(|err| err.to_string())?;
    fs::write(&png_path, png).map_err(|err| err.to_string())?;

    Ok(output_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn save_provider_key(provider: String, api_key: String) -> Result<(), String> {
    provider_key_entry(&provider)?
        .set_password(&api_key)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn read_provider_key(provider: String) -> Result<String, String> {
    provider_key_entry(&provider)?
        .get_password()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn provider_key_state(provider: String) -> Result<bool, String> {
    match provider_key_entry(&provider)?.get_password() {
        Ok(value) => Ok(!value.is_empty()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn clear_provider_key(provider: String) -> Result<(), String> {
    match provider_key_entry(&provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(_) => Ok(()),
    }
}

fn provider_key_entry(provider: &str) -> Result<Entry, String> {
    let account = match provider {
        "anthropic" => "anthropic-api-key",
        "openai" => "openai-api-key",
        "openrouter" => "openrouter-api-key",
        "ollama" => "ollama-api-key",
        _ => return Err("unknown model provider".to_string()),
    };
    Entry::new("Cobolens", account).map_err(|err| err.to_string())
}

fn safe_source_path(root: &str, file: &str) -> Result<PathBuf, String> {
    let root_path = PathBuf::from(root);
    let file_path = Path::new(file);
    if file_path.is_absolute() {
        return Err("source file path must be relative to the selected root".to_string());
    }

    let root_canonical = root_path.canonicalize().map_err(|err| err.to_string())?;
    let source_path = root_canonical.join(file_path);
    let source_canonical = source_path.canonicalize().map_err(|err| err.to_string())?;
    if !source_canonical.starts_with(&root_canonical) {
        return Err("source file resolved outside the selected root".to_string());
    }
    Ok(source_canonical)
}

fn safe_export_prefix(prefix: &str) -> Result<String, String> {
    let stem = prefix
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(80)
        .collect::<String>();

    if stem.is_empty() {
        return Err("export filename prefix was empty".to_string());
    }

    Ok(stem)
}

fn analyzer_binary_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = env::var("COBOLENS_ANALYZE_BIN") {
        return Ok(PathBuf::from(path));
    }

    let current_exe = env::current_exe().map_err(|err| err.to_string())?;
    let exe_name = if cfg!(windows) {
        "cobolens-analyze.exe"
    } else {
        "cobolens-analyze"
    };

    if let Ok(path) = app.path().resolve(exe_name, BaseDirectory::Resource) {
        if path.exists() {
            return Ok(path);
        }
    }

    for ancestor in current_exe.ancestors() {
        let candidate = ancestor.join(exe_name);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_candidate = manifest_dir
        .parent()
        .unwrap_or(&manifest_dir)
        .join("sidecar")
        .join("cobolens-analyze")
        .join("target")
        .join("debug")
        .join(exe_name);
    if dev_candidate.exists() {
        return Ok(dev_candidate);
    }

    Err("could not find cobolens-analyze sidecar; set COBOLENS_ANALYZE_BIN".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            analyze_codebase,
            analyze_sample_codebase,
            read_source_snippet,
            read_source_excerpt,
            write_export_files,
            save_provider_key,
            read_provider_key,
            provider_key_state,
            clear_provider_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
