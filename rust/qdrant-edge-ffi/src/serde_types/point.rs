//! Point upsert input shape.

use qdrant_edge::external::serde_json;
use qdrant_edge::{PointId, PointStruct};
use serde::Deserialize;

use super::vectors::VectorInput;

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
