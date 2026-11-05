// Small updates of the app's web files (public/) without a new release.
//
// The website lists its files with their SHA-256 in app-update.json. desktop.js reads that
// list, asks `web_update_plan` which files the app does not have yet, downloads them, hands
// each to `web_update_file` (which checks it against the list) and calls `web_update_finish`.
// The new files go to <app data>/web-update/<version>/ and are shown from the next start,
// or right away after `web_update_apply` and a reload. Every file not in that folder comes
// from the app itself, and the page keeps the same address, so saved cards stay where they are.
//
// Safety: an update belongs to one app version and is dropped when a new app is installed.
// A new update is tried once: if the page does not call `web_update_ok` after starting
// with it, the next start goes back to the app's own files and never fetches that version again.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{App, Assets, Manager, Runtime, State};

#[derive(Serialize, Deserialize, Default, Clone)]
struct Saved {
    /// The app version the files were downloaded for.
    app: String,
    /// The update in use.
    current: Option<String>,
    /// Downloaded, used from the next start.
    ready: Option<String>,
    /// `current` started for the first time and has not called `web_update_ok` yet.
    trial: bool,
    /// Updates that failed to start; never fetched again.
    bad: Vec<String>,
}

/// One update folder: path -> SHA-256 of the files in it.
struct Folder {
    dir: PathBuf,
    files: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct Manifest {
    version: String,
    files: HashMap<String, String>,
}

pub struct Inner {
    embedded: Box<dyn Assets<tauri::Wry>>,
    embedded_hashes: OnceLock<HashMap<String, String>>,
    root: OnceLock<PathBuf>,
    saved: Mutex<Saved>,
    current: RwLock<Option<Folder>>,
    plan: Mutex<Option<Manifest>>,
}

pub type WebUpdate = Arc<Inner>;

/// Stands in for the app's own files while they are moved into `WebAssets`.
pub struct NoAssets;

impl<R: Runtime> Assets<R> for NoAssets {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// Wraps the files built into the app: a file in the update folder wins.
pub struct WebAssets(pub WebUpdate);

impl WebAssets {
    pub fn new(embedded: Box<dyn Assets<tauri::Wry>>) -> Self {
        WebAssets(Arc::new(Inner {
            embedded,
            embedded_hashes: OnceLock::new(),
            root: OnceLock::new(),
            saved: Mutex::new(Saved::default()),
            current: RwLock::new(None),
            plan: Mutex::new(None),
        }))
    }
}

fn key_path(key: &AssetKey) -> &str {
    key.as_ref().trim_start_matches('/')
}

fn sha256(bytes: &[u8]) -> String {
    let d = Sha256::digest(bytes);
    d.iter().map(|b| format!("{b:02x}")).collect()
}

/// "js/app.js" -> <dir>/js/app.js; None for anything that could leave the folder.
fn safe_join(dir: &Path, path: &str) -> Option<PathBuf> {
    let p = Path::new(path);
    if path.is_empty()
        || path.contains('\\')
        || !p.components().all(|c| matches!(c, Component::Normal(_)))
    {
        return None;
    }
    Some(dir.join(p))
}

fn read_folder(root: &Path, version: &str) -> Option<Folder> {
    let dir = safe_join(root, version)?;
    let text = fs::read_to_string(dir.join("files.json")).ok()?;
    let files: HashMap<String, String> = serde_json::from_str(&text).ok()?;
    Some(Folder { dir, files })
}

impl Inner {
    fn root(&self) -> Option<&PathBuf> {
        self.root.get()
    }

    fn save(&self, saved: &Saved) {
        if let Some(root) = self.root() {
            let _ = fs::create_dir_all(root);
            if let Ok(text) = serde_json::to_string(saved) {
                let _ = fs::write(root.join("state.json"), text);
            }
        }
    }

    /// Removes every update folder except these.
    fn clean(&self, keep: &[Option<String>]) {
        let Some(root) = self.root() else { return };
        let Ok(entries) = fs::read_dir(root) else {
            return;
        };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if e.path().is_dir() && !keep.iter().any(|k| k.as_deref() == Some(name.as_str())) {
                let _ = fs::remove_dir_all(e.path());
            }
        }
    }

    fn embedded_hashes(&self) -> &HashMap<String, String> {
        // iter() gives the files compressed; get() gives them as the page sees them.
        self.embedded_hashes.get_or_init(|| {
            let keys: Vec<String> = self.embedded.iter().map(|(k, _)| k.to_string()).collect();
            keys.iter()
                .filter_map(|k| {
                    let bytes = self.embedded.get(&AssetKey::from(k.as_str()))?;
                    Some((k.trim_start_matches('/').to_string(), sha256(&bytes)))
                })
                .collect()
        })
    }

    /// Picks the update to show when the app starts.
    fn start(&self, root: PathBuf, app_version: String) {
        let _ = self.root.set(root.clone());
        let mut s: Saved = fs::read_to_string(root.join("state.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        if s.app != app_version {
            // A new app was installed: its own files are newer than any download.
            let _ = fs::remove_dir_all(&root);
            s = Saved {
                app: app_version,
                ..Saved::default()
            };
        } else if s.trial {
            // The last start with this update never finished.
            if let Some(v) = s.current.take() {
                s.bad.push(v);
            }
            s.trial = false;
        }
        if let Some(v) = s.ready.take() {
            s.current = Some(v);
            s.trial = true;
        }
        let folder = s.current.as_deref().and_then(|v| read_folder(&root, v));
        if folder.is_none() {
            s.current = None;
            s.trial = false;
        }
        self.clean(&[s.current.clone()]);
        self.save(&s);
        *self.current.write().unwrap() = folder;
        *self.saved.lock().unwrap() = s;
    }
}

impl<R: Runtime> Assets<R> for WebAssets {
    fn setup(&self, app: &App<R>) {
        if let Ok(dir) = app.path().app_local_data_dir() {
            self.0.start(
                dir.join("web-update"),
                app.package_info().version.to_string(),
            );
        }
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        if let Some(f) = self.0.current.read().unwrap().as_ref() {
            let path = key_path(key);
            if f.files.contains_key(path) {
                if let Some(bytes) = safe_join(&f.dir, path).and_then(|p| fs::read(p).ok()) {
                    return Some(Cow::Owned(bytes));
                }
            }
        }
        self.0.embedded.get(key)
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.0.embedded.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.0.embedded.csp_hashes(html_path)
    }
}

#[derive(Serialize)]
pub struct Status {
    current: Option<String>,
    ready: Option<String>,
    bad: Vec<String>,
}

#[tauri::command]
pub fn web_update_status(state: State<WebUpdate>) -> Status {
    let s = state.saved.lock().unwrap();
    Status {
        current: s.current.clone(),
        ready: s.ready.clone(),
        bad: s.bad.clone(),
    }
}

#[derive(Serialize)]
pub struct Plan {
    /// Files to download.
    download: Vec<String>,
    /// False when the app already shows exactly these files.
    changed: bool,
}

/// The newest folder the app has (downloaded or in use).
fn latest(state: &Inner) -> Option<Folder> {
    let s = state.saved.lock().unwrap().clone();
    let root = state.root()?;
    s.ready
        .as_deref()
        .or(s.current.as_deref())
        .and_then(|v| read_folder(root, v))
}

#[tauri::command]
pub fn web_update_plan(state: State<WebUpdate>, manifest: Manifest) -> Result<Plan, String> {
    if state.root().is_none() {
        return Err("no app data folder".into());
    }
    let embedded = state.embedded_hashes();
    let base = latest(&state);
    let base_files = base.as_ref().map(|f| &f.files);
    let mut download = Vec::new();
    let mut wanted = 0;
    let mut same = 0;
    for (path, hash) in &manifest.files {
        if safe_join(Path::new(""), path).is_none() {
            return Err(format!("bad path {path}"));
        }
        if embedded.get(path) == Some(hash) {
            continue;
        }
        wanted += 1;
        if base_files.and_then(|f| f.get(path)) == Some(hash) {
            same += 1;
        } else {
            download.push(path.clone());
        }
    }
    let changed =
        !(download.is_empty() && same == wanted && base_files.map_or(0, |f| f.len()) == wanted);
    *state.plan.lock().unwrap() = Some(manifest);
    Ok(Plan { download, changed })
}

/// One downloaded file: the body is the file, the "path" header says which one (URI-encoded).
#[tauri::command]
pub fn web_update_file(
    state: State<WebUpdate>,
    request: tauri::ipc::Request,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file's bytes".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode(v))
        .ok_or("missing path")?;
    let plan = state.plan.lock().unwrap();
    let want = plan
        .as_ref()
        .and_then(|m| m.files.get(&path))
        .ok_or("not in the update")?;
    if &sha256(bytes) != want {
        return Err(format!("{path} does not match the update list"));
    }
    let root = state.root().ok_or("no app data folder")?;
    let file = safe_join(&root.join("staging"), &path).ok_or("bad path")?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&file, bytes).map_err(|e| e.to_string())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 3 <= b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Puts the downloaded files and the unchanged ones from the last update into a new folder.
#[tauri::command]
pub fn web_update_finish(state: State<WebUpdate>, version: String) -> Result<(), String> {
    let manifest = state
        .plan
        .lock()
        .unwrap()
        .take()
        .ok_or("no update in progress")?;
    if manifest.version != version {
        return Err("a different update is in progress".into());
    }
    if state.saved.lock().unwrap().current.as_ref() == Some(&version) {
        return Err("already in use".into());
    }
    let root = state.root().ok_or("no app data folder")?.clone();
    let staging = root.join("staging");
    let dir = safe_join(&root, &version)
        .filter(|_| version != "staging")
        .ok_or("bad version")?;
    let embedded = state.embedded_hashes();
    let base = latest(&state);
    let _ = fs::remove_dir_all(&dir);
    let mut files = HashMap::new();
    for (path, hash) in &manifest.files {
        if embedded.get(path) == Some(hash) {
            continue;
        }
        let candidates = [
            safe_join(&staging, path),
            base.as_ref().and_then(|f| safe_join(&f.dir, path)),
        ];
        let bytes = candidates
            .iter()
            .flatten()
            .filter_map(|p| fs::read(p).ok())
            .find(|b| &sha256(b) == hash)
            .ok_or_else(|| format!("{path} is missing"))?;
        let out = safe_join(&dir, path).ok_or("bad path")?;
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&out, bytes).map_err(|e| e.to_string())?;
        files.insert(path.clone(), hash.clone());
    }
    fs::write(
        dir.join("files.json"),
        serde_json::to_string(&files).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&staging);

    let mut s = state.saved.lock().unwrap();
    s.ready = Some(version);
    state.clean(&[s.current.clone(), s.ready.clone()]);
    state.save(&s);
    Ok(())
}

/// Shows the downloaded update now; the page reloads itself afterwards.
#[tauri::command]
pub fn web_update_apply(state: State<WebUpdate>) -> bool {
    let mut s = state.saved.lock().unwrap();
    let Some(v) = s.ready.take() else {
        return false;
    };
    let Some(folder) = state.root().and_then(|r| read_folder(r, &v)) else {
        state.save(&s);
        return false;
    };
    s.current = Some(v);
    s.trial = true;
    *state.current.write().unwrap() = Some(folder);
    state.clean(&[s.current.clone()]);
    state.save(&s);
    true
}

/// The page started fine with the files in use.
#[tauri::command]
pub fn web_update_ok(state: State<WebUpdate>) {
    let mut s = state.saved.lock().unwrap();
    if s.trial {
        s.trial = false;
        state.save(&s);
    }
}
