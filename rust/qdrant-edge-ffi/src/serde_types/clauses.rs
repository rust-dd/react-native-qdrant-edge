//! Scoring clause input shapes for query and prefetch levels.

use serde::Deserialize;

use super::vectors::{AnyVectorInput, into_vector_internals};

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
    pub(crate) fn into_scoring_query(
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

pub(crate) fn default_rrf_k() -> usize {
    60
}
