import { createGeneralAgent } from './general-agent'

const definition = {
  ...createGeneralAgent({ variant: 'opus' }),
  id: 'opus-agent',
}

export default definition
