import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountError, Accounts } from '../../src/accounts.ts'

test('account results are snapshots, not mutable storage references', () => {
   const accounts = new Accounts()
   const first = accounts.execute({
      type: 'deposit',
      destination: '100',
      amount: 10,
   })
   accounts.execute({ type: 'deposit', destination: '100', amount: 5 })
   assert.deepEqual(first, { destination: { id: '100', balance: 10 } })
   if (first.destination) first.destination.balance = 999
   assert.equal(accounts.balance('100'), 15)
})

test('non-finite amounts are rejected without creating accounts', () => {
   const accounts = new Accounts()
   for (const amount of [NaN, Infinity, -Infinity]) {
      assert.throws(
         () =>
            accounts.execute({ type: 'deposit', destination: '100', amount }),
         (error) => error instanceof AccountError && error.statusCode === 400
      )
   }
   assert.throws(
      () => accounts.balance('100'),
      (error) => error instanceof AccountError && error.statusCode === 404
   )
})

test('withdrawal may use the whole balance without deleting the account', () => {
   const accounts = new Accounts()
   accounts.execute({ type: 'deposit', destination: '100', amount: 10 })
   assert.deepEqual(
      accounts.execute({ type: 'withdraw', origin: '100', amount: 10 }),
      {
         origin: { id: '100', balance: 0 },
      }
   )
   assert.equal(accounts.balance('100'), 0)
})
