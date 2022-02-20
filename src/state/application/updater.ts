import { useCallback, useEffect, useState } from 'react'
import { useActiveWeb3React } from '../../hooks'
import useDebounce from '../../hooks/useDebounce'
import useIsWindowVisible from '../../hooks/useIsWindowVisible'
import { updateBlock } from './actions'
import { useDispatch } from 'react-redux'

export default function Updater(): null {
  const { library, chainId } = useActiveWeb3React()
  const dispatch = useDispatch()

  const windowVisible = useIsWindowVisible()

  const [state, setState] = useState<{
    chainId: number | undefined
    blockNumber: number | null
    blockHash: string | null
  }>({
    chainId,
    blockNumber: null,
    blockHash: null
  })

  const blockCallback = useCallback(
    async (blockNumber: number, blockHash: string) => {
      if (blockHash === undefined) {
        blockHash = (await library!.getBlock(blockNumber)).hash
      }
      setState(state => {
        if (chainId === state.chainId) {
          if (typeof state.blockNumber !== 'number' || typeof state.blockHash !== 'string')
            return { chainId, blockNumber, blockHash }
          return { chainId, blockNumber: Math.max(blockNumber, state.blockNumber), blockHash }
        }
        return state
      })
    },
    [chainId, setState]
  )

  // attach/detach listeners
  useEffect(() => {
    const getBlockInfo = async () => {
      const blockNumber = await library!.getBlockNumber()
      const blockHash = (await library!.getBlock(blockNumber)).hash

      blockCallback(blockNumber, blockHash)
    }

    if (!library || !chainId || !windowVisible) return undefined

    setState({ chainId, blockNumber: null, blockHash: null })

    getBlockInfo().catch(error => console.error(`Failed to get block number for chainId: ${chainId}`, error))

    library.on('block', blockCallback)
    return () => {
      library.removeListener('block', blockCallback)
    }
  }, [dispatch, chainId, library, blockCallback, windowVisible])

  const debouncedState = useDebounce(state, 100)

  useEffect(() => {
    if (!debouncedState.chainId || !debouncedState.blockNumber || !windowVisible) return
    dispatch(
      updateBlock({
        chainId: debouncedState.chainId,
        blockNumber: debouncedState.blockNumber,
        blockHash: debouncedState.blockHash ?? ''
      })
    )
  }, [windowVisible, dispatch, debouncedState.blockNumber, debouncedState.chainId])

  return null
}
