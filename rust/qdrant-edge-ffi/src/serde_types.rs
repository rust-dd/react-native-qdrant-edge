//! JSON-deserializable input shapes and JSON-serializable output shapes
//! used across the FFI surface. Many `qdrant_edge` core types don't implement
//! `Serialize`/`Deserialize`, so we use these intermediates and convert.

use std::collections::HashMap;

use qdrant_edge::external::serde_json;
use qdrant_edge::{Filter, PointId, PointStruct, Vector, VectorInternal, Vectors};
use serde::{Deserialize, Serialize};

/// One vector in dense / multi-dense / sparse form. Serde tries variants in
/// declaration order; the three shapes are non-overlapping (array of numbers,
/// array of arrays, object with `indices`/`values`).
#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum AnyVectorInput {
    Dense(Vec<f32>),
    Multi(Vec<Vec<f32>>),
    Sparse(SparseVectorInput),
}

#[derive(Deserialize)]
pub(crate) struct SparseVectorInput {
    pub(crate) indices: Vec<u32>,
    pub(crate) values: Vec<f32>,
}

impl AnyVectorInput {
    pub(crate) fn into_vector(self) -> Result<Vector, String> {
        match self {
            Self::Dense(v) => Ok(Vector::new_dense(v)),
            Self::Multi(m) => Vector::new_multi(m).map_err(|e| format!("multi vector: {e}")),
            Self::Sparse(s) => Vector::new_sparse(s.indices, s.values)
                .map_err(|e| format!("sparse vector: {e}")),
        }
    }

    pub(crate) fn into_vector_internal(self) -> Result<VectorInternal, String> {
        self.into_vector().map(VectorInternal::from)
    }
}

/// A point can carry a single un-named vector (any shape) or a map of named
/// vectors (each any shape — mixed dense + sparse + multi is allowed).
#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum VectorInput {
    Single(AnyVectorInput),
    Named(HashMap<String, AnyVectorInput>),
}

impl VectorInput {
    pub(crate) fn into_vectors(self) -> Result<Vectors, String> {
        match self {
            VectorInput::Single(AnyVectorInput::Dense(v)) => Ok(Vectors::from(v)),
            VectorInput::Single(any) => {
                let vec = any.into_vector()?;
                Ok(Vectors::new_named([(qdrant_edge::DEFAULT_VECTOR_NAME, vec)]))
            }
            VectorInput::Named(map) => {
                let entries = map
                    .into_iter()
                    .map(|(k, any)| any.into_vector().map(|v| (k, v)))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(Vectors::new_named(entries))
            }
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct PointInput {
    /// `PointId` deserializes from a number (u64) or a UUID string —
    /// upstream `ExtendedPointId` is `#[serde(untagged)]` over the two.
    pub(crate) id: PointId,
    pub(crate) vector: VectorInput,
    #[serde(default)]
    pub(crate) payload: Option<serde_json::Value>,
}

impl PointInput {
    pub(crate) fn into_point_struct(self) -> Result<PointStruct, String> {
        let vectors = self.vector.into_vectors()?;
        let payload = self
            .payload
            .unwrap_or(serde_json::Value::Object(Default::default()));
        Ok(PointStruct::new(self.id, vectors, payload))
    }
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

pub(crate) fn default_limit() -> usize {
    10
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

/// The scoring clause at a query/prefetch level. Untagged: serde picks by shape.
///
/// * Bare vector value (dense array, sparse `{indices, values}`, multi `[[...]]`)
///   → `Nearest`.
/// * `{ fusion: 'rrf' | 'dbsf' }` → `Fusion`.
/// * `{ recommend: { positive, negative, strategy? } }` → `Recommend`.
/// * `{ discover: { target, context } }` → `Discover`.
/// * `{ context: [{ positive, negative }] }` → `Context`.
/// * `{ order_by: { key, direction?, start_from? } }` → `OrderBy`.
/// * `{ sample: 'random' }` → `Sample`.
/// * `{ mmr: { vector, lambda?, candidates_limit? } }` → `Mmr`.
///
/// The Formula rescoring clause is intentionally absent; it requires building
/// a typed expression AST that does not impl Deserialize upstream.
#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum QueryClauseInput {
    Nearest(AnyVectorInput),
    Fusion(FusionClause),
    Recommend(RecommendClause),
    Discover(DiscoverClause),
    Context(ContextClauseEnvelope),
    OrderBy(OrderByClauseEnvelope),
    Sample(SampleClause),
    Mmr(MmrClauseEnvelope),
}

impl QueryClauseInput {
    fn into_scoring_query(
        self,
        default_using: Option<String>,
    ) -> Result<qdrant_edge::ScoringQuery, String> {
        match self {
            QueryClauseInput::Nearest(any) => {
                let internal = any.into_vector_internal()?;
                let nq = qdrant_edge::NamedQuery {
                    query: internal,
                    using: default_using,
                };
                Ok(qdrant_edge::ScoringQuery::Vector(qdrant_edge::QueryEnum::Nearest(nq)))
            }
            QueryClauseInput::Fusion(f) => Ok(qdrant_edge::ScoringQuery::Fusion(f.into_fusion())),
            QueryClauseInput::Recommend(r) => r.into_scoring_query(default_using),
            QueryClauseInput::Discover(d) => d.into_scoring_query(default_using),
            QueryClauseInput::Context(c) => c.into_scoring_query(default_using),
            QueryClauseInput::OrderBy(o) => Ok(qdrant_edge::ScoringQuery::OrderBy(o.order_by)),
            QueryClauseInput::Sample(s) => s.into_scoring_query(),
            QueryClauseInput::Mmr(m) => m.into_scoring_query(default_using),
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct RecommendClause {
    pub(crate) recommend: RecommendBody,
}

#[derive(Deserialize)]
pub(crate) struct RecommendBody {
    #[serde(default)]
    pub(crate) positive: Vec<AnyVectorInput>,
    #[serde(default)]
    pub(crate) negative: Vec<AnyVectorInput>,
    /// `"best_score"` (default) or `"sum_scores"`.
    #[serde(default)]
    pub(crate) strategy: Option<String>,
}

impl RecommendClause {
    fn into_scoring_query(
        self,
        default_using: Option<String>,
    ) -> Result<qdrant_edge::ScoringQuery, String> {
        let RecommendBody {
            positive,
            negative,
            strategy,
        } = self.recommend;
        let positives = into_vector_internals(positive)?;
        let negatives = into_vector_internals(negative)?;
        let reco = qdrant_edge::RecommendQuery::new(positives, negatives);
        let nq = qdrant_edge::NamedQuery {
            query: reco,
            using: default_using,
        };
        let qe = match strategy.as_deref().unwrap_or("best_score") {
            "best_score" => qdrant_edge::QueryEnum::RecommendBestScore(nq),
            "sum_scores" => qdrant_edge::QueryEnum::RecommendSumScores(nq),
            other => return Err(format!("Unknown recommend strategy: {other}")),
        };
        Ok(qdrant_edge::ScoringQuery::Vector(qe))
    }
}

#[derive(Deserialize)]
pub(crate) struct DiscoverClause {
    pub(crate) discover: DiscoverBody,
}

#[derive(Deserialize)]
pub(crate) struct DiscoverBody {
    pub(crate) target: AnyVectorInput,
    #[serde(default)]
    pub(crate) context: Vec<ContextPairInput>,
}

impl DiscoverClause {
    fn into_scoring_query(
        self,
        default_using: Option<String>,
    ) -> Result<qdrant_edge::ScoringQuery, String> {
        let target = self.discover.target.into_vector_internal()?;
        let pairs = into_context_pairs(self.discover.context)?;
        let q = qdrant_edge::DiscoverQuery::new(target, pairs);
        let nq = qdrant_edge::NamedQuery {
            query: q,
            using: default_using,
        };
        Ok(qdrant_edge::ScoringQuery::Vector(qdrant_edge::QueryEnum::Discover(nq)))
    }
}

#[derive(Deserialize)]
pub(crate) struct ContextClauseEnvelope {
    pub(crate) context: Vec<ContextPairInput>,
}

impl ContextClauseEnvelope {
    fn into_scoring_query(
        self,
        default_using: Option<String>,
    ) -> Result<qdrant_edge::ScoringQuery, String> {
        let pairs = into_context_pairs(self.context)?;
        let q = qdrant_edge::ContextQuery::new(pairs);
        let nq = qdrant_edge::NamedQuery {
            query: q,
            using: default_using,
        };
        Ok(qdrant_edge::ScoringQuery::Vector(qdrant_edge::QueryEnum::Context(nq)))
    }
}

#[derive(Deserialize)]
pub(crate) struct ContextPairInput {
    pub(crate) positive: AnyVectorInput,
    pub(crate) negative: AnyVectorInput,
}

#[derive(Deserialize)]
pub(crate) struct OrderByClauseEnvelope {
    pub(crate) order_by: qdrant_edge::OrderBy,
}

#[derive(Deserialize)]
pub(crate) struct SampleClause {
    pub(crate) sample: String,
}

impl SampleClause {
    fn into_scoring_query(self) -> Result<qdrant_edge::ScoringQuery, String> {
        match self.sample.as_str() {
            "random" => Ok(qdrant_edge::ScoringQuery::Sample(qdrant_edge::Sample::Random)),
            other => Err(format!("Unknown sample mode: {other}")),
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct MmrClauseEnvelope {
    pub(crate) mmr: MmrBody,
}

#[derive(Deserialize)]
pub(crate) struct MmrBody {
    pub(crate) vector: AnyVectorInput,
    /// Diversity vs relevance: `0.0` = full diversity, `1.0` = full relevance. Default `0.5`.
    #[serde(default = "default_mmr_lambda")]
    pub(crate) lambda: f32,
    /// How many candidates to preselect before MMR rerank. Default `100`.
    #[serde(default = "default_mmr_candidates")]
    pub(crate) candidates_limit: usize,
}

impl MmrClauseEnvelope {
    fn into_scoring_query(
        self,
        default_using: Option<String>,
    ) -> Result<qdrant_edge::ScoringQuery, String> {
        let vector = self.mmr.vector.into_vector_internal()?;
        let mmr = qdrant_edge::Mmr {
            vector,
            using: default_using.unwrap_or_default(),
            lambda: qdrant_edge::external::ordered_float::OrderedFloat(self.mmr.lambda),
            candidates_limit: self.mmr.candidates_limit,
        };
        Ok(qdrant_edge::ScoringQuery::Mmr(mmr))
    }
}

fn default_mmr_lambda() -> f32 {
    0.5
}
fn default_mmr_candidates() -> usize {
    100
}

fn into_vector_internals(
    inputs: Vec<AnyVectorInput>,
) -> Result<Vec<qdrant_edge::VectorInternal>, String> {
    inputs
        .into_iter()
        .map(AnyVectorInput::into_vector_internal)
        .collect()
}

fn into_context_pairs(
    inputs: Vec<ContextPairInput>,
) -> Result<Vec<qdrant_edge::ContextPair<qdrant_edge::VectorInternal>>, String> {
    inputs
        .into_iter()
        .map(|p| {
            Ok(qdrant_edge::ContextPair {
                positive: p.positive.into_vector_internal()?,
                negative: p.negative.into_vector_internal()?,
            })
        })
        .collect()
}

#[derive(Deserialize)]
pub(crate) struct FusionClause {
    pub(crate) fusion: FusionMode,
    /// RRF only; ignored for DBSF. Default `60`.
    #[serde(default = "default_rrf_k")]
    pub(crate) k: usize,
    /// RRF only; weights per prefetch source. `None` weights all sources equally.
    #[serde(default)]
    pub(crate) weights: Option<Vec<f32>>,
}

impl FusionClause {
    fn into_fusion(self) -> qdrant_edge::Fusion {
        match self.fusion {
            FusionMode::Rrf => qdrant_edge::Fusion::Rrf {
                k: self.k,
                weights: self.weights.map(|ws| {
                    ws.into_iter()
                        .map(qdrant_edge::external::ordered_float::OrderedFloat)
                        .collect()
                }),
            },
            FusionMode::Dbsf => qdrant_edge::Fusion::Dbsf,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum FusionMode {
    Rrf,
    Dbsf,
}

fn default_rrf_k() -> usize {
    60
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
