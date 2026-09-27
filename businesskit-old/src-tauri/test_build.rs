use std::collections::HashMap;
use std::fs;
use std::path::Path;
fn main() {
    let manifest_dir = "/Users/2.o/businesskit/src-tauri";
    let root_env_path = Path::new(manifest_dir).join("..").join(".env");
    let local_env_path = Path::new(manifest_dir).join(".env");
    let mut values: HashMap<String, String> = HashMap::new();
    for path in &[root_env_path.clone(), local_env_path.clone()] {
        if let Ok(contents) = fs::read_to_string(path) {
            println!("Read file: {:?}", path);
            for line in contents.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') { continue; }
                if let Some((key, val)) = line.split_once('=') {
                    values.insert(key.trim().to_string(), val.trim().to_string());
                }
            }
        } else {
            println!("Failed to read: {:?}", path);
        }
    }
    println!("Values: {:?}", values);
}
