import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../../src/app.ts'

function setup(t: { after: (fn: () => Promise<void>) => void }) {
   const app = buildApp()
   t.after(() => app.close())
   return {
      app,
      event: (payload: unknown) =>
         app.inject({
            method: 'POST',
            url: '/event',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify(payload),
         }),
      balance: (accountId: string) =>
         app.inject({ method: 'GET', url: `/balance?account_id=${accountId}` }),
   }
}

test('complete validation sequence', async (t) => {
   const { app, event, balance } = setup(t)
   const reset = await app.inject({ method: 'POST', url: '/reset' })
   assert.equal(reset.statusCode, 200)
   assert.equal(reset.body, 'OK')

   const missing = await balance('1234')
   assert.equal(missing.statusCode, 404)
   assert.equal(missing.body, '0')

   for (const expected of [10, 20]) {
      const response = await event({
         type: 'deposit',
         destination: '100',
         amount: 10,
      })
      assert.equal(response.statusCode, 201)
      assert.deepEqual(response.json(), {
         destination: { id: '100', balance: expected },
      })
   }
   const existing = await balance('100')
   assert.equal(existing.statusCode, 200)
   assert.equal(existing.body, '20')

   const missingWithdrawal = await event({
      type: 'withdraw',
      origin: '200',
      amount: 10,
   })
   assert.equal(missingWithdrawal.statusCode, 404)
   assert.equal(missingWithdrawal.body, '0')

   const withdrawal = await event({
      type: 'withdraw',
      origin: '100',
      amount: 5,
   })
   assert.equal(withdrawal.statusCode, 201)
   assert.deepEqual(withdrawal.json(), { origin: { id: '100', balance: 15 } })

   const transfer = await event({
      type: 'transfer',
      origin: '100',
      destination: '300',
      amount: 15,
   })
   assert.equal(transfer.statusCode, 201)
   assert.deepEqual(transfer.json(), {
      origin: { id: '100', balance: 0 },
      destination: { id: '300', balance: 15 },
   })

   const missingTransfer = await event({
      type: 'transfer',
      origin: '200',
      destination: '300',
      amount: 15,
   })
   assert.equal(missingTransfer.statusCode, 404)
   assert.equal(missingTransfer.body, '0')
   assert.equal((await balance('300')).body, '15')
   const zero = await balance('100')
   assert.equal(zero.statusCode, 200)
   assert.equal(zero.body, '0')
})

test('invalid events never change balances', async (t) => {
   const { event, balance } = setup(t)
   await event({ type: 'deposit', destination: '100', amount: 10 })
   const invalid = [
      ...[-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, '5', null].flatMap(
         (amount) => [
            { type: 'deposit', destination: '100', amount },
            { type: 'withdraw', origin: '100', amount },
            { type: 'transfer', origin: '100', destination: '300', amount },
         ]
      ),
      { type: 'transfer', origin: '100', destination: '100', amount: 1 },
      { type: 'unknown', amount: 1 },
      { type: 'deposit', destination: '', amount: 1 },
      { type: 'deposit', destination: 100, amount: 1 },
      { type: 'withdraw', amount: 1 },
      { type: 'transfer', origin: '100', amount: 1 },
      {},
      [],
   ]
   for (const payload of invalid) {
      assert.equal(
         (await event(payload)).statusCode,
         400,
         JSON.stringify(payload)
      )
   }
   assert.equal((await balance('100')).body, '10')
   assert.equal((await balance('300')).statusCode, 404)
})

test('insufficient funds and missing origins have no partial effects', async (t) => {
   const { event, balance } = setup(t)
   await event({ type: 'deposit', destination: '100', amount: 10 })
   await event({ type: 'deposit', destination: '300', amount: 3 })
   assert.equal(
      (await event({ type: 'withdraw', origin: '100', amount: 11 })).statusCode,
      409
   )
   for (const destination of ['300', '400']) {
      assert.equal(
         (
            await event({
               type: 'transfer',
               origin: '100',
               destination,
               amount: 11,
            })
         ).statusCode,
         409
      )
      const missing = await event({
         type: 'transfer',
         origin: '200',
         destination,
         amount: 1,
      })
      assert.equal(missing.statusCode, 404)
      assert.equal(missing.body, '0')
   }
   assert.equal((await balance('100')).body, '10')
   assert.equal((await balance('300')).body, '3')
   assert.equal((await balance('400')).statusCode, 404)
   assert.equal((await balance('200')).statusCode, 404)
})

test('reads do not create accounts, IDs preserve leading zeros, and reset clears all state', async (t) => {
   const { app, event, balance } = setup(t)
   assert.equal((await balance('100')).statusCode, 404)
   assert.equal((await balance('100')).statusCode, 404)
   await event({ type: 'deposit', destination: '0100', amount: 7 })
   assert.equal((await balance('0100')).body, '7')
   assert.equal((await balance('100')).statusCode, 404)
   for (const url of [
      '/balance',
      '/balance?account_id=',
      '/balance?account_id=a&account_id=b',
   ]) {
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 400)
   }
   await app.inject({ method: 'POST', url: '/reset' })
   assert.equal((await balance('0100')).statusCode, 404)
   const reset = await app.inject({ method: 'POST', url: '/reset' })
   assert.equal(reset.statusCode, 200)
   assert.equal(reset.body, 'OK')
})

test('repeated GET requests preserve existing balances and subsequent operations', async (t) => {
   const { event, balance } = setup(t)
   const deposit = await event({
      type: 'deposit',
      destination: '100',
      amount: 10,
   })
   assert.equal(deposit.statusCode, 201)

   for (let read = 0; read < 3; read++) {
      const response = await balance('100')
      assert.equal(response.statusCode, 200)
      assert.equal(response.body, '10')
   }

   const withdrawal = await event({
      type: 'withdraw',
      origin: '100',
      amount: 4,
   })
   assert.equal(withdrawal.statusCode, 201)
   assert.deepEqual(withdrawal.json(), { origin: { id: '100', balance: 6 } })
   const afterWithdrawal = await balance('100')
   assert.equal(afterWithdrawal.statusCode, 200)
   assert.equal(afterWithdrawal.body, '6')
})

test('application instances have independent state', async (t) => {
   const first = setup(t)
   const second = setup(t)
   await first.event({ type: 'deposit', destination: '100', amount: 10 })
   assert.equal((await second.balance('100')).statusCode, 404)
   await second.app.inject({ method: 'POST', url: '/reset' })
   assert.equal((await first.balance('100')).body, '10')
})

test('balance overflow is rejected before any account changes', async (t) => {
   const { event, balance } = setup(t)
   await event({ type: 'deposit', destination: '100', amount: 1 })
   await event({
      type: 'deposit',
      destination: '300',
      amount: Number.MAX_SAFE_INTEGER,
   })
   assert.equal(
      (await event({ type: 'deposit', destination: '300', amount: 1 }))
         .statusCode,
      400
   )
   assert.equal(
      (
         await event({
            type: 'transfer',
            origin: '100',
            destination: '300',
            amount: 1,
         })
      ).statusCode,
      400
   )
   assert.equal((await balance('100')).body, '1')
   assert.equal((await balance('300')).body, String(Number.MAX_SAFE_INTEGER))
})

test('reset accepts an empty JSON body and clears existing accounts', async (t) => {
   const { app, event, balance } = setup(t)
   for (const contentType of [
      'application/json',
      'application/json; charset=utf-8',
   ]) {
      await event({ type: 'deposit', destination: '100', amount: 10 })
      const response = await app.inject({
         method: 'POST',
         url: '/reset',
         headers: { 'content-type': contentType },
         payload: '',
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.body, 'OK')
      assert.match(response.headers['content-type'] ?? '', /text\/plain/)
      const missing = await balance('100')
      assert.equal(missing.statusCode, 404)
      assert.equal(missing.body, '0')
   }
})

test('reset still accepts valid JSON bodies', async (t) => {
   const { app, event, balance } = setup(t)
   await event({ type: 'deposit', destination: '100', amount: 10 })
   const response = await app.inject({
      method: 'POST',
      url: '/reset',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
   })
   assert.equal(response.statusCode, 200)
   assert.equal(response.body, 'OK')
   assert.equal((await balance('100')).statusCode, 404)
})

test('malformed JSON on reset does not clear accounts', async (t) => {
   const { app, event, balance } = setup(t)
   await event({ type: 'deposit', destination: '100', amount: 10 })
   const response = await app.inject({
      method: 'POST',
      url: '/reset',
      headers: { 'content-type': 'application/json' },
      payload: '{',
   })
   assert.equal(response.statusCode, 400)
   assert.equal((await balance('100')).body, '10')
})

test('empty JSON on event is still rejected without changing balances', async (t) => {
   const { app, event, balance } = setup(t)
   await event({ type: 'deposit', destination: '100', amount: 10 })
   const response = await app.inject({
      method: 'POST',
      url: '/event',
      headers: { 'content-type': 'application/json' },
      payload: '',
   })
   assert.equal(response.statusCode, 400)
   assert.equal(response.json().code, 'FST_ERR_CTP_EMPTY_JSON_BODY')
   assert.equal((await balance('100')).body, '10')
})

test('malformed JSON returns 400', async (t) => {
   const { app } = setup(t)
   const response = await app.inject({
      method: 'POST',
      url: '/event',
      headers: { 'content-type': 'application/json' },
      payload: '{',
   })
   assert.equal(response.statusCode, 400)
})
