//! JSON-serializable output shapes.

use qdrant_edge::external::serde_json;
use serde::Serialize;

use super::vectors::vector_struct_to_json;

#[derive(Serialize)]
pub(crate) struct ScoredPointOutput {
    pub(crate) id: String,
    pub(crate) score: f32,
    pub(crate) version: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) vector: Option<serde_json::Value>,
}

impl From<qdrant_edge::ScoredPoint> for ScoredPointOutput {
    fn from(sp: qdrant_edge::ScoredPoint) -> Self {
        ScoredPointOutput {
            id: format!("{}", sp.id),
            score: sp.score,
            version: sp.version,
            payload: sp
                .payload
                .map(|p| serde_json::to_value(p).unwrap_or_default()),
            vector: sp.vector.map(vector_struct_to_json),
        }
    }
}

#[derive(Serialize)]
pub(crate) struct RecordOutput {
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) vector: Option<serde_json::Value>,
}

impl From<qdrant_edge::Record> for RecordOutput {
    fn from(r: qdrant_edge::Record) -> Self {
        RecordOutput {
            id: format!("{}", r.id),
            payload: r
                .payload
                .map(|p| serde_json::to_value(p).unwrap_or_default()),
            vector: r.vector.map(vector_struct_to_json),
        }
    }
}

#[derive(Serialize)]
pub(crate) struct ScrollOutput {
    pub(crate) points: Vec<RecordOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next_offset: Option<String>,
}

/// One result group: the shared `group_by` value and its scored hits.
#[derive(Serialize)]
pub(crate) struct GroupOutput {
    pub(crate) key: serde_json::Value,
    pub(crate) hits: Vec<ScoredPointOutput>,
}

#[derive(Serialize)]
pub(crate) struct SearchMatrixOutput {
    pub(crate) sample_ids: Vec<String>,
    pub(crate) nearests: Vec<Vec<ScoredPointOutput>>,
}

#[derive(Serialize)]
pub(crate) struct ShardInfoOutput {
    pub(crate) segments_count: usize,
    pub(crate) points_count: usize,
    pub(crate) indexed_vectors_count: usize,
}
