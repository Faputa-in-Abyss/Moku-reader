#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;

// ===== 多 API 端点 =====
const API_SOURCES: &[&str] = &[
    "http://101.35.133.34:5000",     // mcp-server-fanqie 默认地址 (2026-06 更新)
    "https://fq.beitai.cc",          // 公开镜像
    "https://fq.beitai.vip",         // 公开镜像备选
];

// ===== 数据结构 =====

/// 搜索结果中的书籍信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FanqieBookInfo {
    pub book_id: String,
    pub book_name: String,
    pub author: String,
    pub cover_url: String,
    #[serde(default)]
    pub description: String,
    pub word_count: Option<i64>,
    pub chapter_count: Option<i64>,
    pub category: Option<String>,
    pub status: Option<String>,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FanqieSearchResult {
    pub books: Vec<FanqieBookInfo>,
    pub total: i64,
    pub has_more: bool,
}

/// 章节信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FanqieChapter {
    pub id: String,
    pub title: String,
    pub index: usize,
}

/// 下载时发的进度事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FanqieDownloadProgress {
    pub current: usize,
    pub total: usize,
    pub message: String,
}

// ===== 通用 API 响应包装 =====
#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    code: i32,
    message: Option<String>,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct DirectoryItem {
    item_id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
struct DirectoryData {
    lists: Vec<DirectoryItem>,
}

#[derive(Debug, Deserialize)]
struct ContentItem {
    content: Option<String>,
}

// ===== API 客户端 =====

pub struct FanqieApi {
    client: reqwest::Client,
    pub base_url: Mutex<String>,
}

impl FanqieApi {
    pub fn new() -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            "Referer",
            "https://fanqienovel.com/".parse().unwrap(),
        );
        headers.insert(
            "X-Requested-With",
            "XMLHttpRequest".parse().unwrap(),
        );
        headers.insert(
            "Accept-Language",
            "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7".parse().unwrap(),
        );
        headers.insert(
            "Accept",
            "application/json, text/javascript, */*; q=0.01".parse().unwrap(),
        );

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .default_headers(headers)
            .danger_accept_invalid_certs(true)
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            base_url: Mutex::new(API_SOURCES[0].to_string()),
        }
    }

    /// 尝试所有 API 地址，自动故障切换
    async fn try_with_fallback<F, Fut, T>(&self, operation: F) -> Result<T, String>
    where
        F: Fn(String) -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        // 先尝试最近一次成功使用的 base_url
        let preferred = self.base_url.lock().unwrap().clone();
        match operation(preferred.clone()).await {
            Ok(result) => return Ok(result),
            Err(_) => { /* 继续尝试其他地址 */ }
        }

        // 逐个尝试其他地址
        for source in API_SOURCES {
            let url = source.to_string();
            if url == *self.base_url.lock().unwrap() {
                continue;
            }
            match operation(url.clone()).await {
                Ok(result) => {
                    // 更新成功地址
                    *self.base_url.lock().unwrap() = url;
                    return Ok(result);
                }
                Err(_) => continue,
            }
        }

        Err("所有 API 地址均不可用，请检查网络连接".to_string())
    }

    // ===== 搜索小说 =====
    pub async fn search_books(&self, keyword: &str, offset: i32) -> Result<FanqieSearchResult, String> {
        let keyword = keyword.to_string();
        let client = self.client.clone();

        self.try_with_fallback(|base_url| {
            let keyword = keyword.clone();
            let client = client.clone();
            async move {
                let url = format!("{}/api/search", base_url);
                let resp = client
                    .get(&url)
                    .query(&[
                        ("key", keyword.as_str()),
                        ("tab_type", "3"),
                        ("offset", &offset.to_string()),
                    ])
                    .send()
                    .await
                    .map_err(|e| format!("请求失败: {}", e))?;

                let data: ApiResponse<serde_json::Value> = resp
                    .json()
                    .await
                    .map_err(|e| format!("解析响应失败: {}", e))?;

                if data.code != 200 {
                    return Err(data.message.unwrap_or_else(|| "API 错误".to_string()));
                }

                let data_value = data.data.ok_or("无数据")?;
                let mut books: Vec<FanqieBookInfo> = Vec::new();
                let mut has_more = false;

                // 从 search_tabs 中提取结果
                if let Some(search_tabs) = data_value["search_tabs"].as_array() {
                    for tab in search_tabs {
                        if let Some(tab_data) = tab["data"].as_array() {
                            if !tab_data.is_empty() {
                                has_more = tab["has_more"].as_bool().unwrap_or(false);
                                for item in tab_data {
                                    // book_data 可能是直接对象或数组
                                    let book_info = if let Some(arr) = item["book_data"].as_array() {
                                        arr.get(0)
                                    } else {
                                        Some(item)
                                    };

                                    if let Some(b) = book_info {
                                        let book_id = item["book_id"].as_str()
                                            .or_else(|| b["book_id"].as_str())
                                            .unwrap_or("")
                                            .to_string();

                                        if !book_id.is_empty() {
                                            books.push(FanqieBookInfo {
                                                book_id,
                                                book_name: b["book_name"].as_str().unwrap_or("未知").to_string(),
                                                author: b["author"].as_str().unwrap_or("未知").to_string(),
                                                cover_url: b["thumb_url"].as_str()
                                                    .or_else(|| b["cover_url"].as_str())
                                                    .unwrap_or("")
                                                    .to_string(),
                                                description: b["abstract"].as_str().unwrap_or("").to_string(),
                                                word_count: b["word_number"].as_i64()
                                                    .or_else(|| b["word_count"].as_i64()),
                                                chapter_count: b["serial_count"].as_i64()
                                                    .or_else(|| b["chapter_number"].as_i64()),
                                                category: b["category"].as_str().map(|s| s.to_string()),
                                                status: b["creation_status"].as_str().map(|s| s.to_string()),
                                            });
                                        }
                                    }
                                }
                                break; // 只取第一个有数据的 tab
                            }
                        }
                    }
                }

                let total = books.len() as i64;
                Ok(FanqieSearchResult {
                    books,
                    total,
                    has_more,
                })
            }
        })
        .await
    }

    // ===== 获取书籍详情 =====
    pub async fn get_book_detail(&self, book_id: &str) -> Result<FanqieBookInfo, String> {
        let book_id = book_id.to_string();
        let client = self.client.clone();

        self.try_with_fallback(|base_url| {
            let book_id = book_id.clone();
            let client = client.clone();
            async move {
                let url = format!("{}/api/detail", base_url);
                let resp = client
                    .get(&url)
                    .query(&[("book_id", book_id.as_str())])
                    .send()
                    .await
                    .map_err(|e| format!("请求失败: {}", e))?;

                let data: ApiResponse<serde_json::Value> = resp
                    .json()
                    .await
                    .map_err(|e| format!("解析响应失败: {}", e))?;

                if data.code != 200 {
                    return Err(data.message.unwrap_or_else(|| "API 错误".to_string()));
                }

                // data 可能嵌套两层 data.data
                let book_data = if data.data.as_ref().and_then(|d| d["data"].as_object()).is_some() {
                    &data.data.as_ref().unwrap()["data"]
                } else if let Some(ref d) = data.data {
                    d
                } else {
                    return Err("无数据".to_string());
                };

                // 检查书籍是否已下架
                if book_data["message"].as_str() == Some("BOOK_REMOVE") {
                    return Err("该书已下架或不存在".to_string());
                }

                Ok(FanqieBookInfo {
                    book_id: book_id.to_string(),
                    book_name: book_data["book_name"].as_str().unwrap_or("未知").to_string(),
                    author: book_data["author"].as_str().unwrap_or("未知").to_string(),
                    cover_url: book_data["thumb_url"].as_str()
                        .or_else(|| book_data["cover_url"].as_str())
                        .unwrap_or("")
                        .to_string(),
                    description: book_data["abstract"].as_str().unwrap_or("").to_string(),
                    word_count: book_data["word_count"].as_i64(),
                    chapter_count: book_data["serial_count"].as_i64()
                        .or_else(|| book_data["chapter_count"].as_i64()),
                    category: book_data["category"].as_str().map(|s| s.to_string()),
                    status: book_data["creation_status"].as_str().map(|s| s.to_string()),
                })
            }
        })
        .await
    }

    // ===== 获取目录 =====
    pub async fn get_chapters(&self, book_id: &str) -> Result<Vec<FanqieChapter>, String> {
        let book_id = book_id.to_string();

        // 先尝试 /api/directory
        if let Ok(chapters) = self.try_directory_api(&book_id).await {
            if !chapters.is_empty() {
                return Ok(chapters);
            }
        }

        // 回退到 /api/book
        self.try_book_api(&book_id).await
    }

    async fn try_directory_api(&self, book_id: &str) -> Result<Vec<FanqieChapter>, String> {
        let book_id = book_id.to_string();
        let client = self.client.clone();

        self.try_with_fallback(|base_url| {
            let book_id = book_id.clone();
            let client = client.clone();
            async move {
                let url = format!("{}/api/directory", base_url);
                let resp = client
                    .get(&url)
                    .query(&[("book_id", book_id.as_str())])
                    .send()
                    .await
                    .map_err(|e| format!("请求失败: {}", e))?;

                let data: ApiResponse<DirectoryData> = resp
                    .json()
                    .await
                    .map_err(|e| format!("解析响应失败: {}", e))?;

                if data.code != 200 {
                    return Err(data.message.unwrap_or_default());
                }

                let dir_data = data.data.ok_or("无目录数据")?;
                let chapters: Vec<FanqieChapter> = dir_data
                    .lists
                    .into_iter()
                    .enumerate()
                    .map(|(idx, item)| FanqieChapter {
                        id: item.item_id,
                        title: item.title,
                        index: idx,
                    })
                    .collect();

                Ok(chapters)
            }
        })
        .await
    }

    async fn try_book_api(&self, book_id: &str) -> Result<Vec<FanqieChapter>, String> {
        let book_id = book_id.to_string();
        let client = self.client.clone();

        self.try_with_fallback(|base_url| {
            let book_id = book_id.clone();
            let client = client.clone();
            async move {
                let url = format!("{}/api/book", base_url);
                let resp = client
                    .get(&url)
                    .query(&[("book_id", book_id.as_str())])
                    .send()
                    .await
                    .map_err(|e| format!("请求失败: {}", e))?;

                let data: ApiResponse<serde_json::Value> = resp
                    .json()
                    .await
                    .map_err(|e| format!("解析响应失败: {}", e))?;

                if data.code != 200 {
                    return Err(data.message.unwrap_or_else(|| "API 错误".to_string()));
                }

                let inner = &data.data.as_ref().ok_or("无数据")?["data"];
                let mut chapters: Vec<FanqieChapter> = Vec::new();

                // 方式1: chapterListWithVolume
                if let Some(volumes) = inner["chapterListWithVolume"].as_array() {
                    let mut idx = 0;
                    for vol in volumes {
                        if let Some(ch_list) = vol.as_array() {
                            for ch in ch_list {
                                let item_id = ch["itemId"].as_str()
                                    .or_else(|| ch["item_id"].as_str())
                                    .unwrap_or("");
                                if !item_id.is_empty() {
                                    chapters.push(FanqieChapter {
                                        id: item_id.to_string(),
                                        title: ch["title"].as_str().unwrap_or("未知章节").to_string(),
                                        index: idx,
                                    });
                                    idx += 1;
                                }
                            }
                        }
                    }
                }

                // 方式2: allItemIds (只有 ID，需要生成占位标题)
                if chapters.is_empty() {
                    if let Some(ids) = inner["allItemIds"].as_array() {
                        for (idx, id_val) in ids.iter().enumerate() {
                            if let Some(id_str) = id_val.as_str() {
                                chapters.push(FanqieChapter {
                                    id: id_str.to_string(),
                                    title: format!("第{}章", idx + 1),
                                    index: idx,
                                });
                            }
                        }
                    }
                }

                if chapters.is_empty() {
                    return Err("无法从 API 获取章节列表".to_string());
                }

                Ok(chapters)
            }
        })
        .await
    }

    // ===== 获取单章内容 =====
    pub async fn get_chapter_content(&self, item_id: &str) -> Result<String, String> {
        let item_id = item_id.to_string();
        let client = self.client.clone();

        self.try_with_fallback(|base_url| {
            let item_id = item_id.clone();
            let client = client.clone();
            async move {
                let url = format!("{}/api/content", base_url);
                let resp = client
                    .get(&url)
                    .query(&[
                        ("item_id", item_id.as_str()),
                        ("tab", "小说"),
                    ])
                    .send()
                    .await
                    .map_err(|e| format!("请求失败: {}", e))?;

                let data: ApiResponse<serde_json::Value> = resp
                    .json()
                    .await
                    .map_err(|e| format!("解析响应失败: {}", e))?;

                if data.code != 200 {
                    return Err(data.message.unwrap_or_else(|| "API 错误".to_string()));
                }

                let content = data
                    .data
                    .and_then(|d| d["content"].as_str().map(|s| s.to_string()))
                    .ok_or("章节内容为空")?;

                if content.trim().is_empty() {
                    return Err("章节内容为空".to_string());
                }

                Ok(clean_content(&content))
            }
        })
        .await
    }
}

// ===== 内容清洗工具 =====

/// 清洗 HTML 标签、多余空白，保留段落结构
pub fn clean_content(content: &str) -> String {
    let mut result = content.to_string();

    // <br> → \n
    if let Ok(re) = regex_lite::Regex::new(r"<br\s*/?>") {
        result = re.replace_all(&result, "\n").to_string();
    }

    // <p ...> → \n
    if let Ok(re) = regex_lite::Regex::new(r"<p[^>]*>") {
        result = re.replace_all(&result, "\n").to_string();
    }

    // </p> → \n
    if let Ok(re) = regex_lite::Regex::new(r"</p>") {
        result = re.replace_all(&result, "\n").to_string();
    }

    // 其他 HTML 标签
    if let Ok(re) = regex_lite::Regex::new(r"<[^>]+>") {
        result = re.replace_all(&result, "").to_string();
    }

    // &nbsp; → 空格
    result = result.replace("&nbsp;", " ");
    // &amp; → &
    result = result.replace("&amp;", "&");
    // &lt; → <
    result = result.replace("&lt;", "<");
    // &gt; → >
    result = result.replace("&gt;"