import Fastify, { type FastifyServerOptions } from 'fastify'
import { accountRoutes } from './routes.ts'

export function buildApp(options: FastifyServerOptions = {}) {
   const app = Fastify(options)

   app.get('/health', async () => ({ status: 'ok' }))
   app.register(accountRoutes)

   return app
}
