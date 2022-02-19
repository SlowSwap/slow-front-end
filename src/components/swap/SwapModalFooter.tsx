import crypto from 'crypto'
import { Trade, TradeType } from '@uniswap/sdk'
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
import { getRouterContract } from '../../utils'
import { ButtonError } from '../Button'
import { AutoColumn } from '../Column'
import QuestionHelper from '../QuestionHelper'
import { AutoRow, RowBetween, RowFixed } from '../Row'
import FormattedPriceImpact from './FormattedPriceImpact'
import { StyledBalanceMaxMini, SwapCallbackError } from './styleds'
import BigNumber from 'bignumber.js'
// eslint-disable-next-line import/no-webpack-loader-syntax
import VdfWorker from 'worker-loader!../../workers/vdf.ts'

import ProgressBar from '@ramonak/react-progress-bar'

interface VdfWorkerOutput {
  id: string
  progress: number
  proof?: string
}

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
  const { chainId, account, library } = useActiveWeb3React()

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
  const blockNumber = (useBlockNumber() ?? 1)
  const blockHash = useBlockHash() ?? ''

  useEffect(() => {
    const origin = account === undefined || account === null ? '' : account
    let N;
    let T;
    let knownQtyIn: string
    let knownQtyOut: string

    if (trade.tradeType === TradeType.EXACT_INPUT) {
      // known quantity in
      knownQtyIn = new BigNumber(
        Number(trade.inputAmount.toExact()) * Math.pow(10, trade.inputAmount.currency.decimals)
      ).toString(10)
      knownQtyOut = '0'
    } else {
      // known quantity out
      knownQtyOut = new BigNumber(
        Number(trade.outputAmount.toExact()) * Math.pow(10, trade.outputAmount.currency.decimals)
      ).toString(10)
      knownQtyIn = '0'
    }

    const path = trade.route.path.map(t => t.address)
    const router = getRouterContract(chainId!, library!)
    ;(async () => {
      if (!N || !T) {
          [N, T] = await Promise.all([router.N(), router.T()])
      }
      const worker = new VdfWorker()
      worker.addEventListener('message', ev => {
        const output = ev.data as VdfWorkerOutput
        setProgressBarValue(Math.round(output.progress * 100))
        if (output.proof) {
          worker.terminate()
          setVdf(output.proof)
          localStorage.setItem('vdf', output.proof)
          setVdfReady(true)
        }
      })
      worker.postMessage({
        id: crypto.randomBytes(32).toString('hex'),
        n: N.toString(),
        t: T.toNumber(),
        blockHash,
        blockNumber,
        knownQtyIn,
        knownQtyOut,
        origin,
        path
      })
    })()
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
