const fs = require('fs');

let code = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

const oldSkillLoop = `    for skill in skills {
        if let (Some(slug), Some(github_url)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(github_url).unwrap_or_else(|_| github_url.to_string())
            };`;

const newSkillLoop = `    for skill in skills {
        let (slug, github_url) = if let Some(url_str) = skill.as_str() {
            let slug = url_str.split('/').last().unwrap_or("unknown").to_string();
            (slug, url_str.to_string())
        } else if let (Some(slug), Some(url_str)) = (skill.get("id").and_then(|v| v.as_str()), skill.get("github_url").and_then(|v| v.as_str())) {
            (slug.to_string(), url_str.to_string())
        } else {
            continue;
        };

        {
            let raw_url = if github_url.contains("raw.githubusercontent.com") {
                github_url.to_string()
            } else {
                crate::plugins::github_url_to_raw_base(&github_url).unwrap_or_else(|_| github_url.to_string())
            };`;

code = code.replace(oldSkillLoop, newSkillLoop);

// Need to match the closing brace for the added block scope
const oldEnd = `                        );
                    }
                }
            }
        }
    }`;

const newEnd = `                        );
                    }
                }
            }
        }
    }`;
// Wait, actually I just replaced `if let` with `let (slug, github_url) = ...; {`
// So the closing braces remain exactly the same. 

fs.writeFileSync('src-tauri/src/plugins.rs', code);
