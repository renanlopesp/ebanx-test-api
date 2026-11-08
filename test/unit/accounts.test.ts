import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountError, AccountService } from '../../src/accounts.ts'

test('deposits create accounts and accumulate the stored balance', () => {
   const accountService = new AccountService()
   for (const balance of [10, 20]) {
      assert.deepEqual(
         accountService.processEvent({
            type: 'deposit',
            destination: '100',
            amount: 10,
         }),
         { destination: { id: '100', balance } }
      )
      assert.equal(accountService.getBalance('100'), balance)
   }
})

test('withdrawals reduce the stored balance', () => {
   const accountService = new AccountService()
   accountService.processEvent({
      type: 'deposit',
      destination: '100',
      amount: 10,
   })
   assert.deepEqual(
      accountService.processEvent({
         type: 'withdraw',
         origin: '100',
         amount: 4,
      }),
      { origin: { id: '100', balance: 6 } }
   )
   assert.equal(accountService.getBalance('100'), 6)
})

for (const existingDestination of [false, true]) {
   test(`transfers update both balances with ${existingDestination ? 'an existing' : 'a new'} destination`, () => {
      const accountService = new AccountService()
      accountService.processEvent({
         type: 'deposit',
         destination: '100',
         amount: 10,
      })
      if (existingDestination) {
         accountService.processEvent({
            type: 'deposit',
            destination: '300',
            amount: 3,
         })
      }
      const destinationBalance = existingDestination ? 7 : 4
      assert.deepEqual(
         accountService.processEvent({
            type: 'transfer',
            origin: '100',
            destination: '300',
            amount: 4,
         }),
         {
            origin: { id: '100', balance: 6 },
            destination: { id: '300', balance: destinationBalance },
         }
      )
      assert.equal(accountService.getBalance('100'), 6)
      assert.equal(accountService.getBalance('300'), destinationBalance)
      assert.equal(
         accountService.getBalance('100') + accountService.getBalance('300'),
         existingDestination ? 13 : 10
      )
   })
}

test('insufficient funds reject withdrawals and transfers without changing state', () => {
   const accountService = new AccountService()
   accountService.processEvent({
      type: 'deposit',
      destination: '100',
      amount: 10,
   })
   accountService.processEvent({
      type: 'deposit',
      destination: '300',
      amount: 3,
   })
   const insufficient = (error: unknown) =>
      error instanceof AccountError && error.statusCode === 409

   assert.throws(
      () =>
         accountService.processEvent({
            type: 'withdraw',
            origin: '100',
            amount: 11,
         }),
      insufficient
   )
   for (const destination of ['300', '400']) {
      assert.throws(
         () =>
            accountService.processEvent({
               type: 'transfer',
               origin: '100',
               destination,
               amount: 11,
            }),
         insufficient
      )
      assert.equal(accountService.getBalance('100'), 10)
      assert.equal(accountService.getBalance('300'), 3)
      assert.throws(
         () => accountService.getBalance('400'),
         (error) => error instanceof AccountError && error.statusCode === 404
      )
   }
})

test('missing origins do not create accounts or modify destinations', () => {
   const accountService = new AccountService()
   accountService.processEvent({
      type: 'deposit',
      destination: '300',
      amount: 3,
   })
   const missing = (error: unknown) =>
      error instanceof AccountError && error.statusCode === 404

   assert.throws(
      () =>
         accountService.processEvent({
            type: 'withdraw',
            origin: '200',
            amount: 1,
         }),
      missing
   )
   for (const destination of ['300', '400']) {
      assert.throws(
         () =>
            accountService.processEvent({
               type: 'transfer',
               origin: '200',
               destination,
               amount: 1,
            }),
         missing
      )
      assert.equal(accountService.getBalance('300'), 3)
      assert.throws(() => accountService.getBalance('200'), missing)
      assert.throws(() => accountService.getBalance('400'), missing)
   }
})

test('account results are snapshots, not mutable storage references', () => {
   const accountService = new AccountService()
   const first = accountService.processEvent({
      type: 'deposit',
      destination: '100',
      amount: 10,
   })
   accountService.processEvent({
      type: 'deposit',
      destination: '100',
      amount: 5,
   })
   assert.deepEqual(first, { destination: { id: '100', balance: 10 } })
   if (first.destination) first.destination.balance = 999
   assert.equal(accountService.getBalance('100'), 15)
})

test('non-finite amounts are rejected without creating accounts', () => {
   const accountService = new AccountService()
   for (const amount of [NaN, Infinity, -Infinity]) {
      assert.throws(
         () =>
            accountService.processEvent({
               type: 'deposit',
               destination: '100',
               amount,
            }),
         (error) => error instanceof AccountError && error.statusCode === 400
      )
   }
   assert.throws(
      () => accountService.getBalance('100'),
      (error) => error instanceof AccountError && error.statusCode === 404
   )
})

test('withdrawal may use the whole balance without deleting the account', () => {
   const accountService = new AccountService()
   accountService.processEvent({
      type: 'deposit',
      destination: '100',
      amount: 10,
   })
   assert.deepEqual(
      accountService.processEvent({
         type: 'withdraw',
         origin: '100',
         amount: 10,
      }),
      {
         origin: { id: '100', balance: 0 },
      }
   )
   assert.equal(accountService.getBalance('100'), 0)
})
