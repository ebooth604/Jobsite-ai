import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assessWindow,
  computeProductivity,
  detectDrift,
  InvalidScopeItemError,
} from './productivity.ts';
import type { QuantityObservation, ScopeItemId, Unit } from './types.ts';

const scopeItem = { budgetedQuantity: 12_000, budgetedHours: 780 };

function observation(over: Partial<QuantityObservation> = {}): QuantityObservation {
  return {
    id: crypto.randomUUID(),
    scopeItemId: 'scope-1' as ScopeItemId,
    observedOn: '2026-08-21',
    estimatedQuantity: 100,
    unit: 'LF' as Unit,
    confidence: 0.9,
    confidenceBandHalfWidth: 8,
    abstained: false,
    sourceCaptureIds: [],
    ...over,
  };
}

test('a factor of 0.71 on a 780-hour scope projects roughly a 320-hour overrun', () => {
  // The worked example from the business plan. 71% of bid productivity.
  const budgetedUnitsPerHour = scopeItem.budgetedQuantity / scopeItem.budgetedHours;
  const actualHours = 100;
  const installedQuantity = 0.71 * actualHours * budgetedUnitsPerHour;

  const result = computeProductivity({ scopeItem, installedQuantity, actualHours });

  assert.ok(Math.abs(result.productivityFactor - 0.71) < 1e-9);
  assert.ok(
    Math.abs(result.projectedOverrunHours - 318.6) < 1,
    `expected ~319h overrun, got ${result.projectedOverrunHours}`,
  );
});

test('installing exactly at bid rate yields a factor of 1 and no overrun', () => {
  const result = computeProductivity({
    scopeItem,
    installedQuantity: scopeItem.budgetedQuantity,
    actualHours: scopeItem.budgetedHours,
  });
  assert.equal(result.productivityFactor, 1);
  assert.equal(result.projectedOverrunHours, 0);
});

test('beating the bid projects an underrun, not a negative-hours absurdity', () => {
  const result = computeProductivity({ scopeItem, installedQuantity: 12_000, actualHours: 600 });
  assert.ok(result.productivityFactor > 1);
  assert.ok(result.projectedOverrunHours < 0);
  assert.ok(result.projectedTotalHours > 0);
});

test('an unusable bid throws rather than returning a misleading number', () => {
  for (const bad of [
    { budgetedQuantity: 12_000, budgetedHours: 0 },
    { budgetedQuantity: 0, budgetedHours: 780 },
  ]) {
    assert.throws(
      () => computeProductivity({ scopeItem: bad, installedQuantity: 100, actualHours: 10 }),
      InvalidScopeItemError,
    );
  }
  assert.throws(
    () => computeProductivity({ scopeItem, installedQuantity: 100, actualHours: 0 }),
    InvalidScopeItemError,
  );
});

test('nothing installed yet reports infinite projection instead of a fake zero', () => {
  const result = computeProductivity({ scopeItem, installedQuantity: 0, actualHours: 40 });
  assert.equal(result.productivityFactor, 0);
  assert.equal(result.projectedTotalHours, Number.POSITIVE_INFINITY);
});

test('abstentions are excluded, never counted as zero installed', () => {
  const observations = [
    observation({ estimatedQuantity: 100 }),
    observation({ abstained: true, estimatedQuantity: 0 }),
    observation({ estimatedQuantity: 120 }),
  ];
  const assessment = assessWindow(observations);
  assert.equal(assessment.installedQuantity, 220);
  assert.equal(assessment.usedObservationCount, 2);
  assert.equal(assessment.excludedObservationCount, 1);
});

test('low-confidence observations are excluded', () => {
  const assessment = assessWindow([
    observation({ estimatedQuantity: 100, confidence: 0.95 }),
    observation({ estimatedQuantity: 900, confidence: 0.2 }),
  ]);
  assert.equal(assessment.installedQuantity, 100);
  assert.equal(assessment.excludedObservationCount, 1);
});

test('a human correction overrides confidence gating and the estimate', () => {
  const assessment = assessWindow([
    observation({ estimatedQuantity: 999, confidence: 0.1, correctedQuantity: 150 }),
  ]);
  assert.equal(assessment.installedQuantity, 150);
  assert.equal(assessment.excludedObservationCount, 0);
});

test('drift alerts require sustained signal, not one bad day', () => {
  const oneDay = [observation({ estimatedQuantity: 10 })];
  assert.equal(
    detectDrift('scope-1', scopeItem, oneDay, 40, '2026-08-15'),
    null,
    'a single observation must not raise an alert',
  );
});

test('a sustained drop below bid raises an alert with the projected overrun', () => {
  const budgetedUnitsPerHour = scopeItem.budgetedQuantity / scopeItem.budgetedHours;
  const actualHours = 120;
  // Six days of observations totalling 71% of what the bid expected.
  const perDay = (0.71 * actualHours * budgetedUnitsPerHour) / 6;
  const observations = Array.from({ length: 6 }, () =>
    observation({ estimatedQuantity: perDay }),
  );

  const alert = detectDrift('scope-1', scopeItem, observations, actualHours, '2026-08-15');
  assert.ok(alert, 'expected an alert');
  assert.ok(Math.abs(alert.productivityFactor - 0.71) < 1e-9);
  assert.ok(alert.projectedOverrunHours > 300);
  assert.equal(alert.observedDays, 6);
});

test('a crew running at or near bid does not get alerted on', () => {
  const budgetedUnitsPerHour = scopeItem.budgetedQuantity / scopeItem.budgetedHours;
  const actualHours = 120;
  const perDay = (0.98 * actualHours * budgetedUnitsPerHour) / 6;
  const observations = Array.from({ length: 6 }, () =>
    observation({ estimatedQuantity: perDay }),
  );
  assert.equal(detectDrift('scope-1', scopeItem, observations, actualHours, '2026-08-15'), null);
});

test('an unusable bid produces no alert rather than a crash', () => {
  const observations = Array.from({ length: 6 }, () => observation());
  assert.equal(
    detectDrift('scope-1', { budgetedQuantity: 0, budgetedHours: 0 }, observations, 40, '2026-08-15'),
    null,
  );
});
