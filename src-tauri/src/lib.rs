use serde_json::Value;
use std::{
    env,
    fs,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
};

#[tauri::command]
fn analyze_codebase(root: String) -> Result<Value, String> {
    let out = env::temp_dir().join("cobolens-graph.json");
    let analyzer = analyzer_binary_path()?;
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

fn analyzer_binary_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("COBOLENS_ANALYZE_BIN") {
        return Ok(PathBuf::from(path));
    }

    let current_exe = env::current_exe().map_err(|err| err.to_string())?;
    let exe_name = if cfg!(windows) {
        "cobolens-analyze.exe"
    } else {
        "cobolens-analyze"
    };

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
        .invoke_handler(tauri::generate_handler![analyze_codebase])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
