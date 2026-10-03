//! Upstream requires every `HnswConfig` and `WalOptions` field while the JS
//! API leaves them optional, so omitted fields take the upstream defaults.

use qdrant_edge::external::serde_json::{self, Value};
use qdrant_edge::{EdgeConfig, HnswIndexConfig, WalOptions};
use serde::Serialize;

fn complete<T: Serialize + Default>(slot: Option<&mut Value>) -> serde_json::Result<()> {
    let Some(Value::Object(partial)) = slot else {
        return Ok(());
    };
    if let Value::Object(mut merged) = serde_json::to_value(T::default())? {
        merged.extend(std::mem::take(partial));
        *partial = merged;
    }
    Ok(())
}

pub(crate) fn parse_edge_config(json: &str) -> serde_json::Result<EdgeConfig> {
    let mut value: Value = serde_json::from_str(json)?;
    if let Value::Object(config) = &mut value {
        complete::<HnswIndexConfig>(config.get_mut("hnsw_config"))?;
        complete::<WalOptions>(config.get_mut("wal_options"))?;
        if let Some(Value::Object(vectors)) = config.get_mut("vectors") {
            for params in vectors.values_mut() {
                complete::<HnswIndexConfig>(params.get_mut("hnsw_config"))?;
            }
        }
    }
    serde_json::from_value(value)
}

pub(crate) fn parse_hnsw_config(json: &str) -> serde_json::Result<HnswIndexConfig> {
    let mut value: Value = serde_json::from_str(json)?;
    complete::<HnswIndexConfig>(Some(&mut value))?;
    serde_json::from_value(value)
}
