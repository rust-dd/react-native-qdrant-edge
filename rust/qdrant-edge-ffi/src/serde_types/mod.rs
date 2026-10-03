//! JSON-deserializable input shapes and JSON-serializable output shapes
//! used across the FFI surface. Many `qdrant_edge` core types don't implement
//! `Serialize`/`Deserialize`, so we use these intermediates and convert.

mod clauses;
mod defaults;
mod ids;
mod outputs;
mod point;
mod requests;
mod vectors;

pub(crate) use defaults::{parse_edge_config, parse_hnsw_config};
pub(crate) use ids::{parse_filter, parse_point_ids, parse_targeted};
pub(crate) use outputs::{
    GroupOutput, RecordOutput, ScoredPointOutput, ScrollOutput, SearchMatrixOutput,
    ShardInfoOutput,
};
pub(crate) use point::PointInput;
pub(crate) use requests::{
    FacetInput, GroupsInput, MatrixInput, QueryInput, ScrollInput, SearchInput,
};
pub(crate) use vectors::vector_struct_to_json;
