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
    #[serde(default)]
    pub(crate) params: Option<qdrant_edge::SearchParams>,
}

impl SearchInput {
    /// Upstream deprecated `EdgeShardRead::search` in favor of `query`, so a
    /// search request converts into a nearest-neighbor `QueryRequest`. The
    /// legacy search defaults are preserved: payload and vector both excluded
    /// unless requested.
    pub(crate) fn into_query_request(self) -> Result<qdrant_edge::QueryRequest, String> {
        let query = qdrant_edge::QueryEnum::Nearest(qdrant_edge::NamedQuery {
            query: self.vector.into_vector_internal()?,
            using: self.using,
        });
        Ok(qdrant_edge::QueryRequest {
            prefetches: Vec::new(),
            query: Some(qdrant_edge::ScoringQuery::Vector(query)),
            filter: self.filter,
            score_threshold: self.score_threshold,
            limit: self.limit,
            offset: self.offset,
            params: self.params,
            with_vector: qdrant_edge::WithVector::Bool(self.with_vector.unwrap_or(false)),
            with_payload: qdrant_edge::WithPayloadInterface::Bool(
                self.with_payload.unwrap_or(false),
            ),
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
    #[serde(default)]
    pub(crate) params: Option<qdrant_edge::SearchParams>,
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
            params: self.params,
            filter: self.filter,
            score_threshold: self.score_threshold,
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

/// JSON-deserializable query-groups request. Mirrors the qdrant REST
/// `query_groups` shape: the flattened query fields plus `group_by`,
/// `limit` (number of groups), and `group_size` (hits per group).
#[derive(Deserialize)]
pub(crate) struct GroupsInput {
    #[serde(flatten)]
    pub(crate) query: QueryInput,
    pub(crate) group_by: qdrant_edge::JsonPath,
    #[serde(default = "default_group_size")]
    pub(crate) group_size: usize,
}

fn default_group_size() -> usize {
    3
}

impl GroupsInput {
    /// The requested hit hydration, resolved with the query-API defaults
    /// (payload on, vectors off). The grouping driver overrides both on its
    /// sub-requests, so the FFI hydrates hits itself after grouping.
    pub(crate) fn hydration(&self) -> (bool, bool) {
        (
            self.query.with_payload.unwrap_or(true),
            self.query.with_vector.unwrap_or(false),
        )
    }

    pub(crate) fn into_group_request(self) -> Result<qdrant_edge::GroupRequest, String> {
        let GroupsInput {
            query,
            group_by,
            group_size,
        } = self;
        let groups = query.limit;
        Ok(qdrant_edge::GroupRequest {
            query: query.into_query_request()?,
            group_by,
            groups,
            group_size,
        })
    }
}

/// JSON-deserializable search-matrix request. Mirrors the qdrant REST
/// `search_matrix` shape: `sample` points, `limit` neighbours per sample.
#[derive(Deserialize)]
pub(crate) struct MatrixInput {
    #[serde(default = "default_matrix_sample")]
    pub(crate) sample: usize,
    #[serde(default = "default_matrix_limit")]
    pub(crate) limit: usize,
    #[serde(default)]
    pub(crate) filter: Option<Filter>,
    #[serde(default)]
    pub(crate) using: Option<String>,
}

fn default_matrix_sample() -> usize {
    10
}

fn default_matrix_limit() -> usize {
    3
}

impl MatrixInput {
    pub(crate) fn into_matrix_request(self) -> qdrant_edge::SearchMatrixRequest {
        qdrant_edge::SearchMatrixRequest {
            sample_size: self.sample,
            limit_per_sample: self.limit,
            filter: self.filter,
            using: self
                .using
                .unwrap_or_else(|| qdrant_edge::DEFAULT_VECTOR_NAME.to_string()),
        }
    }
}

/// JSON-deserializable scroll request; mirrors the serde shape upstream
/// `ScrollRequestInternal` had before `ScrollRequest` lost `Deserialize`.
#[derive(Deserialize)]
pub(crate) struct ScrollInput {
    #[serde(default)]
    pub(crate) offset: Option<qdrant_edge::PointId>,
    #[serde(default)]
    pub(crate) limit: Option<usize>,
    #[serde(default)]
    pub(crate) filter: Option<Filter>,
    #[serde(default)]
    pub(crate) with_payload: Option<qdrant_edge::WithPayloadInterface>,
    #[serde(default, alias = "with_vectors")]
    pub(crate) with_vector: Option<qdrant_edge::WithVector>,
    #[serde(default)]
    pub(crate) order_by: Option<qdrant_edge::OrderByInterface>,
}

impl ScrollInput {
    pub(crate) fn into_scroll_request(self) -> qdrant_edge::ScrollRequest {
        qdrant_edge::ScrollRequest {
            offset: self.offset,
            limit: self.limit,
            filter: self.filter,
            with_payload: self.with_payload,
            with_vector: self
                .with_vector
                .unwrap_or(qdrant_edge::WithVector::Bool(false)),
            order_by: self.order_by,
        }
    }
}

/// JSON-deserializable facet request; mirrors the serde shape upstream
/// `FacetRequestInternal` had before `FacetRequest` lost `Deserialize`.
#[derive(Deserialize)]
pub(crate) struct FacetInput {
    pub(crate) key: qdrant_edge::JsonPath,
    #[serde(default = "default_limit")]
    pub(crate) limit: usize,
    #[serde(default)]
    pub(crate) filter: Option<Filter>,
    #[serde(default)]
    pub(crate) exact: bool,
}

impl FacetInput {
    pub(crate) fn into_facet_request(self) -> qdrant_edge::FacetRequest {
        qdrant_edge::FacetRequest {
            key: self.key,
            limit: self.limit,
            filter: self.filter,
            exact: self.exact,
        }
    }
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
    #[serde(default)]
    pub(crate) params: Option<qdrant_edge::SearchParams>,
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
            params,
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
            score_threshold,
            limit,
            offset,
            params,
            with_vector: with_vector
                .map(qdrant_edge::WithVector::Bool)
                .unwrap_or(qdrant_edge::WithVector::Bool(false)),
            with_payload: with_payload
                .map(qdrant_edge::WithPayloadInterface::Bool)
                .unwrap_or(qdrant_edge::WithPayloadInterface::Bool(true)),
        })
    }
}
