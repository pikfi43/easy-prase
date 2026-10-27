import assert from 'node:assert/strict'
import test from 'node:test'
import { toArray } from '../src/lib/array-response.ts'

test('catalog response with a missing collection becomes an empty list', () => {
  assert.deepEqual(toArray(undefined), [])
  assert.deepEqual(toArray(null), [])
  assert.deepEqual(toArray({}), [])
})

test('catalog response arrays are preserved', () => {
  const rows = [{ id: 'one' }]
  assert.equal(toArray(rows), rows)
})
