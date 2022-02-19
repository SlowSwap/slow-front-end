import { createReducer, nanoid } from '@reduxjs/toolkit'
import { addPopup, PopupContent, removePopup, updateBlock, ApplicationModal, setOpenModal } from './actions'

type PopupList = Array<{ key: string; show: boolean; content: PopupContent; removeAfterMs: number | null }>

export interface ApplicationState {
  readonly blockNumber: { readonly [chainId: number]: number }
  readonly blockHash: { readonly [chainId: string]: string }
  readonly popupList: PopupList
  readonly openModal: ApplicationModal | null
}

const initialState: ApplicationState = {
  blockNumber: {},
  blockHash: {},
  popupList: [],
  openModal: null
}

export default createReducer(initialState, builder =>
  builder
    .addCase(updateBlock, (state, action) => {
      const { chainId, blockNumber, blockHash } = action.payload
      if (typeof state.blockNumber[chainId] !== 'number') {
        state.blockNumber[chainId] = blockNumber
      } else {
        state.blockNumber[chainId] = Math.max(blockNumber, state.blockNumber[chainId])
      }
      if (typeof state.blockHash[chainId] !== 'string') {
        state.blockHash[chainId] = blockHash
      } else {
        state.blockHash[chainId] = blockHash
      }
    })
    .addCase(setOpenModal, (state, action) => {
      state.openModal = action.payload
    })
    .addCase(addPopup, (state, { payload: { content, key, removeAfterMs = 15000 } }) => {
      state.popupList = (key ? state.popupList.filter(popup => popup.key !== key) : state.popupList).concat([
        {
          key: key || nanoid(),
          show: true,
          content,
          removeAfterMs
        }
      ])
    })
    .addCase(removePopup, (state, { payload: { key } }) => {
      state.popupList.forEach(p => {
        if (p.key === key) {
          p.show = false
        }
      })
    })
)
