import { applyCliEnvironmentDefaults } from './cli-env-defaults'

applyCliEnvironmentDefaults(process.env.NODE_ENV === 'test' ? 'test' : 'dev')
