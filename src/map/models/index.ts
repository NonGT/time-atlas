import { batch_a } from './batch-a'
import { batch_b } from './batch-b'
import { batch_c } from './batch-c'
import { batch_d } from './batch-d'
import { batch_e } from './batch-e'
import { batch_f } from './batch-f'
import { batch_g } from './batch-g'
import { batch_h } from './batch-h'
import { batch_i } from './batch-i'
import { batch_j } from './batch-j'
import { classical } from './classical'
import { thai } from './thai'
import { sites } from './sites'
import { versailles } from './versailles'
import type { Builder } from './kit'

/** Building-specific models keyed by landmark id. */
export const MODELS: Record<string, Builder> = { ...classical, ...batch_a, ...batch_b, ...batch_c, ...batch_d, ...batch_e, ...batch_f, ...batch_g, ...batch_h, ...batch_i, ...batch_j, ...thai, ...sites, 'palace-of-versailles': versailles }
