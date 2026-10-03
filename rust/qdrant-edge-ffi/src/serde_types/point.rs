//! Point upsert input shape.

use qdrant_edge::external::serde_json;
use qdrant_edge::{PointId, PointStruct};
use serde::Deserialize;

use super::vectors::VectorInput;

#[derive(Deserialize)]
pub(crate) struct PointInput {
    #[serde(deserialize_with = "super::ids::point_id")]
    pub(crate) id: PointId,
    pub(crate) vector: VectorInput,
    /// A map, not any JSON value: `PointStruct::new` panics on a non-object payload.
    #[serde(default)]
    pub(crate) payload: Option<serde_json::Map<String, serde_json::Value>>,
}

impl PointInput {
    pub(crate) fn into_point_struct(self) -> Result<PointStruct, String> {
        let vectors = self.vector.into_vectors()?;
        let payload = serde_json::Value::Object(self.payload.unwrap_or_default());
        Ok(PointStruct::new(self.id, vectors, payload))
    }
}
