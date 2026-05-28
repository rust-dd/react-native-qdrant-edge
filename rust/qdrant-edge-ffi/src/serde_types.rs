//! JSON-deserializable input shapes and JSON-serializable output shapes
//! used across the FFI surface. Many `qdrant_edge` core types don't implement
//! `Serialize`/`Deserialize`, so we use these intermediates and convert.

use std::collections::HashMap;

use qdrant_edge::external::serde_json;
use qdrant_edge::{Filter, PointStruct, Vector, Vectors};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub(crate) struct PointInput {
    pub(crate) id: u64,
    /// Either a flat vector `[f32, …]` or named vectors `{ "name": [f32, …] }`.
    pub(crate) vector: VectorInput,
    #[serde(default)]
    pub(crate) payload: Option<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum VectorInput {
    Dense(Vec<f32>),
    Named(HashMap<String, Vec<f32>>),
}

impl PointInput {
    pub(crate) fn into_point_struct(self) -> Result<PointStruct, String> {
        let vectors: Vectors = match self.vector {
            VectorInput::Dense(v) => Vectors::from(v),
            VectorInput::Named(map) => {
                Vectors::new_named(map.into_iter().map(|(k, v)| (k, Vector::new_dense(v))))
            }
        };
        let payload = self
            .payload
            .unwrap_or(serde_json::Value::Object(Default::default()));
        Ok(PointStruct::new(self.id, vectors, payload))
    }
}

/// JSON-deserializable search request (since `CoreSearchRequest` doesn't impl Deserialize).
#[derive(Deserialize)]
pub(crate) struct SearchInput {
    pub(crate) vector: Vec<f32>,
    #[serde(default)]
    pub(crate) using: Option<String>,
    #[serde(default)]
    pub(crate) filter: Option<Filter>,
    #[serde(default = "default_limit")]
    pub(crate) limit: usize,
    #[serde(default)]
    pub(crate) offset: usize,
    #[serde(default)]
    pub(crate) with_payload: Option<bool>,
    #[serde(default)]
    pub(crate) with_vector: Option<bool>,
    #[serde(default)]
    pub(crate) score_threshold: Option<f32>,
}

pub(crate) fn default_limit() -> usize {
    10
}

impl SearchInput {
    pub(crate) fn into_search_request(self) -> Result<qdrant_edge::SearchRequest, String> {
        let query = qdrant_edge::QueryEnum::Nearest(qdrant_edge::NamedQuery {
            query: qdrant_edge::VectorInternal::Dense(self.vector.into()),
            using: self.using,
        });
        Ok(qdrant_edge::SearchRequest {
            query,
            filter: self.filter,
            params: None,
            limit: self.limit,
            offset: self.offset,
            with_payload: self
                .with_payload
                .map(qdrant_edge::WithPayloadInterface::Bool),
            with_vector: self.with_vector.map(qdrant_edge::WithVector::Bool),
            score_threshold: self.score_threshold,
        })
    }
}

/// JSON-deserializable query request (since `ShardQueryRequest` doesn't impl Deserialize).
#[derive(Deserialize)]
pub(crate) struct QueryInput {
    #[serde(default)]
    pub(crate) vector: Option<Vec<f32>>,
    #[serde(default)]
    pub(crate) using: Option<String>,
    #[serde(default)]
    pub(crate) filter: Option<Filter>,
    #[serde(default = "default_limit")]
    pub(crate) limit: usize,
    #[serde(default)]
    pub(crate) offset: usize,
    #[serde(default)]
    pub(crate) with_payload: Option<bool>,
    #[serde(default)]
    pub(crate) with_vector: Option<bool>,
    #[serde(default)]
    pub(crate) score_threshold: Option<f32>,
    /// Fusion mode: `"rrf"` or `"dbsf"`.
    #[serde(default)]
    pub(crate) fusion: Option<String>,
}

impl QueryInput {
    pub(crate) fn into_query_request(self) -> Result<qdrant_edge::QueryRequest, String> {
        let scoring_query = if let Some(vec) = self.vector {
            let query_enum = qdrant_edge::QueryEnum::Nearest(qdrant_edge::NamedQuery {
                query: qdrant_edge::VectorInternal::Dense(vec.into()),
                using: self.using,
            });
            Some(qdrant_edge::ScoringQuery::Vector(query_enum))
        } else if let Some(fusion) = &self.fusion {
            let f = match fusion.as_str() {
                "rrf" => qdrant_edge::Fusion::Rrf {
                    k: 60,
                    weights: None,
                },
                "dbsf" => qdrant_edge::Fusion::Dbsf,
                other => return Err(format!("Unknown fusion mode: {other}")),
            };
            Some(qdrant_edge::ScoringQuery::Fusion(f))
        } else {
            None
        };

        let score_threshold = self
            .score_threshold
            .map(qdrant_edge::external::ordered_float::OrderedFloat);

        Ok(qdrant_edge::QueryRequest {
            prefetches: vec![],
            query: scoring_query,
            filter: self.filter,
            score_threshold,
            limit: self.limit,
            offset: self.offset,
            params: None,
            with_vector: self
                .with_vector
                .map(qdrant_edge::WithVector::Bool)
                .unwrap_or(qdrant_edge::WithVector::Bool(false)),
            with_payload: self
                .with_payload
                .map(qdrant_edge::WithPayloadInterface::Bool)
                .unwrap_or(qdrant_edge::WithPayloadInterface::Bool(true)),
        })
    }
}

/// Convert `VectorStructInternal` to JSON manually (it doesn't impl `Serialize`).
pub(crate) fn vector_struct_to_json(v: qdrant_edge::VectorStructInternal) -> serde_json::Value {
    match v {
        qdrant_edge::VectorStructInternal::Single(dense) => serde_json::json!(dense),
        qdrant_edge::VectorStructInternal::MultiDense(md) => {
            serde_json::json!(md.into_multi_vectors())
        }
        qdrant_edge::VectorStructInternal::Named(map) => {
            let obj: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .map(|(name, vi)| {
                    let val = match vi {
                        qdrant_edge::VectorInternal::Dense(d) => serde_json::json!(d),
                        qdrant_edge::VectorInternal::Sparse(s) => serde_json::json!({
                            "indices": s.indices,
                            "values": s.values,
                        }),
                        qdrant_edge::VectorInternal::MultiDense(md) => {
                            serde_json::json!(md.into_multi_vectors())
                        }
                    };
                    (name, val)
                })
                .collect();
            serde_json::Value::Object(obj)
        }
    }
}

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

#[derive(Serialize)]
pub(crate) struct ShardInfoOutput {
    pub(crate) segments_count: usize,
    pub(crate) points_count: usize,
    pub(crate) indexed_vectors_count: usize,
}
