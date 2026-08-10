//! JSON-deserializable request shapes (search, query, prefetch).

use qdrant_edge::Filter;
use serde::Deserialize;

use super::clauses::{QueryClauseInput, default_rrf_k};
use super::vectors::AnyVectorInput;

pub(crate) fn default_limit() -> usize {
    10
}

/// JSON-deserializable search request (since `CoreSearchRequest` doesn't impl Deserialize).
#[derive(Deserialize)]
pub(crate) struct SearchInput {
    pub(crate) vector: AnyVectorInput,
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

impl SearchInput {
    pub(crate) fn into_search_request(self) -> Result<qdrant_edge::SearchRequest, String> {
        let query = qdrant_edge::QueryEnum::Nearest(qdrant_edge::NamedQuery {
            query: self.vector.into_vector_internal()?,
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

/// A single prefetch or an array of them. `prefetch: x` and `prefetch: [x, y]`
/// both accepted; both flow into `ShardPrefetch::prefetches`.
#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum PrefetchSpec {
    One(Box<PrefetchInput>),
    Many(Vec<PrefetchInput>),
}

impl PrefetchSpec {
    fn into_vec(self) -> Vec<PrefetchInput> {
        match self {
            PrefetchSpec::One(p) => vec![*p],
            PrefetchSpec::Many(v) => v,
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct PrefetchInput {
    #[serde(default)]
    pub(crate) prefetch: Option<PrefetchSpec>,
    #[serde(default)]
    pub(crate) query: Option<QueryClauseInput>,
    #[serde(default)]
    pub(crate) using: Option<String>,
    #[serde(default)]
    pub(crate) filter: Option<Filter>,
    #[serde(default = "default_limit")]
    pub(crate) limit: usize,
    #[serde(default)]
    pub(crate) score_threshold: Option<f32>,
}

impl PrefetchInput {
    fn into_prefetch(self) -> Result<qdrant_edge::Prefetch, String> {
        let prefetches = build_prefetches(self.prefetch)?;
        let query = match self.query {
            Some(c) => Some(c.into_scoring_query(self.using)?),
            None => None,
        };
        Ok(qdrant_edge::Prefetch {
            prefetches,
            query,
            limit: self.limit,
            params: None,
            filter: self.filter,
            score_threshold: self
                .score_threshold
                .map(qdrant_edge::external::ordered_float::OrderedFloat),
        })
    }
}

fn build_prefetches(spec: Option<PrefetchSpec>) -> Result<Vec<qdrant_edge::Prefetch>, String> {
    let Some(spec) = spec else { return Ok(vec![]) };
    spec.into_vec()
        .into_iter()
        .map(PrefetchInput::into_prefetch)
        .collect()
}

/// JSON-deserializable query request. The shape of the public API mirrors
/// upstream `ShardQueryRequest` (with the `qdrant-client` JSON conventions).
///
/// The legacy `vector` and `fusion` flat fields are still accepted so existing
/// 0.2.x callers keep working; they are equivalent to `query: vector` and
/// `query: { fusion: ... }` respectively.
#[derive(Deserialize)]
pub(crate) struct QueryInput {
    #[serde(default)]
    pub(crate) prefetch: Option<PrefetchSpec>,
    #[serde(default)]
    pub(crate) query: Option<QueryClauseInput>,
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
    /// Legacy field equivalent to `query: vector` (dense only).
    #[serde(default)]
    pub(crate) vector: Option<Vec<f32>>,
    /// Legacy field equivalent to `query: { fusion: ... }`. `"rrf"` | `"dbsf"`.
    #[serde(default)]
    pub(crate) fusion: Option<String>,
}

impl QueryInput {
    pub(crate) fn into_query_request(self) -> Result<qdrant_edge::QueryRequest, String> {
        let QueryInput {
            prefetch,
            query,
            using,
            filter,
            limit,
            offset,
            with_payload,
            with_vector,
            score_threshold,
            vector,
            fusion,
        } = self;

        let prefetches = build_prefetches(prefetch)?;

        let scoring_query = if let Some(clause) = query {
            Some(clause.into_scoring_query(using)?)
        } else if let Some(vec) = vector {
            let nq = qdrant_edge::NamedQuery {
                query: qdrant_edge::VectorInternal::Dense(vec.into()),
                using,
            };
            Some(qdrant_edge::ScoringQuery::Vector(qdrant_edge::QueryEnum::Nearest(nq)))
        } else if let Some(fusion_str) = fusion {
            let f = match fusion_str.as_str() {
                "rrf" => qdrant_edge::Fusion::Rrf {
                    k: default_rrf_k(),
                    weights: None,
                },
                "dbsf" => qdrant_edge::Fusion::Dbsf,
                other => return Err(format!("Unknown fusion mode: {other}")),
            };
            Some(qdrant_edge::ScoringQuery::Fusion(f))
        } else {
            None
        };

        Ok(qdrant_edge::QueryRequest {
            prefetches,
            query: scoring_query,
            filter,
            score_threshold: score_threshold
                .map(qdrant_edge::external::ordered_float::OrderedFloat),
            limit,
            offset,
            params: None,
            with_vector: with_vector
                .map(qdrant_edge::WithVector::Bool)
                .unwrap_or(qdrant_edge::WithVector::Bool(false)),
            with_payload: with_payload
                .map(qdrant_edge::WithPayloadInterface::Bool)
                .unwrap_or(qdrant_edge::WithPayloadInterface::Bool(true)),
        })
    }
}
