import { batch_a } from './batch-a'
import { batch_b } from './batch-b'
import { batch_c } from './batch-c'
import { batch_d } from './batch-d'
import { batch_e } from './batch-e'
import { classical } from './classical'
import { thai } from './thai'
import type { Builder } from './kit'

/** Building-specific models keyed by landmark id. */
export const MODELS: Record<string, Builder> = { ...classical, ...batch_a, ...batch_b, ...batch_c, ...batch_d, ...batch_e, ...thai }
