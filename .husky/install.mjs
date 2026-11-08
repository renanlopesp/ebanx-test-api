import { existsSync } from 'node:fs'
import process from 'node:process'

// Git hooks are unnecessary in Docker, CI without Git, or production installs.
if (
   process.env.HUSKY !== '0' &&
   process.env.NODE_ENV !== 'production' &&
   existsSync('.git')
) {
   const { default: husky } = await import('husky')
   const message = husky()
   if (message) process.stdout.write(`${message}\n`)
}
