import type { StationId } from '../levels';
import type { Station } from '../types';
import { cards } from './cards';
import { diff } from './diff';
import { missing } from './missing';
import { sequence } from './sequence';
import { tubes } from './tubes';

export const STATIONS: Readonly<Record<StationId, Station>> = { cards, missing, sequence, tubes, diff };
