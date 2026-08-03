use serde::Serialize;
use std::path::Path;

/// リーフとして扱う Markdown の拡張子
pub const MD_EXTS: [&str; 6] = ["md", "markdown", "mdown", "mkd", "mdtxt", "mdtext"];

/// 走査から除外するディレクトリ名
const SKIP_DIRS: [&str; 11] = [
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "dist",
    "build",
    ".next",
    ".venv",
    "__pycache__",
    ".DS_Store",
];

/// ツリー全体で読み込むエントリ数の上限（巨大なフォルダで固まらないための保険）
const MAX_ENTRIES: usize = 20_000;

/// 走査する最大の深さ
const MAX_DEPTH: usize = 12;

#[derive(Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<TreeNode>,
}

#[derive(Serialize)]
pub struct TreeResult {
    pub root: TreeNode,
    /// 上限に達して打ち切ったかどうか（フロントで注意表示するため）
    pub truncated: bool,
    pub entry_count: usize,
}

pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MD_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.contains(&name) || name.starts_with('.')
}

struct ScanCtx {
    count: usize,
    truncated: bool,
}

/// ディレクトリを再帰的に走査する。
/// Markdown を1つも含まないディレクトリは結果から取り除く。
fn scan_dir(dir: &Path, depth: usize, ctx: &mut ScanCtx) -> Vec<TreeNode> {
    if depth >= MAX_DEPTH || ctx.truncated {
        return Vec::new();
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut dirs: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    for entry in entries.flatten() {
        if ctx.count >= MAX_ENTRIES {
            ctx.truncated = true;
            break;
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        if file_type.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            let children = scan_dir(&path, depth + 1, ctx);
            // Markdown を含まないディレクトリは表示しない
            if children.is_empty() {
                continue;
            }
            ctx.count += 1;
            dirs.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children,
            });
        } else if file_type.is_file() && is_markdown(&path) {
            ctx.count += 1;
            files.push(TreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }

    let by_name = |a: &TreeNode, b: &TreeNode| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    };
    dirs.sort_by(by_name);
    files.sort_by(by_name);

    // ディレクトリを先、ファイルを後に並べる
    dirs.extend(files);
    dirs
}

pub fn scan(root: &Path) -> Result<TreeResult, String> {
    if !root.is_dir() {
        return Err(format!(
            "フォルダではありません: {}",
            root.to_string_lossy()
        ));
    }

    let mut ctx = ScanCtx {
        count: 0,
        truncated: false,
    };
    let children = scan_dir(root, 0, &mut ctx);

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    Ok(TreeResult {
        root: TreeNode {
            name,
            path: root.to_string_lossy().to_string(),
            is_dir: true,
            children,
        },
        truncated: ctx.truncated,
        entry_count: ctx.count,
    })
}
