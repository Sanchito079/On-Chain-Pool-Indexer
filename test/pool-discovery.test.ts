import assert from 'node:assert/strict';
import test from 'node:test';
import { isDammPoolCreation, isDlmmPoolCreation, isOrcaWhirlpoolCreation, isRaydiumPoolCreation, wasAccountCreated } from '../src/pool-discovery.js';

test('only accepts Raydium pool creation logs', () => {
  assert.equal(isRaydiumPoolCreation(['Program log: Instruction: CreatePool']), true);
  assert.equal(isRaydiumPoolCreation(['Program log: Instruction: InitializeTickArray']), false);
  assert.equal(isRaydiumPoolCreation(['Program log: Instruction: InitializeReward']), false);
});

test('only accepts DAMM pool creation logs', () => {
  assert.equal(isDammPoolCreation(['Program log: Instruction: InitializePool']), true);
  assert.equal(isDammPoolCreation(['Program log: Instruction: InitializeCustomizablePool']), true);
  assert.equal(isDammPoolCreation(['Program log: Instruction: InitializePosition']), false);
});

test('only accepts DLMM pool creation logs', () => {
  assert.equal(isDlmmPoolCreation(['Program log: Instruction: InitializeLbPair']), true);
  assert.equal(isDlmmPoolCreation(['Program log: Instruction: InitializeCustomizablePermissionlessLbPair2']), true);
  assert.equal(isDlmmPoolCreation(['Program log: Instruction: InitializeBinArray']), false);
});

test('recognizes only newly funded accounts', () => {
  assert.equal(wasAccountCreated(0, 1_000_000), true);
  assert.equal(wasAccountCreated(1_000_000, 1_000_000), false);
  assert.equal(wasAccountCreated(undefined, 1_000_000), false);
});

test('only accepts Orca Whirlpool pool initialization logs', () => {
  assert.equal(isOrcaWhirlpoolCreation(['Program log: Instruction: InitializePool']), true);
  assert.equal(isOrcaWhirlpoolCreation(['Program log: Instruction: InitializeReward']), false);
});