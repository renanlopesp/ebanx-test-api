import type { FastifyInstance } from 'fastify'
import { AccountError, AccountService, type AccountEvent } from './accounts.ts'

function isAccountId(value: unknown): value is string {
   return typeof value === 'string' && value.trim().length > 0
}

function parseAccountEvent(body: unknown): AccountEvent {
   if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new AccountError('Event must be an object', 400)
   }
   const event = body as Record<string, unknown>
   if (typeof event.amount !== 'number') {
      throw new AccountError('Amount must be a number', 400)
   }
   const amount = event.amount
   switch (event.type) {
      case 'deposit':
         if (isAccountId(event.destination)) {
            return { type: 'deposit', destination: event.destination, amount }
         }
         break
      case 'withdraw':
         if (isAccountId(event.origin)) {
            return { type: 'withdraw', origin: event.origin, amount }
         }
         break
      case 'transfer':
         if (isAccountId(event.origin) && isAccountId(event.destination)) {
            return {
               type: 'transfer',
               origin: event.origin,
               destination: event.destination,
               amount,
            }
         }
         break
   }
   throw new AccountError('Invalid event type or account ID', 400)
}

export async function accountRoutes(app: FastifyInstance) {
   const accountService = new AccountService()

   app.setErrorHandler((error, request, reply) => {
      if (error instanceof AccountError) {
         if (error.statusCode === 404) return reply.code(404).send(0)
         return reply.code(error.statusCode).send({ message: error.message })
      }

      reply.send(error)
   })

   app.register(async (resetRoutes) => {
      const parseJson = resetRoutes.getDefaultJsonParser('error', 'error')
      resetRoutes.removeContentTypeParser('application/json')
      resetRoutes.addContentTypeParser(
         'application/json',
         { parseAs: 'string' },
         (request, body, done) => {
            // Some clients send a JSON content type even when reset has no body.
            const json = body.toString()
            if (json === '') return done(null, null)
            parseJson(request, json, done)
         }
      )

      resetRoutes.post('/reset', async (_, reply) => {
         accountService.reset()
         return reply.type('text/plain').code(200).send('OK')
      })
   })

   app.get<{ Querystring: { account_id?: unknown } }>(
      '/balance',
      async (request) => {
         const accountId = request.query.account_id
         if (!isAccountId(accountId))
            throw new AccountError('Account ID must be a non-empty string', 400)
         return accountService.getBalance(accountId)
      }
   )

   app.post<{ Body: unknown }>('/event', async (request, reply) => {
      const result = accountService.processEvent(
         parseAccountEvent(request.body)
      )
      return reply.code(201).send(result)
   })
}
