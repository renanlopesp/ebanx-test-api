export type Account = { id: string; balance: number }

export type AccountEvent =
   | { type: 'deposit'; destination: string; amount: number }
   | { type: 'withdraw'; origin: string; amount: number }
   | { type: 'transfer'; origin: string; destination: string; amount: number }

export class AccountError extends Error {
   readonly statusCode: 400 | 404 | 409

   constructor(message: string, statusCode: 400 | 404 | 409) {
      super(message)
      this.statusCode = statusCode
   }
}

export class AccountService {
   private readonly accountBalances = new Map<string, number>()

   reset() {
      this.accountBalances.clear()
   }

   getBalance(accountId: string): number {
      const balance = this.accountBalances.get(accountId)
      if (balance === undefined)
         throw new AccountError('Account not found', 404)
      return balance
   }

   processEvent(event: AccountEvent): {
      origin?: Account
      destination?: Account
   } {
      if (!Number.isSafeInteger(event.amount) || event.amount <= 0) {
         throw new AccountError('Amount must be a positive safe integer', 400)
      }

      if (event.type === 'transfer' && event.origin === event.destination) {
         throw new AccountError('Origin and destination must be different', 400)
      }

      // Validate all balances before mutating either account. No async work here.
      const originBalance =
         event.type === 'deposit' ? undefined : this.getBalance(event.origin)
      if (originBalance !== undefined && originBalance < event.amount) {
         throw new AccountError('Insufficient balance', 409)
      }

      const destinationBalance =
         event.type === 'withdraw'
            ? undefined
            : (this.accountBalances.get(event.destination) ?? 0) + event.amount
      if (
         destinationBalance !== undefined &&
         !Number.isSafeInteger(destinationBalance)
      ) {
         throw new AccountError(
            'Resulting balance exceeds the safe integer limit',
            400
         )
      }

      const result: { origin?: Account; destination?: Account } = {}
      if (event.type !== 'deposit' && originBalance !== undefined) {
         const balance = originBalance - event.amount
         this.accountBalances.set(event.origin, balance)
         result.origin = { id: event.origin, balance }
      }
      if (event.type !== 'withdraw' && destinationBalance !== undefined) {
         this.accountBalances.set(event.destination, destinationBalance)
         result.destination = {
            id: event.destination,
            balance: destinationBalance,
         }
      }
      return result
   }
}
