import { Trade, TradeType } from '@uniswap/sdk'
import { generateSeed, generateX, generateChallenge, generateProof, evaluateVdf } from '@slowswap/vdf'
import React, { useContext, useMemo, useState, useEffect } from 'react'
import { Repeat } from 'react-feather'
import { Text } from 'rebass'
import { ThemeContext } from 'styled-components'
import { Field } from '../../state/swap/actions'
import { TYPE } from '../../theme'
import { useActiveWeb3React } from '../../hooks'
import { useBlockNumber, useBlockHash } from '../../state/application/hooks'
import {
  computeSlippageAdjustedAmounts,
  computeTradePriceBreakdown,
  formatExecutionPrice,
  warningSeverity
} from '../../utils/prices'
import { ButtonError } from '../Button'
import { AutoColumn } from '../Column'
import QuestionHelper from '../QuestionHelper'
import { AutoRow, RowBetween, RowFixed } from '../Row'
import FormattedPriceImpact from './FormattedPriceImpact'
import { StyledBalanceMaxMini, SwapCallbackError } from './styleds'
import * as ethjs from 'ethereumjs-util'
import BigNumber from 'bignumber.js'

import ProgressBar from '@ramonak/react-progress-bar'

export default function SwapModalFooter({
  trade,
  onConfirm,
  allowedSlippage,
  swapErrorMessage,
  disabledConfirm
}: {
  trade: Trade
  allowedSlippage: number
  onConfirm: () => void
  swapErrorMessage: string | undefined
  disabledConfirm: boolean
}) {
  // console.log(trade);
  const { account } = useActiveWeb3React()
  const blockNumber = (useBlockNumber() ?? 1) - 1
  const blockHash = useBlockHash() ?? ''

  const [showInverted, setShowInverted] = useState<boolean>(false)
  const [progressBarValue, setProgressBarValue] = useState<number>(0)
  const [vdfReady, setVdfReady] = useState<boolean>(false)
  const [, setVdf] = useState<string>('')

  const theme = useContext(ThemeContext)
  const slippageAdjustedAmounts = useMemo(() => computeSlippageAdjustedAmounts(trade, allowedSlippage), [
    allowedSlippage,
    trade
  ])
  const { priceImpactWithoutFee, realizedLPFee } = useMemo(() => computeTradePriceBreakdown(trade), [trade])
  const severity = warningSeverity(priceImpactWithoutFee)

  type Numberish = string | number | bigint | { toString(b?: number): string }

  function toBigInt(n: Numberish): bigint {
    if (typeof n === 'bigint') {
      return n
    }
    if (typeof n === 'number') {
      return BigInt(n)
    }
    if (typeof n === 'string') {
      return BigInt(n)
    }
    return BigInt(n.toString(10))
  }

  function numberToBuffer(n: Numberish): Buffer {
    return ethjs.toBuffer(new ethjs.BN(toBigInt(n).toString(10)))
  }

  function delay(time: number) {
    return new Promise(resolve => setTimeout(resolve, time))
  }

  async function generateVdf(opts: {
    n: BigNumber
    t: number
    origin: string
    path: string[]
    knownQtyIn: BigNumber
    knownQtyOut: BigNumber
    blockHash: string
    blockNumber: number
  }): Promise<string> {
    const seed = generateSeed(opts.origin, opts.path, opts.knownQtyIn, opts.knownQtyOut)
    const x = generateX(opts.n, seed, opts.blockHash)
    setProgressBarValue(20)
    await delay(1000)
    const y = evaluateVdf(x, opts.n, opts.t)
    setProgressBarValue(33)
    await delay(1000)
    const c = generateChallenge({ x, y, n: opts.n, t: opts.t })
    setProgressBarValue(66)
    await delay(1000)
    const pi = generateProof(x, c, opts.n, opts.t)
    const vdfResult = ethjs.bufferToHex(
      Buffer.concat([
        ethjs.setLengthLeft(numberToBuffer(pi), 32),
        ethjs.setLengthLeft(numberToBuffer(y), 32),
        ethjs.setLengthLeft(numberToBuffer(opts.blockNumber), 32)
      ])
    )
    setVdf(vdfResult)
    setVdfReady(true)
    setProgressBarValue(100)
    await delay(1000)
    return vdfResult
  }

  useEffect(() => {
    const N = new BigNumber('44771746775035800231893057667067514385523709770528832291415080542575843241867')
    const T = 16000000
    const origin = account === undefined || account === null ? '' : account
    let knownQtyIn: BigNumber
    let knownQtyOut: BigNumber

    if (trade.tradeType === TradeType.EXACT_INPUT) {
      // known quantity in
      knownQtyIn = new BigNumber(
        Number(trade.inputAmount.toExact()) * Math.pow(10, trade.inputAmount.currency.decimals)
      )
      knownQtyOut = new BigNumber(0)
    } else {
      // known quantity out
      knownQtyOut = new BigNumber(
        Number(trade.outputAmount.toExact()) * Math.pow(10, trade.outputAmount.currency.decimals)
      )
      knownQtyIn = new BigNumber(0)
    }

    const path = trade.route.path.map(i => i.address)

    const runVdfGenerator = async () => {
      await delay(200)
      await generateVdf({
        n: N,
        t: T,
        blockHash,
        blockNumber,
        knownQtyIn,
        knownQtyOut,
        origin,
        path
      })
      // console.log(isValidVdf({n: N, t: T, origin, path, knownQtyIn, knownQtyOut, blockHash, proof}));
    }

    runVdfGenerator()
    // eslint-disable-next-line
  }, [])

  return (
    <>
      <AutoColumn gap="0px">
        <RowBetween align="center">
          <Text fontWeight={400} fontSize={14} color={theme.text2}>
            Price
          </Text>
          <Text
            fontWeight={500}
            fontSize={14}
            color={theme.text1}
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              textAlign: 'right',
              paddingLeft: '10px'
            }}
          >
            {formatExecutionPrice(trade, showInverted)}
            <StyledBalanceMaxMini onClick={() => setShowInverted(!showInverted)}>
              <Repeat size={14} />
            </StyledBalanceMaxMini>
          </Text>
        </RowBetween>

        <RowBetween>
          <RowFixed>
            <TYPE.black fontSize={14} fontWeight={400} color={theme.text2}>
              {trade.tradeType === TradeType.EXACT_INPUT ? 'Minimum received' : 'Maximum sold'}
            </TYPE.black>
            <QuestionHelper text="Your transaction will revert if there is a large, unfavorable price movement before it is confirmed." />
          </RowFixed>
          <RowFixed>
            <TYPE.black fontSize={14}>
              {trade.tradeType === TradeType.EXACT_INPUT
                ? slippageAdjustedAmounts[Field.OUTPUT]?.toSignificant(4) ?? '-'
                : slippageAdjustedAmounts[Field.INPUT]?.toSignificant(4) ?? '-'}
            </TYPE.black>
            <TYPE.black fontSize={14} marginLeft={'4px'}>
              {trade.tradeType === TradeType.EXACT_INPUT
                ? trade.outputAmount.currency.symbol
                : trade.inputAmount.currency.symbol}
            </TYPE.black>
          </RowFixed>
        </RowBetween>
        <RowBetween>
          <RowFixed>
            <TYPE.black color={theme.text2} fontSize={14} fontWeight={400}>
              Price Impact
            </TYPE.black>
            <QuestionHelper text="The difference between the market price and your price due to trade size." />
          </RowFixed>
          <FormattedPriceImpact priceImpact={priceImpactWithoutFee} />
        </RowBetween>
        <RowBetween>
          <RowFixed>
            <TYPE.black fontSize={14} fontWeight={400} color={theme.text2}>
              Liquidity Provider Fee
            </TYPE.black>
            <QuestionHelper text="A portion of each trade (0.30%) goes to liquidity providers as a protocol incentive." />
          </RowFixed>
          <TYPE.black fontSize={14}>
            {realizedLPFee ? realizedLPFee?.toSignificant(6) + ' ' + trade.inputAmount.currency.symbol : '-'}
          </TYPE.black>
        </RowBetween>
      </AutoColumn>

      <RowBetween>
        <RowFixed>
          <TYPE.black fontSize={14} fontWeight={400} color={theme.text2}>
            {'VDF Generation'}
          </TYPE.black>
          <QuestionHelper text="Your VDF is currently being generated. Once the VDF is generated, you will be able to confirm your swap. Please wait for the progress bar to reach the end." />
        </RowFixed>
        <RowFixed>
          {vdfReady ? (
            <TYPE.blue fontSize={14}>{'Ready'}</TYPE.blue>
          ) : (
            <TYPE.blue fontSize={14}>{'In Progress'}</TYPE.blue>
          )}
        </RowFixed>
      </RowBetween>

      <ProgressBar
        completed={progressBarValue}
        labelSize={'12px'}
        transitionDuration={'0.2s'}
        labelAlignment={'outside'}
        labelColor={'#6a1b9a'}
      />

      <AutoRow>
        <ButtonError
          onClick={onConfirm}
          disabled={!(!disabledConfirm && vdfReady)} // needs disabledConfirm to be false + vdfReady to be true for the button to work
          error={severity > 2}
          style={{ margin: '10px 0 0 0' }}
          id="confirm-swap-or-send"
        >
          <Text fontSize={20} fontWeight={500}>
            {severity > 2 ? 'Swap Anyway' : 'Confirm Swap'}
          </Text>
        </ButtonError>

        {swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
      </AutoRow>
    </>
  )
}
