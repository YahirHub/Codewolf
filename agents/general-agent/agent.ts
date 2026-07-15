import { createGeneralAgent } from './general-agent'

const definition = {
  ...createGeneralAgent({ variant: 'default' }),
  id: 'agent',
}

export default definition
