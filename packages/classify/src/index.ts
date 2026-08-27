/**
 * The shared classification layer — "the trainer, in the background".
 *
 * Both apps read photographs, and both must agree on what a reading is. The
 * dashboard classifies a capture the moment a client or an admin uploads it; the
 * trainer classifies a photo when someone asks it to. Same model, same schema,
 * same vocabulary, one implementation.
 *
 * The output schema has **no field for a quantity, count, area or percentage**.
 * That omission is the point, and it is why this is a package rather than a
 * convention: a second implementation is exactly where such a field would
 * reappear.
 */

export {
  classify,
  classifierAvailable,
  type ClassifyInput,
  explainError,
  modelName,
} from "./classify.js";
export {
  type Classification,
  CONDITION_TYPES,
  type ConditionTag,
  conditionLabel,
  HAND_CLASSIFIED,
  isHandClassified,
  isSeverity,
  parseConditions,
  type Severity,
  SEVERITIES,
  TRADES,
  tradeLabel,
} from "./domain.js";
