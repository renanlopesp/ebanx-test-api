import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../../src/app.ts'

test('GET /health returns the application status', async (t) => {
   const app = buildApp()
   t.after(() => app.close())

   const response = await app.inject({ method: 'GET', url: '/health' })

   assert.equal(response.statusCode, 200)
   assert.match(response.headers['content-type'] ?? '', /application\/json/)
   assert.deepEqual(response.json(), { status: 'ok' })
})

test('unknown routes return 404', async (t) => {
   const app = buildApp()
   t.after(() => app.close())

   const response = await app.inject({ method: 'GET', url: '/unknown' })

   assert.equal(response.statusCode, 404)
})
