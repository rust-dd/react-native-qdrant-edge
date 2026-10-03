//! Outputs render every point ID as a string, so inputs accept a numeric
//! string wherever a point ID goes (`"42"` reads as the u64 id `42`).

use qdrant_edge::external::serde_json::{self, Value};
use qdrant_edge::{Filter, PointId};
use serde::de::{DeserializeOwned, Error as _};
use serde::{Deserialize, Deserializer};

fn normalize_point_id(id: &mut Value) {
    if let Some(n) = id.as_str().and_then(|s| s.parse::<u64>().ok()) {
        *id = Value::from(n);
    }
}

fn normalize_point_ids(ids: &mut Value) {
    if let Value::Array(items) = ids {
        items.iter_mut().for_each(normalize_point_id);
    }
}

fn normalize_filter(filter: &mut Value) {
    let Value::Object(map) = filter else { return };
    for clause in ["must", "should", "must_not"] {
        match map.get_mut(clause) {
            Some(Value::Array(conditions)) => conditions.iter_mut().for_each(normalize_condition),
            Some(condition) => normalize_condition(condition),
            None => {}
        }
    }
    let min_should = map
        .get_mut("min_should")
        .and_then(|m| m.get_mut("conditions"));
    if let Some(Value::Array(conditions)) = min_should {
        conditions.iter_mut().for_each(normalize_condition);
    }
}

fn normalize_condition(condition: &mut Value) {
    let Value::Object(map) = condition else {
        return;
    };
    // Field conditions match payload values, which must stay as written.
    if map.contains_key("key") {
        return;
    }
    if let Some(ids) = map.get_mut("has_id") {
        normalize_point_ids(ids);
    }
    if let Some(filter) = map.get_mut("nested").and_then(|n| n.get_mut("filter")) {
        normalize_filter(filter);
    }
    normalize_filter(condition);
}

pub(crate) fn point_id<'de, D: Deserializer<'de>>(d: D) -> Result<PointId, D::Error> {
    let mut value = Value::deserialize(d)?;
    normalize_point_id(&mut value);
    serde_json::from_value(value).map_err(D::Error::custom)
}

pub(crate) fn opt_point_id<'de, D: Deserializer<'de>>(d: D) -> Result<Option<PointId>, D::Error> {
    let Some(mut value) = Option::<Value>::deserialize(d)? else {
        return Ok(None);
    };
    normalize_point_id(&mut value);
    serde_json::from_value(value)
        .map(Some)
        .map_err(D::Error::custom)
}

pub(crate) fn opt_filter<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Filter>, D::Error> {
    let Some(mut value) = Option::<Value>::deserialize(d)? else {
        return Ok(None);
    };
    normalize_filter(&mut value);
    serde_json::from_value(value)
        .map(Some)
        .map_err(D::Error::custom)
}

pub(crate) fn parse_point_ids(json: &str) -> serde_json::Result<Vec<PointId>> {
    let mut value: Value = serde_json::from_str(json)?;
    normalize_point_ids(&mut value);
    serde_json::from_value(value)
}

pub(crate) fn parse_filter(json: &str) -> serde_json::Result<Filter> {
    let mut value: Value = serde_json::from_str(json)?;
    normalize_filter(&mut value);
    serde_json::from_value(value)
}

/// Parses a payload-op shape, normalizing its `points` and `filter` targets.
pub(crate) fn parse_targeted<T: DeserializeOwned>(json: &str) -> serde_json::Result<T> {
    let mut value: Value = serde_json::from_str(json)?;
    if let Value::Object(map) = &mut value {
        if let Some(points) = map.get_mut("points") {
            normalize_point_ids(points);
        }
        if let Some(filter) = map.get_mut("filter") {
            normalize_filter(filter);
        }
    }
    serde_json::from_value(value)
}
