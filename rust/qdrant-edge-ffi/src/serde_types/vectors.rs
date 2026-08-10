//! Vector input shapes shared by points, search, and query clauses, plus the
//! manual vector-to-JSON conversion used by outputs.

use std::collections::HashMap;

use qdrant_edge::external::serde_json;
use qdrant_edge::{Vector, VectorInternal, Vectors};
use serde::Deserialize;

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

pub(crate) fn into_vector_internals(
    inputs: Vec<AnyVectorInput>,
) -> Result<Vec<qdrant_edge::VectorInternal>, String> {
    inputs
        .into_iter()
        .map(AnyVectorInput::into_vector_internal)
        .collect()
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
