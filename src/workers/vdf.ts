import { generateVdf } from '@slowswap/vdf'

type Numberish = string | number | bigint | { toString(b?: number): string }

interface GenerateVdfInputs {
  id: string
  n: Numberish
  t: number
  origin: string
  path: string[]
  knownQtyIn: Numberish
  knownQtyOut: Numberish
  blockHash: string
  blockNumber: number
}

const ctx: Worker = self as any

ctx.addEventListener('message', ev => {
    console.log('foo');
  const data = ev.data as GenerateVdfInputs
  const proof = generateVdf({
    ...data,
    onProgress: progress => {
      ctx.postMessage({ id: data.id, progress, proof: undefined })
    }
  })
  ctx.postMessage({ id: data.id, progress: 1.0, proof })
})
