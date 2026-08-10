//! JSON-deserializable input shapes and JSON-serializable output shapes
//! used across the FFI surface. Many `qdrant_edge` core types don't implement
//! `Serialize`/`Deserialize`, so we use these intermediates and convert.

mod clauses;
mod outputs;
mod point;
mod requests;
mod vectors;

pub(crate) use outputs::{RecordOutput, ScoredPointOutput, ScrollOutput, ShardInfoOutput};
pub(crate) use point::PointInput;
pub(crate) use requests::{FacetInput, QueryInput, ScrollInput, SearchInput};
