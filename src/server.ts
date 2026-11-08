import { buildApp } from './app.ts'

const app = buildApp({ logger: true })

async function start() {
   const port = Number(process.env.PORT ?? 3000)
   const host = process.env.HOST ?? '0.0.0.0'

   if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535')
   }

   await app.listen({ port, host })
}

async function shutdown() {
   try {
      await app.close()
   } catch (error) {
      app.log.error(error)
      process.exitCode = 1
   }
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

start().catch(async (error: unknown) => {
   app.log.error(error)
   process.exitCode = 1
   await shutdown()
})
